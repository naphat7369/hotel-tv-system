import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { normalizeEvent } from '../src/lib/analytics-normalizer';

const prisma = new PrismaClient();

async function backfill() {
  console.log('[Backfill] Starting backfill of usage_events...');

  const totalUnmigrated = await prisma.usageEvent.count({
    where: { eventId: null }
  });

  console.log(`[Backfill] Found ${totalUnmigrated} legacy events to backfill.`);
  if (totalUnmigrated === 0) {
    console.log('[Backfill] No events require backfilling.');
    return;
  }

  const BATCH_SIZE = 200;
  let processed = 0;

  while (true) {
    const batch = await prisma.usageEvent.findMany({
      where: { eventId: null },
      take: BATCH_SIZE,
      orderBy: { timestamp: 'asc' }
    });

    if (batch.length === 0) break;

    for (const row of batch) {
      let parsedValue: any = {};
      try {
        if (row.value) {
          parsedValue = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
        }
      } catch (e) {
        parsedValue = { raw: row.value };
      }

      const normalized = normalizeEvent({
        eventId: crypto.randomUUID(),
        hotelId: row.hotelId,
        roomId: row.roomId,
        deviceId: row.deviceId,
        eventType: row.eventType,
        value: parsedValue,
        durationSeconds: row.durationSeconds
      });

      const startedAt = normalized?.startedAt || row.timestamp;
      const endedAt = normalized?.endedAt || null;
      const durationSec = normalized?.durationSec ?? row.durationSeconds ?? null;

      await prisma.usageEvent.update({
        where: { id: row.id },
        data: {
          eventId: normalized?.eventId || crypto.randomUUID(),
          category: normalized?.category || 'OTHER',
          itemId: normalized?.itemId || 'unknown',
          itemName: normalized?.itemName || 'Unknown Item',
          startedAt,
          endedAt,
          durationSec,
          extra: normalized?.extra || parsedValue
        }
      });

      processed++;
    }

    console.log(`[Backfill] Migrated ${processed} / ${totalUnmigrated} events...`);
  }

  console.log('[Backfill] Raw events migration completed successfully.');

  // Populate initial hourly summaries
  console.log('[Backfill] Populating initial hourly summaries from backfilled data...');
  const distinctHours = await prisma.$queryRaw<Array<{ hourBucket: Date; hotelId: string }>>`
    SELECT DISTINCT date_trunc('hour', started_at) as "hourBucket", hotel_id as "hotelId"
    FROM usage_events
    WHERE started_at IS NOT NULL
    ORDER BY "hourBucket" ASC
  `;

  console.log(`[Backfill] Found ${distinctHours.length} distinct hour buckets.`);
  for (const bucket of distinctHours) {
    const nextHour = new Date(new Date(bucket.hourBucket).getTime() + 60 * 60 * 1000);
    const aggregates = await prisma.$queryRaw<Array<{
      hotelId: string;
      category: string;
      itemId: string;
      itemName: string;
      eventCount: number;
      totalDurationSec: number;
      uniqueRooms: number;
    }>>`
      SELECT 
        hotel_id as "hotelId",
        category,
        item_id as "itemId",
        item_name as "itemName",
        COUNT(*)::int as "eventCount",
        COALESCE(SUM(duration_sec), 0)::int as "totalDurationSec",
        COUNT(DISTINCT room_id)::int as "uniqueRooms"
      FROM usage_events
      WHERE hotel_id = ${bucket.hotelId}
        AND started_at >= ${bucket.hourBucket}
        AND started_at < ${nextHour}
        AND category IS NOT NULL 
        AND item_id IS NOT NULL
      GROUP BY hotel_id, category, item_id, item_name
    `;

    for (const agg of aggregates) {
      await prisma.usageHourlySummary.upsert({
        where: {
          hotelId_hourBucket_category_itemId: {
            hotelId: agg.hotelId,
            hourBucket: bucket.hourBucket,
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
          hourBucket: bucket.hourBucket,
          category: agg.category,
          itemId: agg.itemId,
          itemName: agg.itemName,
          eventCount: agg.eventCount,
          totalDurationSec: agg.totalDurationSec,
          uniqueRooms: agg.uniqueRooms
        }
      });
    }
  }

  // Populate daily summaries from hourly summaries
  console.log('[Backfill] Populating initial daily summaries...');
  const distinctDays = await prisma.$queryRaw<Array<{ dateBucket: Date; hotelId: string }>>`
    SELECT DISTINCT date_trunc('day', hour_bucket) as "dateBucket", hotel_id as "hotelId"
    FROM usage_hourly_summary
    ORDER BY "dateBucket" ASC
  `;

  for (const day of distinctDays) {
    const nextDay = new Date(new Date(day.dateBucket).getTime() + 24 * 60 * 60 * 1000);
    const dailyAggregates = await prisma.$queryRaw<Array<{
      hotelId: string;
      category: string;
      itemId: string;
      itemName: string;
      eventCount: number;
      totalDurationSec: number;
      uniqueRooms: number;
    }>>`
      SELECT 
        hotel_id as "hotelId",
        category,
        item_id as "itemId",
        MAX(item_name) as "itemName",
        SUM(event_count)::int as "eventCount",
        SUM(total_duration_sec)::int as "totalDurationSec",
        MAX(unique_rooms)::int as "uniqueRooms"
      FROM usage_hourly_summary
      WHERE hotel_id = ${day.hotelId}
        AND hour_bucket >= ${day.dateBucket}
        AND hour_bucket < ${nextDay}
      GROUP BY hotel_id, category, item_id
    `;

    for (const agg of dailyAggregates) {
      await prisma.usageDailySummary.upsert({
        where: {
          hotelId_dateBucket_category_itemId: {
            hotelId: agg.hotelId,
            dateBucket: day.dateBucket,
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
          dateBucket: day.dateBucket,
          category: agg.category,
          itemId: agg.itemId,
          itemName: agg.itemName,
          eventCount: agg.eventCount,
          totalDurationSec: agg.totalDurationSec,
          uniqueRooms: agg.uniqueRooms
        }
      });
    }
  }

  console.log('[Backfill] Backfill and rollup generation fully completed!');
}

backfill()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
