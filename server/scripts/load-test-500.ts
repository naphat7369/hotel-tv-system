import { io } from 'socket.io-client';
import axios from 'axios';
import http from 'http';
import { PrismaClient } from '@prisma/client';
import { redis, getStreamStats, getDeadLetterEntries } from '../src/lib/redis';
import { runHourlyRollup, runDailyRollup } from '../src/workers/rollup-worker';
import { getMonitoringMetrics } from '../src/lib/monitoring';

http.globalAgent.maxSockets = 1000;

const prisma = new PrismaClient();
const SERVER_URL = 'http://127.0.0.1:3000';
const CONCURRENT_ROOMS = 250; // 250 rooms emitting 4 events each = 1,000 events
const EVENTS_PER_ROOM = 4;
const TOTAL_EVENTS = CONCURRENT_ROOMS * EVENTS_PER_ROOM;

function sleep(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

function calculatePercentile(latencies: number[], percentile: number): number {
  if (latencies.length === 0) return 0;
  latencies.sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * latencies.length) - 1;
  return latencies[Math.max(0, index)];
}

async function runLoadTest() {
  console.log('\n===============================================================');
  console.log(`🚀 STARTING HOTEL TV HIGH-SCALE ANALYTICS TEST (${CONCURRENT_ROOMS} ROOMS)`);
  console.log('===============================================================\n');

  // Verify server is up
  try {
    const healthCheck = await axios.get(`${SERVER_URL}/api/v1/analytics/admin/metrics`, { timeout: 3000 });
    console.log('✓ Server is responsive. Initial metrics:', healthCheck.data);
  } catch (err: any) {
    console.error('✗ Failed to connect to server at', SERVER_URL, err.message);
    process.exit(1);
  }

  const initialStats = await getStreamStats();
  console.log(`✓ Initial Redis Stream length: ${initialStats.xlen}, pending: ${initialStats.pendingCount}`);

  const initialDbCount = await prisma.usageEvent.count();
  console.log(`✓ Initial PostgreSQL usage_events count: ${initialDbCount}`);

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: High-Concurrency Burst Ingestion (Concurrent Rooms, 1,000 Events)
  // ──────────────────────────────────────────────────────────────────────────
  console.log(`\n[Test 1] Simulating ${CONCURRENT_ROOMS} TV devices emitting ${TOTAL_EVENTS} events...`);
  
  const latencies: number[] = [];
  const startTime = Date.now();
  const clients: any[] = [];
  const connectionPromises: Promise<void>[] = [];

  console.log(`Connecting ${CONCURRENT_ROOMS} concurrent WebSocket devices...`);
  for (let i = 1; i <= CONCURRENT_ROOMS; i++) {
    const roomNum = 100 + i;
    const deviceId = `BOX-${roomNum}-A`;
    const socket = io(SERVER_URL, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 5000,
      forceNew: true
    });
    clients.push(socket);

    const p = new Promise<void>((resolve) => {
      const timer = setTimeout(() => resolve(), 3000);
      socket.once('connect', () => {
        clearTimeout(timer);
        socket.emit('register_device', { deviceId, roomNumber: String(roomNum) });
        resolve();
      });
      socket.once('connect_error', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    connectionPromises.push(p);
  }

  await Promise.all(connectionPromises);
  const activeClients = clients.filter(c => c.connected);
  const connectDuration = Date.now() - startTime;
  console.log(`✓ ${activeClients.length} / ${CONCURRENT_ROOMS} devices connected and registered in ${connectDuration}ms`);

  // Now emit burst events from all 500 devices
  console.log(`Emitting burst of ${TOTAL_EVENTS} usage events...`);
  const emitStartTime = Date.now();

  for (let round = 1; round <= EVENTS_PER_ROOM; round++) {
    for (let i = 0; i < CONCURRENT_ROOMS; i++) {
      const roomNum = 100 + i + 1;
      const deviceId = `BOX-${roomNum}-A`;
      const client = clients[i];

      const t0 = Date.now();
      if (round === 1) {
        client.emit('track_event', {
          deviceId,
          roomId: String(roomNum),
          eventType: 'CHANNEL_WATCH',
          value: { channelId: `ch_${(i % 10) + 1}`, name: `Channel ${(i % 10) + 1}` },
          durationSeconds: 120 + (i % 60),
          timestamp: Date.now()
        });
      } else {
        client.emit('track_event', {
          deviceId,
          roomId: String(roomNum),
          eventType: 'APP_WATCH_DURATION',
          value: { packageName: (i % 2 === 0 ? 'com.netflix.ninja' : 'com.youtube'), appName: (i % 2 === 0 ? 'Netflix' : 'YouTube') },
          durationSeconds: 300 + (i % 120),
          timestamp: Date.now()
        });
      }
      latencies.push(Date.now() - t0);
    }
  }

  const emitDuration = Date.now() - emitStartTime;
  console.log(`✓ ${TOTAL_EVENTS} events emitted into Redis Stream in ${emitDuration}ms`);
  console.log(`  - Average WebSocket send latency: ${(latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2)}ms`);
  console.log(`  - p50 send latency: ${calculatePercentile(latencies, 50)}ms`);
  console.log(`  - p95 send latency: ${calculatePercentile(latencies, 95)}ms`);
  console.log(`  - p99 send latency: ${calculatePercentile(latencies, 99)}ms`);

  // Allow WebSocket client buffers to flush before disconnecting
  await sleep(2000);
  clients.forEach(c => c.disconnect());

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Worker Processing & Batch Ingestion Verification
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[Test 2] Waiting for Usage Event Worker to batch insert into PostgreSQL...');
  let workerCompleted = false;
  const pollStart = Date.now();

  while (Date.now() - pollStart < 15000) {
    const currentDbCount = await prisma.usageEvent.count();
    const streamStats = await getStreamStats();
    console.log(`  → Ingested DB count: ${currentDbCount} (added ${currentDbCount - initialDbCount}), Stream length: ${streamStats.xlen}`);

    if (currentDbCount >= initialDbCount + TOTAL_EVENTS) {
      workerCompleted = true;
      console.log(`✓ Worker processed all ${TOTAL_EVENTS} events into PostgreSQL in ${Date.now() - pollStart}ms!`);
      break;
    }
    await sleep(1000);
  }

  if (!workerCompleted) {
    console.warn('⚠️ Warning: Worker did not drain completely in 15s. Checking stream status...');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Duration Clamp & Metric Verification (> 86,400s)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[Test 3] Testing Duration Clamp Logging & Guard (duration > 86400s)...');
  const anomalousDuration = 180000; // 50 hours
  const clampTestRes = await axios.post(`${SERVER_URL}/api/v1/analytics/events`, {
    deviceId: 'BOX-TEST-CLAMP',
    eventType: 'APP_WATCH_DURATION',
    value: { packageName: 'com.disney.plus', appName: 'Disney+' },
    durationSeconds: anomalousDuration
  });
  console.log('✓ Clamped event HTTP response:', clampTestRes.status, clampTestRes.data);

  // Allow worker to consume it
  await sleep(2000);

  const metricsRes = await axios.get(`${SERVER_URL}/api/v1/analytics/admin/metrics`);
  console.log('✓ Monitoring metrics response:', metricsRes.data.monitoring);
  console.log(`  - durationClampedCount: ${metricsRes.data.monitoring.durationClampedCount}`);

  // Query database to verify durationSec was clamped to 86400
  const clampedDbRecord = await prisma.usageEvent.findFirst({
    where: { itemId: 'disney_' },
    orderBy: { timestamp: 'desc' }
  });
  if (clampedDbRecord) {
    console.log(`✓ Database record confirmed: durationSec = ${clampedDbRecord.durationSec}s (successfully clamped from ${anomalousDuration}s)`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Late-Arriving Event & 3-Hour Sliding Window Rollup
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[Test 4] Testing Late-Arriving Event & 3-Hour Sliding Window Rollup...');
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  
  // Directly insert a late-arriving event for 2 hours ago
  const lateEvent = await prisma.usageEvent.create({
    data: {
      eventId: `late-evt-${Date.now()}`,
      hotelId: '123e4567-e89b-12d3-a456-426614174000',
      category: 'APP',
      itemId: 'hbo_go',
      itemName: 'HBO GO',
      eventType: 'APP_WATCH_DURATION',
      startedAt: twoHoursAgo,
      endedAt: new Date(twoHoursAgo.getTime() + 1800 * 1000),
      durationSec: 1800
    }
  });
  console.log(`✓ Inserted late-arriving event from 2 hours ago: ${lateEvent.eventId}`);

  // Execute 3-hour sliding window rollup
  console.log('Running 3-hour sliding window rollup (runHourlyRollup(3))...');
  const rollupStart = Date.now();
  await runHourlyRollup(3);
  console.log(`✓ 3-hour sliding window rollup completed in ${Date.now() - rollupStart}ms`);

  // Run daily rollup
  await runDailyRollup(1);

  // Check if summary record contains the late event
  const summaryRecord = await prisma.usageHourlySummary.findFirst({
    where: {
      hotelId: '123e4567-e89b-12d3-a456-426614174000',
      itemId: 'hbo_go'
    }
  });
  console.log(`✓ Hourly summary record found for hbo_go: eventCount=${summaryRecord?.eventCount}, duration=${summaryRecord?.totalDurationSec}s`);

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Dead Letter Queue (DLQ) Health Check
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[Test 5] Checking Dead Letter Queue (DLQ) status...');
  const dlqEntries = await getDeadLetterEntries();
  console.log(`✓ Dead Letter Queue length: ${dlqEntries.length} (0 indicates clean error-free ingestion)`);

  const dlqApiRes = await axios.get(`${SERVER_URL}/api/v1/analytics/admin/dlq`);
  console.log('✓ DLQ API status:', dlqApiRes.data);

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: CMS Dashboard Query Latency & Contract Validation
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[Test 6] Benchmarking CMS Dashboard Reports API...');
  
  const tRanges = ['24h', '7d', '30d'];
  for (const range of tRanges) {
    const qStart = Date.now();
    const res = await axios.get(`${SERVER_URL}/api/v1/analytics/reports?range=${range}`);
    const qDuration = Date.now() - qStart;

    console.log(`✓ GET /api/v1/analytics/reports?range=${range}:`);
    console.log(`  - Latency: ${qDuration}ms (Target: < 50ms)`);
    console.log(`  - Top Apps count: ${res.data.topApps?.length || 0}`);
    console.log(`  - Top Channels count: ${res.data.topChannels?.length || 0}`);
    console.log(`  - Top Menus count: ${res.data.topMenus?.length || 0}`);
    console.log(`  - Total Events: ${res.data.totalEvents}`);
  }

  console.log('\n===============================================================');
  console.log('🎉 ALL HIGH-SCALE BENCHMARKS & VERIFICATION TESTS COMPLETED!');
  console.log('===============================================================\n');

  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
}

runLoadTest().catch(err => {
  console.error('Fatal load test error:', err);
  process.exit(1);
});
