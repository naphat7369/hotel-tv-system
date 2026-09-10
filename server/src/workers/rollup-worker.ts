import { PrismaClient } from '@prisma/client';
import { sendAlert } from '../lib/monitoring';
import { trimProcessedStreamEntries, checkStaleDeadLetterEntries } from '../lib/redis';

const prisma = new PrismaClient();

interface HourlyAggregate {
  hotelId: string;
  hourBucket: Date;
  category: string;
  itemId: string;
  itemName: string;
  eventCount: number;
  totalDurationSec: number;
  uniqueRooms: number;
}

interface DailyAggregate {
  hotelId: string;
  dateBucket: Date;
  category: string;
  itemId: string;
  itemName: string;
  eventCount: number;
  totalDurationSec: number;
  uniqueRooms: number;
}

/**
 * 3-Hour Sliding Window Hourly Rollup
 * Re-aggregates the past 3 hours to capture late-arriving events
 */
export async function runHourlyRollup(lookbackHours = 3): Promise<number> {
  const now = new Date();
  const currentHourEnd = new Date(Math.floor(now.getTime() / (60 * 60 * 1000)) * 60 * 60 * 1000);
  const windowStart = new Date(currentHourEnd.getTime() - lookbackHours * 60 * 60 * 1000);

  console.log(`[Rollup] Running hourly rollup window: ${windowStart.toISOString()} to ${currentHourEnd.toISOString()}`);
  const startTime = Date.now();

  try {
    const aggregates = await prisma.$queryRaw<HourlyAggregate[]>`
      SELECT 
        hotel_id as "hotelId",
        date_trunc('hour', started_at) as "hourBucket",
        category,
        item_id as "itemId",
        MAX(item_name) as "itemName",
        COUNT(*)::int as "eventCount",
        COALESCE(SUM(duration_sec), 0)::int as "totalDurationSec",
        COUNT(DISTINCT room_id)::int as "uniqueRooms"
      FROM usage_events
      WHERE started_at >= ${windowStart}
        AND started_at < ${currentHourEnd}
        AND category IS NOT NULL 
        AND item_id IS NOT NULL
      GROUP BY hotel_id, date_trunc('hour', started_at), category, item_id
    `;

    for (const agg of aggregates) {
      await prisma.usageHourlySummary.upsert({
        where: {
          hotelId_hourBucket_category_itemId: {
            hotelId: agg.hotelId,
            hourBucket: agg.hourBucket,
            category: agg.category,
            itemId: agg.itemId
          }
        },
        update: {
          itemName: agg.itemName,
          eventCount: agg.eventCount,
          totalDurationSec: agg.totalDurationSec,
          uniqueRooms: agg.uniqueRooms
        },
        create: {
          hotelId: agg.hotelId,
          hourBucket: agg.hourBucket,
          category: agg.category,
          itemId: agg.itemId,
          itemName: agg.itemName,
          eventCount: agg.eventCount,
          totalDurationSec: agg.totalDurationSec,
          uniqueRooms: agg.uniqueRooms
        }
      });
    }

    const duration = Date.now() - startTime;
    console.log(`[Rollup] Upserted ${aggregates.length} hourly rollup summaries in ${duration}ms`);
    return aggregates.length;

  } catch (err: any) {
    console.error('[Rollup] Error running hourly rollup:', err.message);
    await sendAlert({
      type: 'ROLLUP_FAILURE',
      message: `Hourly rollup failed: ${err.message}`,
      severity: 'critical'
    });
    throw err;
  }
}

/**
 * Daily Rollup
 * Aggregates UsageHourlySummary into UsageDailySummary
 */
export async function runDailyRollup(targetDate?: Date | number): Promise<number> {
  let target: Date;
  if (targetDate instanceof Date) {
    target = targetDate;
  } else if (typeof targetDate === 'number') {
    target = new Date(Date.now() - targetDate * 24 * 60 * 60 * 1000);
  } else {
    target = new Date(Date.now() - 24 * 60 * 60 * 1000); // Defaults to yesterday
  }
  const dayStart = new Date(Math.floor(target.getTime() / (24 * 60 * 60 * 1000)) * 24 * 60 * 60 * 1000);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  console.log(`[Rollup] Running daily rollup for ${dayStart.toISOString().slice(0, 10)}...`);

  try {
    const dailyAggregates = await prisma.$queryRaw<DailyAggregate[]>`
      SELECT 
        hotel_id as "hotelId",
        date_trunc('day', hour_bucket) as "dateBucket",
        category,
        item_id as "itemId",
        MAX(item_name) as "itemName",
        SUM(event_count)::int as "eventCount",
        SUM(total_duration_sec)::int as "totalDurationSec",
        MAX(unique_rooms)::int as "uniqueRooms"
      FROM usage_hourly_summary
      WHERE hour_bucket >= ${dayStart}
        AND hour_bucket < ${dayEnd}
      GROUP BY hotel_id, date_trunc('day', hour_bucket), category, item_id
    `;

    for (const agg of dailyAggregates) {
      await prisma.usageDailySummary.upsert({
        where: {
          hotelId_dateBucket_category_itemId: {
            hotelId: agg.hotelId,
            dateBucket: agg.dateBucket,
            category: agg.category,
            itemId: agg.itemId
          }
        },
        update: {
          itemName: agg.itemName,
          eventCount: agg.eventCount,
          totalDurationSec: agg.totalDurationSec,
          uniqueRooms: agg.uniqueRooms
        },
        create: {
          hotelId: agg.hotelId,
          dateBucket: agg.dateBucket,
          category: agg.category,
          itemId: agg.itemId,
          itemName: agg.itemName,
          eventCount: agg.eventCount,
          totalDurationSec: agg.totalDurationSec,
          uniqueRooms: agg.uniqueRooms
        }
      });
    }

    console.log(`[Rollup] Upserted ${dailyAggregates.length} daily rollup summaries.`);
    return dailyAggregates.length;

  } catch (err: any) {
    console.error('[Rollup] Error running daily rollup:', err.message);
    await sendAlert({
      type: 'DAILY_ROLLUP_FAILURE',
      message: `Daily rollup failed: ${err.message}`,
      severity: 'critical'
    });
    throw err;
  }
}

/**
 * Daily Reconciliation Sweep
 * Full re-sweep of the previous 24 hours to catch any edge-case delay
 */
export async function runDailyReconciliation(): Promise<void> {
  console.log('[Reconciliation] Running daily full sweep reconciliation...');
  try {
    // Re-run the last 24 hours of hourly rollups
    await runHourlyRollup(24);
    // Re-run daily rollup for yesterday and today
    await runDailyRollup(new Date(Date.now() - 24 * 60 * 60 * 1000));
    await runDailyRollup(new Date());
    console.log('[Reconciliation] Reconciliation sweep completed successfully.');
  } catch (err: any) {
    console.error('[Reconciliation] Reconciliation failed:', err.message);
  }
}

/**
 * Retention Cleanup
 * Batch deletes old raw events (90 days) and old hourly summaries (365 days)
 */
export async function runRetentionCleanup(): Promise<void> {
  console.log('[Retention] Running scheduled data retention cleanup...');
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  // 1. Batch delete raw usage_events
  let totalDeletedEvents = 0;
  while (true) {
    const staleEvents = await prisma.usageEvent.findMany({
      where: { startedAt: { lt: ninetyDaysAgo } },
      select: { id: true },
      take: 10000
    });

    if (staleEvents.length === 0) break;

    const ids = staleEvents.map(e => e.id);
    const delResult = await prisma.usageEvent.deleteMany({
      where: { id: { in: ids } }
    });

    totalDeletedEvents += delResult.count;
    console.log(`[Retention] Batch deleted ${totalDeletedEvents} raw events...`);
    if (delResult.count < 10000) break;
  }

  // 2. Batch delete old hourly summaries
  const deletedHourly = await prisma.usageHourlySummary.deleteMany({
    where: { hourBucket: { lt: oneYearAgo } }
  });
  console.log(`[Retention] Deleted ${deletedHourly.count} hourly summaries older than 365 days.`);

  // 3. Maintenance on Redis Stream & DLQ
  await trimProcessedStreamEntries(100000);
  await checkStaleDeadLetterEntries();
}
