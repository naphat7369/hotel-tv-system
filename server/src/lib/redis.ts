import Redis from 'ioredis';
import { sendAlert } from './monitoring';

export const USAGE_STREAM = 'usage_events_stream';
export const USAGE_GROUP = 'usage_worker_group';
export const USAGE_DEAD_LETTER_STREAM = 'usage_events_stream:dead';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6380';

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000);
    return delay;
  },
  reconnectOnError(err) {
    console.error('[Redis] Connection error:', err.message);
    return true;
  }
});

redis.on('connect', () => {
  console.log('[Redis] Connected successfully to', redisUrl);
});

redis.on('error', (err) => {
  console.error('[Redis] Client error:', err.message);
});

/**
 * Ensures the stream and consumer group exist
 */
export async function initRedisConsumerGroup(): Promise<void> {
  try {
    // MKSTREAM ensures the stream is created if it does not exist
    await redis.xgroup('CREATE', USAGE_STREAM, USAGE_GROUP, '0', 'MKSTREAM');
    console.log(`[Redis] Consumer group '${USAGE_GROUP}' initialized on '${USAGE_STREAM}'`);
  } catch (err: any) {
    if (err.message && err.message.includes('BUSYGROUP')) {
      // Group already exists, this is completely normal
      return;
    }
    console.error('[Redis] Failed to initialize consumer group:', err.message);
  }
}

/**
 * Adds an event to the Redis Stream with backpressure handling
 */
export async function addUsageEventToStream(eventData: Record<string, any>): Promise<string | null> {
  try {
    const entryId = await redis.xadd(
      USAGE_STREAM,
      '*',
      'data',
      JSON.stringify(eventData)
    );
    return entryId;
  } catch (err: any) {
    if (err.message && (err.message.includes('OOM') || err.message.includes('command not allowed when used memory'))) {
      await sendAlert({
        type: 'REDIS_OOM',
        message: `Redis memory is full! XADD rejected for device ${eventData.deviceId || 'unknown'}. Worker is lagging behind.`,
        severity: 'critical',
        hotelId: eventData.hotelId,
        metadata: { stream: USAGE_STREAM, error: err.message }
      });
      throw new Error(`REDIS_OOM: Backpressure active, event rejected (${err.message})`);
    }
    console.error('[Redis] XADD failed:', err.message);
    throw err;
  }
}

/**
 * Trims old entries from the stream
 */
export async function trimProcessedStreamEntries(maxLen = 100000): Promise<number> {
  try {
    const trimmed = await redis.xtrim(USAGE_STREAM, 'MAXLEN', '~', maxLen);
    return trimmed;
  } catch (err: any) {
    console.error('[Redis] Failed to trim stream:', err.message);
    return 0;
  }
}

/**
 * Get stats for Redis Stream and Memory
 */
export async function getStreamStats(): Promise<{
  xlen: number;
  memoryUsed: string;
  memoryMax: string;
  pendingCount: number;
}> {
  try {
    const xlen = await redis.xlen(USAGE_STREAM);
    const pendingSummary = await redis.xpending(USAGE_STREAM, USAGE_GROUP);
    const pendingCount = Array.isArray(pendingSummary) ? (pendingSummary[0] as number) || 0 : 0;

    // Query memory info
    const info = await redis.info('memory');
    const usedMatch = info.match(/used_memory_human:(.+)/);
    const maxMatch = info.match(/maxmemory_human:(.+)/);

    return {
      xlen,
      memoryUsed: usedMatch ? usedMatch[1].trim() : 'unknown',
      memoryMax: maxMatch ? maxMatch[1].trim() : 'unknown',
      pendingCount
    };
  } catch (err: any) {
    return { xlen: -1, memoryUsed: 'error', memoryMax: 'error', pendingCount: -1 };
  }
}

/**
 * Move a failing message to Dead-Letter Stream and ACK it from the main stream
 */
export async function moveToDeadLetter(
  streamId: string,
  rawPayload: any,
  errorMessage: string,
  retryCount: number,
  hotelId?: string
): Promise<string | null> {
  const deadEntryId = await redis.xadd(
    USAGE_DEAD_LETTER_STREAM,
    '*',
    'originalId', streamId,
    'data', typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload),
    'error', errorMessage,
    'retryCount', String(retryCount),
    'failedAt', String(Date.now()),
    'hotelId', hotelId || 'unknown'
  );

  // ACK from the primary stream so it doesn't stay in PEL
  await redis.xack(USAGE_STREAM, USAGE_GROUP, streamId);

  await sendAlert({
    type: 'DLQ_NEW_ENTRY',
    message: `Event ${streamId} failed after ${retryCount} retries. Moved to DLQ: ${errorMessage}`,
    severity: 'warning',
    hotelId,
    metadata: { streamId, deadEntryId, retryCount, errorMessage }
  });

  return deadEntryId;
}

/**
 * Fetch entries from the Dead Letter Stream
 */
export async function getDeadLetterEntries(limit = 100): Promise<Array<{
  id: string;
  originalId: string;
  data: any;
  error: string;
  retryCount: number;
  failedAt: number;
  hotelId: string;
}>> {
  try {
    // Read from start of dead letter stream
    const results = await redis.xrange(USAGE_DEAD_LETTER_STREAM, '-', '+', 'COUNT', limit);
    return results.map(([id, fields]) => {
      const fieldMap: Record<string, string> = {};
      for (let i = 0; i < fields.length; i += 2) {
        fieldMap[fields[i]] = fields[i + 1];
      }

      let parsedData: any = null;
      try {
        parsedData = JSON.parse(fieldMap.data || '{}');
      } catch (e) {
        parsedData = fieldMap.data;
      }

      return {
        id,
        originalId: fieldMap.originalId || id,
        data: parsedData,
        error: fieldMap.error || 'Unknown error',
        retryCount: parseInt(fieldMap.retryCount || '0', 10),
        failedAt: parseInt(fieldMap.failedAt || '0', 10),
        hotelId: fieldMap.hotelId || 'unknown'
      };
    });
  } catch (err: any) {
    console.error('[Redis] Failed to fetch dead letter entries:', err.message);
    return [];
  }
}

/**
 * Requeue entries from DLQ back into the main stream
 */
export async function requeueDeadLetterEntries(ids?: string[]): Promise<number> {
  const entries = await getDeadLetterEntries(500);
  const targets = ids && ids.length > 0
    ? entries.filter(e => ids.includes(e.id))
    : entries;

  let requeuedCount = 0;
  for (const entry of targets) {
    try {
      await addUsageEventToStream(entry.data);
      // Remove from DLQ
      await redis.xdel(USAGE_DEAD_LETTER_STREAM, entry.id);
      requeuedCount++;
    } catch (err: any) {
      console.error(`[Redis] Failed to requeue DLQ entry ${entry.id}:`, err.message);
    }
  }

  return requeuedCount;
}

/**
 * Checks for entries in DLQ older than 24 hours and raises critical alert
 */
export async function checkStaleDeadLetterEntries(): Promise<void> {
  const entries = await getDeadLetterEntries(200);
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const staleEntries = entries.filter(e => e.failedAt && e.failedAt < oneDayAgo);

  if (staleEntries.length > 0) {
    const hotelIds = Array.from(new Set(staleEntries.map(e => e.hotelId)));
    for (const hId of hotelIds) {
      const count = staleEntries.filter(e => e.hotelId === hId).length;
      await sendAlert({
        type: 'DLQ_STALE_ENTRIES',
        message: `${count} event(s) have been stuck in the Dead Letter Queue for over 24 hours without requeue!`,
        severity: 'critical',
        hotelId: hId,
        metadata: { staleCount: count }
      });
    }
  }
}
