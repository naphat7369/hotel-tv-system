import { PrismaClient } from '@prisma/client';
import os from 'os';
import {
  redis,
  USAGE_STREAM,
  USAGE_GROUP,
  initRedisConsumerGroup,
  moveToDeadLetter,
  getStreamStats
} from '../lib/redis';

const prisma = new PrismaClient();
const consumerName = `worker-${process.pid}-${os.hostname()}`;
// Dedicated Redis connection so BLOCK does not delay general commands (XADD, XLEN, etc.)
const workerConsumerRedis = redis.duplicate();

let isRunning = true;
const BATCH_SIZE = 500;
const BLOCK_TIMEOUT_MS = 2000;
const PENDING_IDLE_TIMEOUT_MS = 30000; // 30 seconds

interface StreamMessage {
  id: string;
  data: any;
}

/**
 * Parses raw XREADGROUP / XAUTOCLAIM stream entries
 */
function parseStreamEntries(rawEntries: any[]): StreamMessage[] {
  if (!rawEntries || !Array.isArray(rawEntries)) return [];
  const messages: StreamMessage[] = [];

  for (const entry of rawEntries) {
    if (!entry || entry.length < 2) continue;
    const [id, fields] = entry;
    let eventData: any = null;

    for (let i = 0; i < fields.length; i += 2) {
      if (fields[i] === 'data') {
        try {
          eventData = JSON.parse(fields[i + 1]);
        } catch (e) {
          eventData = fields[i + 1];
        }
      }
    }

    if (eventData) {
      messages.push({ id, data: eventData });
    }
  }

  return messages;
}

/**
 * Process a batch of messages: writes to PostgreSQL via createMany with skipDuplicates
 */
async function processBatch(messages: StreamMessage[]): Promise<void> {
  if (messages.length === 0) return;

  const records = messages.map(m => ({
    eventId: m.data.eventId,
    hotelId: m.data.hotelId,
    roomId: m.data.roomId || null,
    deviceId: m.data.deviceId || null,
    category: m.data.category || 'OTHER',
    itemId: m.data.itemId || 'unknown',
    itemName: m.data.itemName || 'Unknown',
    eventType: m.data.eventType,
    startedAt: new Date(m.data.startedAt || Date.now()),
    endedAt: m.data.endedAt ? new Date(m.data.endedAt) : null,
    durationSec: m.data.durationSec ?? null,
    extra: m.data.extra || null,
    timestamp: new Date()
  }));

  const streamIds = messages.map(m => m.id);

  try {
    const startTime = Date.now();
    const result = await prisma.usageEvent.createMany({
      data: records,
      skipDuplicates: true // Deduplicates using eventId @unique
    });
    const duration = Date.now() - startTime;

    // Acknowledge all inserted entries in Redis
    await redis.xack(USAGE_STREAM, USAGE_GROUP, ...streamIds);
    console.log(`[Worker] Inserted ${result.count} / ${records.length} events in ${duration}ms (Deduplicated: ${records.length - result.count})`);

  } catch (dbErr: any) {
    console.error('[Worker] Batch insert failed, inspecting pending entries for poisoning:', dbErr.message);

    // Fallback: handle entries individually to isolate poison messages
    for (const msg of messages) {
      try {
        await prisma.usageEvent.createMany({
          data: [{
            eventId: msg.data.eventId,
            hotelId: msg.data.hotelId,
            roomId: msg.data.roomId || null,
            deviceId: msg.data.deviceId || null,
            category: msg.data.category || 'OTHER',
            itemId: msg.data.itemId || 'unknown',
            itemName: msg.data.itemName || 'Unknown',
            eventType: msg.data.eventType,
            startedAt: new Date(msg.data.startedAt || Date.now()),
            endedAt: msg.data.endedAt ? new Date(msg.data.endedAt) : null,
            durationSec: msg.data.durationSec ?? null,
            extra: msg.data.extra || null,
            timestamp: new Date()
          }],
          skipDuplicates: true
        });
        await redis.xack(USAGE_STREAM, USAGE_GROUP, msg.id);
      } catch (singleErr: any) {
        // Query pending count to see how many times this message has failed
        try {
          const pendingInfo = await redis.xpending(USAGE_STREAM, USAGE_GROUP, msg.id, msg.id, 1);
          const retries = (pendingInfo && pendingInfo[0] && pendingInfo[0][3]) ? parseInt(pendingInfo[0][3], 10) : 1;

          if (retries >= 5) {
            console.error(`[Worker] Moving poison message ${msg.id} (eventId: ${msg.data.eventId}) to Dead Letter Queue after ${retries} failures`);
            await moveToDeadLetter(msg.id, msg.data, singleErr.message, retries, msg.data.hotelId);
          } else {
            console.warn(`[Worker] Message ${msg.id} failed (attempt ${retries}/5), will retry via PEL`);
          }
        } catch (pendingErr: any) {
          console.error('[Worker] Error checking pending info:', pendingErr.message);
        }
      }
    }
  }
}

/**
 * Reclaim and process pending entries (Worker crash recovery via XAUTOCLAIM)
 */
async function reclaimPendingEntries(): Promise<void> {
  try {
    // XAUTOCLAIM stream group consumer min-idle-time start [COUNT count]
    const claimResult: any = await redis.xautoclaim(
      USAGE_STREAM,
      USAGE_GROUP,
      consumerName,
      PENDING_IDLE_TIMEOUT_MS,
      '0-0',
      'COUNT',
      BATCH_SIZE
    );

    if (claimResult && claimResult.length >= 2) {
      const messages = parseStreamEntries(claimResult[1]);
      if (messages.length > 0) {
        console.log(`[Worker] Reclaimed ${messages.length} pending idle messages from crashed workers`);
        await processBatch(messages);
      }
    }
  } catch (err: any) {
    if (!err.message?.includes('no such key')) {
      console.error('[Worker] Pending entry reclamation error:', err.message);
    }
  }
}

/**
 * Main worker loop
 */
export async function startUsageEventWorker(): Promise<void> {
  console.log(`[Worker] Starting Usage Event Worker (${consumerName})...`);
  await initRedisConsumerGroup();

  let lastReclaimTime = Date.now();

  while (isRunning) {
    try {
      // 1. Every 15 seconds, check for idle pending entries from crashed workers
      if (Date.now() - lastReclaimTime > 15000) {
        await reclaimPendingEntries();
        lastReclaimTime = Date.now();
      }

      // 2. Read new stream entries
      // XREADGROUP GROUP group consumer [COUNT count] [BLOCK ms] STREAMS stream >
      const response: any = await workerConsumerRedis.xreadgroup(
        'GROUP',
        USAGE_GROUP,
        consumerName,
        'COUNT',
        BATCH_SIZE,
        'BLOCK',
        BLOCK_TIMEOUT_MS,
        'STREAMS',
        USAGE_STREAM,
        '>'
      );

      if (response && response.length > 0) {
        const streamData = response[0];
        const rawEntries = streamData[1];
        const messages = parseStreamEntries(rawEntries);

        if (messages.length > 0) {
          await processBatch(messages);
        }
      }

    } catch (err: any) {
      console.error('[Worker] Error in worker event loop:', err.message);
      if (err.message && err.message.includes('NOGROUP')) {
        console.log('[Worker] Consumer group missing, initializing...');
        await initRedisConsumerGroup();
      }
      // Backoff briefly on error before resuming
      await new Promise(res => setTimeout(res, 1000));
    }
  }

  console.log('[Worker] Worker loop stopped.');
}

export function stopUsageEventWorker(): void {
  isRunning = false;
}

// Standalone execution support
if (require.main === module) {
  startUsageEventWorker().catch(err => {
    console.error('[Worker] Fatal worker startup error:', err);
    process.exit(1);
  });
}
