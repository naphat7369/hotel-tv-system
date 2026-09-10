import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { connectedDevices } from '../websocket/socket';
import { getRequestStats } from './request.routes';
import { addUsageEventToStream } from '../lib/redis';
import { normalizeEvent } from '../lib/analytics-normalizer';

const prisma = new PrismaClient();
const router = Router();

const MOCK_HOTEL_ID = '123e4567-e89b-12d3-a456-426614174000';

/**
 * Helper to combine aggregated records by itemId
 */
function mergeItemStats(
  existingMap: Map<string, { name: string; count: number; duration: number }>,
  items: Array<{ itemId: string; itemName: string; eventCount?: number; count?: number; totalDurationSec?: number; duration?: number }>
) {
  for (const item of items) {
    const key = item.itemId;
    const current = existingMap.get(key) || {
      name: item.itemName || key,
      count: 0,
      duration: 0
    };

    current.count += item.eventCount ?? item.count ?? 0;
    current.duration += item.totalDurationSec ?? item.duration ?? 0;
    existingMap.set(key, current);
  }
}

// ── GET /api/v1/analytics/overview ───────────────────────────────────────────
router.get('/overview', async (req: Request, res: Response) => {
  try {
    const allDevices = Array.from(connectedDevices.values());
    const onlineDevices = allDevices.filter(d => d.isOnline);
    const offlineDevices = allDevices.filter(d => !d.isOnline);

    const [totalChannels, activeChannels, topChannels] = await Promise.all([
      prisma.channel.count({ where: { hotelId: MOCK_HOTEL_ID } }),
      prisma.channel.count({ where: { hotelId: MOCK_HOTEL_ID, isActive: true } }),
      prisma.channel.findMany({
        where: { hotelId: MOCK_HOTEL_ID, isActive: true },
        orderBy: { channelNumber: 'asc' },
        take: 5,
        select: { id: true, name: true, channelNumber: true, category: true, logoUrl: true }
      })
    ]);

    const requestStats = getRequestStats();

    const deviceList = allDevices.map(d => ({
      deviceId: d.deviceId,
      roomNumber: d.roomNumber || 'Unassigned',
      isOnline: d.isOnline,
      ipAddress: d.ipAddress,
      wifiSignal: d.wifiSignal,
      lastSeen: d.lastSeen,
      deviceName: d.deviceName
    }));

    res.status(200).json({
      devices: {
        online: onlineDevices.length,
        offline: offlineDevices.length,
        total: allDevices.length,
        list: deviceList
      },
      channels: {
        total: totalChannels,
        active: activeChannels,
        topChannels
      },
      requests: requestStats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Analytics] Error fetching overview:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

/**
 * Helper to compute report data supporting Time Slot and Sub-menu categories
 */
async function computeReportsData(options: {
  daysParam?: string;
  startHour?: number;
  endHour?: number;
}) {
  const { daysParam, startHour, endHour } = options;
  const days = daysParam === 'all' ? 0 : (daysParam ? parseInt(daysParam, 10) : 7);

  const now = new Date();
  const currentHourStart = new Date(Math.floor(now.getTime() / (60 * 60 * 1000)) * 60 * 60 * 1000);

  const isTimeSlotActive = startHour !== undefined && endHour !== undefined && !(startHour === 0 && endHour === 24);

  const channelMap = new Map<string, { name: string; count: number; duration: number }>();
  const appMap = new Map<string, { name: string; count: number; duration: number }>();
  const menuMap = new Map<string, { name: string; count: number; duration: number }>();
  const servicesMap = new Map<string, { name: string; count: number; duration: number }>();
  const diningMap = new Map<string, { name: string; count: number; duration: number }>();
  let totalEvents = 0;

  const hourEventCounts: Record<number, number> = {};
  let totalSlotWatchTimeSec = 0;

  if (isTimeSlotActive) {
    // ── Time Slot Active: Query UsageHourlySummary with hour extraction in Asia/Bangkok
    const dateLimit = days > 0 ? new Date(now.getTime() - days * 24 * 60 * 60 * 1000) : new Date(0);

    const slotRows = startHour! < endHour!
      ? await prisma.$queryRaw<Array<{
          category: string;
          itemId: string;
          itemName: string;
          slotHour: number;
          eventCount: number;
          totalDurationSec: number;
        }>>`
          SELECT 
            category,
            item_id as "itemId",
            MAX(item_name) as "itemName",
            EXTRACT(hour from hour_bucket AT TIME ZONE 'Asia/Bangkok')::int as "slotHour",
            SUM(event_count)::int as "eventCount",
            SUM(total_duration_sec)::int as "totalDurationSec"
          FROM usage_hourly_summary
          WHERE hotel_id = ${MOCK_HOTEL_ID}
            AND hour_bucket >= ${dateLimit}
            AND hour_bucket < ${currentHourStart}
            AND EXTRACT(hour from hour_bucket AT TIME ZONE 'Asia/Bangkok') >= ${startHour}
            AND EXTRACT(hour from hour_bucket AT TIME ZONE 'Asia/Bangkok') < ${endHour}
          GROUP BY category, item_id, EXTRACT(hour from hour_bucket AT TIME ZONE 'Asia/Bangkok')
        `
      : await prisma.$queryRaw<Array<{
          category: string;
          itemId: string;
          itemName: string;
          slotHour: number;
          eventCount: number;
          totalDurationSec: number;
        }>>`
          SELECT 
            category,
            item_id as "itemId",
            MAX(item_name) as "itemName",
            EXTRACT(hour from hour_bucket AT TIME ZONE 'Asia/Bangkok')::int as "slotHour",
            SUM(event_count)::int as "eventCount",
            SUM(total_duration_sec)::int as "totalDurationSec"
          FROM usage_hourly_summary
          WHERE hotel_id = ${MOCK_HOTEL_ID}
            AND hour_bucket >= ${dateLimit}
            AND hour_bucket < ${currentHourStart}
            AND (
              EXTRACT(hour from hour_bucket AT TIME ZONE 'Asia/Bangkok') >= ${startHour}
              OR EXTRACT(hour from hour_bucket AT TIME ZONE 'Asia/Bangkok') < ${endHour}
            )
          GROUP BY category, item_id, EXTRACT(hour from hour_bucket AT TIME ZONE 'Asia/Bangkok')
        `;

    for (const row of slotRows) {
      totalEvents += row.eventCount;
      hourEventCounts[row.slotHour] = (hourEventCounts[row.slotHour] || 0) + row.eventCount;
      if (row.category === 'CHANNEL' || row.category === 'APP') {
        totalSlotWatchTimeSec += row.totalDurationSec;
      }

      const item = [{ itemId: row.itemId, itemName: row.itemName, eventCount: row.eventCount, totalDurationSec: row.totalDurationSec }];
      if (row.category === 'CHANNEL') mergeItemStats(channelMap, item);
      else if (row.category === 'APP') mergeItemStats(appMap, item);
      else if (row.category === 'MENU') mergeItemStats(menuMap, item);
      else if (row.category === 'SERVICES' || row.category === 'SERVICE') mergeItemStats(servicesMap, item);
      else if (row.category === 'DINING') mergeItemStats(diningMap, item);
    }

    // Check if current unclosed hour falls within slot
    const bkkHour = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })).getHours();
    const isCurrentHourInSlot = startHour! < endHour!
      ? (bkkHour >= startHour! && bkkHour < endHour!)
      : (bkkHour >= startHour! || bkkHour < endHour!);

    if (isCurrentHourInSlot) {
      const liveTail = await prisma.$queryRaw<Array<{
        category: string;
        itemId: string;
        itemName: string;
        eventCount: number;
        totalDurationSec: number;
      }>>`
        SELECT 
          category,
          item_id as "itemId",
          MAX(item_name) as "itemName",
          COUNT(*)::int as "eventCount",
          COALESCE(SUM(duration_sec), 0)::int as "totalDurationSec"
        FROM usage_events
        WHERE hotel_id = ${MOCK_HOTEL_ID}
          AND started_at >= ${currentHourStart}
          AND category IS NOT NULL 
          AND item_id IS NOT NULL
        GROUP BY category, item_id
      `;

      for (const live of liveTail) {
        totalEvents += live.eventCount;
        hourEventCounts[bkkHour] = (hourEventCounts[bkkHour] || 0) + live.eventCount;
        if (live.category === 'CHANNEL' || live.category === 'APP') {
          totalSlotWatchTimeSec += live.totalDurationSec;
        }

        if (live.category === 'CHANNEL') mergeItemStats(channelMap, [live]);
        else if (live.category === 'APP') mergeItemStats(appMap, [live]);
        else if (live.category === 'MENU') mergeItemStats(menuMap, [live]);
        else if (live.category === 'SERVICES' || live.category === 'SERVICE') mergeItemStats(servicesMap, [live]);
        else if (live.category === 'DINING') mergeItemStats(diningMap, [live]);
      }
    }

  } else {
    // ── All Day: Fast rollup aggregation
    if (days === 1) {
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const hourlySummaries = await prisma.usageHourlySummary.findMany({
        where: {
          hotelId: MOCK_HOTEL_ID,
          hourBucket: { gte: twentyFourHoursAgo, lt: currentHourStart }
        }
      });

      for (const row of hourlySummaries) {
        totalEvents += row.eventCount;
        const item = [{ itemId: row.itemId, itemName: row.itemName, eventCount: row.eventCount, totalDurationSec: row.totalDurationSec }];
        if (row.category === 'CHANNEL') mergeItemStats(channelMap, item);
        else if (row.category === 'APP') mergeItemStats(appMap, item);
        else if (row.category === 'MENU') mergeItemStats(menuMap, item);
        else if (row.category === 'SERVICES' || row.category === 'SERVICE') mergeItemStats(servicesMap, item);
        else if (row.category === 'DINING') mergeItemStats(diningMap, item);
      }
    } else {
      const dateLimit = days > 0 ? new Date(now.getTime() - days * 24 * 60 * 60 * 1000) : new Date(0);
      const todayStart = new Date(Math.floor(now.getTime() / (24 * 60 * 60 * 1000)) * 24 * 60 * 60 * 1000);

      const [dailySummaries, todayHourlySummaries] = await Promise.all([
        prisma.usageDailySummary.findMany({
          where: {
            hotelId: MOCK_HOTEL_ID,
            dateBucket: { gte: dateLimit, lt: todayStart }
          }
        }),
        prisma.usageHourlySummary.findMany({
          where: {
            hotelId: MOCK_HOTEL_ID,
            hourBucket: { gte: todayStart, lt: currentHourStart }
          }
        })
      ]);

      for (const row of [...dailySummaries, ...todayHourlySummaries]) {
        totalEvents += row.eventCount;
        const item = [{ itemId: row.itemId, itemName: row.itemName, eventCount: row.eventCount, totalDurationSec: row.totalDurationSec }];
        if (row.category === 'CHANNEL') mergeItemStats(channelMap, item);
        else if (row.category === 'APP') mergeItemStats(appMap, item);
        else if (row.category === 'MENU') mergeItemStats(menuMap, item);
        else if (row.category === 'SERVICES' || row.category === 'SERVICE') mergeItemStats(servicesMap, item);
        else if (row.category === 'DINING') mergeItemStats(diningMap, item);
      }
    }

    // Live Tail for current unclosed hour
    const liveTail = await prisma.$queryRaw<Array<{
      category: string;
      itemId: string;
      itemName: string;
      eventCount: number;
      totalDurationSec: number;
    }>>`
      SELECT 
        category,
        item_id as "itemId",
        MAX(item_name) as "itemName",
        COUNT(*)::int as "eventCount",
        COALESCE(SUM(duration_sec), 0)::int as "totalDurationSec"
      FROM usage_events
      WHERE hotel_id = ${MOCK_HOTEL_ID}
        AND started_at >= ${currentHourStart}
        AND category IS NOT NULL 
        AND item_id IS NOT NULL
      GROUP BY category, item_id
    `;

    for (const live of liveTail) {
      totalEvents += live.eventCount;
      if (live.category === 'CHANNEL') mergeItemStats(channelMap, [live]);
      else if (live.category === 'APP') mergeItemStats(appMap, [live]);
      else if (live.category === 'MENU') mergeItemStats(menuMap, [live]);
      else if (live.category === 'SERVICES' || live.category === 'SERVICE') mergeItemStats(servicesMap, [live]);
      else if (live.category === 'DINING') mergeItemStats(diningMap, [live]);
    }
  }

  // Format Top items for CMS Dashboard
  const topChannels = Array.from(channelMap.values())
    .map(item => ({ name: item.name, count: item.count, duration: item.duration }))
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 10);

  const topApps = Array.from(appMap.values())
    .map(item => ({ name: item.name, count: item.count, duration: item.duration }))
    .sort((a, b) => b.duration !== a.duration ? b.duration - a.duration : b.count - a.count)
    .slice(0, 10);

  const topMenus = Array.from(menuMap.values())
    .map(item => ({ name: item.name, count: item.count }))
    .sort((a, b) => b.count - a.count);

  const topServices = Array.from(servicesMap.values())
    .map(item => ({ name: item.name, count: item.count, category: 'SERVICES' }))
    .sort((a, b) => b.count - a.count);

  const topDining = Array.from(diningMap.values())
    .map(item => ({ name: item.name, count: item.count, category: 'DINING' }))
    .sort((a, b) => b.count - a.count);

  let slotSummary = null;
  if (isTimeSlotActive) {
    let peakHour = startHour!;
    let peakEvents = 0;
    for (const [hStr, cnt] of Object.entries(hourEventCounts)) {
      if (cnt > peakEvents) {
        peakEvents = cnt;
        peakHour = parseInt(hStr, 10);
      }
    }

    slotSummary = {
      slot: `${String(startHour).padStart(2, '0')}:00 - ${String(endHour).padStart(2, '0')}:00`,
      startHour: startHour!,
      endHour: endHour!,
      totalWatchTimeMinutes: Math.round(totalSlotWatchTimeSec / 60),
      totalWatchMinutes: Math.round(totalSlotWatchTimeSec / 60),
      peakHour,
      peakHourEvents: peakEvents
    };
  }

  return {
    topChannels,
    topApps,
    topMenus,
    topServices,
    topDining,
    totalEvents,
    slotSummary,
    isTimeSlotActive,
    days
  };
}

// ── GET /api/v1/analytics/reports ────────────────────────────────────────────
// Backward-compatible endpoint for CMS Dashboard: Reads from pre-aggregated rollups
// with Time Slot filtering (startHour/endHour) and Sub-menu categories (Services/Dining).
router.get('/reports', async (req: Request, res: Response) => {
  try {
    const daysParam = (req.query.days || req.query.range) as string;
    const startHour = req.query.startHour !== undefined ? parseInt(req.query.startHour as string, 10) : undefined;
    const endHour = req.query.endHour !== undefined ? parseInt(req.query.endHour as string, 10) : undefined;

    const data = await computeReportsData({ daysParam, startHour, endHour });
    res.status(200).json({
      topChannels: data.topChannels,
      topApps: data.topApps,
      topMenus: data.topMenus,
      topServices: data.topServices,
      topDining: data.topDining,
      totalEvents: data.totalEvents,
      slotSummary: data.slotSummary
    });
  } catch (error) {
    console.error('[Analytics] Error fetching reports:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// ── GET /api/v1/analytics/reports/export ─────────────────────────────────────
// Generates and downloads a CSV export of usage analytics
router.get('/reports/export', async (req: Request, res: Response) => {
  try {
    const daysParam = (req.query.days || req.query.range) as string;
    const startHour = req.query.startHour !== undefined ? parseInt(req.query.startHour as string, 10) : undefined;
    const endHour = req.query.endHour !== undefined ? parseInt(req.query.endHour as string, 10) : undefined;

    const data = await computeReportsData({ daysParam, startHour, endHour });

    const timeSlotLabel = data.isTimeSlotActive
      ? `${String(startHour).padStart(2, '0')}:00 - ${String(endHour).padStart(2, '0')}:00`
      : 'All Day (00:00 - 24:00)';
    const dateRangeLabel = data.days === 1 ? 'Last 24 Hours' : data.days === 0 ? 'All Time' : `Last ${data.days} Days`;

    let csv = `Hotel TV Analytics Report\n`;
    csv += `Date Range,${dateRangeLabel}\n`;
    csv += `Time Slot,${timeSlotLabel}\n`;
    csv += `Total Events Recorded,${data.totalEvents}\n`;
    if (data.slotSummary) {
      csv += `Total Slot Watch Time (Minutes),${data.slotSummary.totalWatchTimeMinutes}\n`;
      csv += `Peak Hour in Slot,${String(data.slotSummary.peakHour).padStart(2, '0')}:00 (${data.slotSummary.peakHourEvents} events)\n`;
    }
    csv += `Export Timestamp,${new Date().toISOString()}\n\n`;

    csv += `Category,Item Name,Views / Opens,Watch Duration (Minutes),Watch Duration (Hours)\n`;

    for (const app of data.topApps) {
      const mins = Math.round(app.duration / 60);
      const hrs = (app.duration / 3600).toFixed(1);
      csv += `"App","${app.name.replace(/"/g, '""')}",${app.count},${mins},${hrs}\n`;
    }

    for (const ch of data.topChannels) {
      const mins = Math.round(ch.duration / 60);
      const hrs = (ch.duration / 3600).toFixed(1);
      csv += `"Channel","${ch.name.replace(/"/g, '""')}",${ch.count || 0},${mins},${hrs}\n`;
    }

    for (const menu of data.topMenus) {
      csv += `"Main Menu","${menu.name.replace(/"/g, '""')}",${menu.count},0,0.0\n`;
    }

    for (const srv of data.topServices) {
      csv += `"Service (Sub-menu)","${srv.name.replace(/"/g, '""')}",${srv.count},0,0.0\n`;
    }

    for (const din of data.topDining) {
      csv += `"Dining (Sub-menu)","${din.name.replace(/"/g, '""')}",${din.count},0,0.0\n`;
    }

    const safeSlot = data.isTimeSlotActive ? `${startHour}h-${endHour}h` : 'allday';
    const filename = `hotel_tv_report_${data.days || 'all'}d_${safeSlot}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);

  } catch (error: any) {
    console.error('[Analytics] Error exporting reports:', error);
    res.status(500).json({ error: 'Failed to export reports', details: error.message });
  }
});

// ── POST /api/v1/analytics/events ────────────────────────────────────────────
// HTTP fallback: buffers directly into Redis Stream
router.post('/events', async (req: Request, res: Response) => {
  const { deviceId, eventType } = req.body;

  if (!deviceId || !eventType) {
    return res.status(400).json({ error: 'deviceId and eventType are required' });
  }

  try {
    const normalized = normalizeEvent(req.body);
    if (!normalized) {
      return res.status(200).json({ message: 'Ignored or invalid event' });
    }

    await addUsageEventToStream(normalized);

    return res.status(202).json({
      status: 'accepted',
      eventId: normalized.eventId,
      message: 'Event queued for batch processing'
    });
  } catch (error: any) {
    console.error('[Analytics] Error recording event via HTTP:', error.message);
    res.status(500).json({ error: 'Failed to record event' });
  }
});

// ── GET /api/v1/analytics/top-items ──────────────────────────────────────────
router.get('/top-items', async (req: Request, res: Response) => {
  try {
    const category = String(req.query.category || 'APP').toUpperCase();
    const days = parseInt(req.query.range as string, 10) || 7;
    const dateLimit = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const summaries = await prisma.usageDailySummary.groupBy({
      by: ['itemId', 'itemName'],
      where: {
        hotelId: MOCK_HOTEL_ID,
        category,
        dateBucket: { gte: dateLimit }
      },
      _sum: {
        eventCount: true,
        totalDurationSec: true
      },
      orderBy: {
        _sum: {
          totalDurationSec: 'desc'
        }
      },
      take: 10
    });

    const items = summaries.map(s => ({
      itemId: s.itemId,
      itemName: s.itemName,
      eventCount: s._sum.eventCount || 0,
      totalDurationSec: s._sum.totalDurationSec || 0
    }));

    res.status(200).json({ category, rangeDays: days, items });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch top items', details: err.message });
  }
});

// ── GET /api/v1/analytics/hourly-pattern ─────────────────────────────────────
router.get('/hourly-pattern', async (req: Request, res: Response) => {
  try {
    const itemId = String(req.query.itemId || '');
    const days = parseInt(req.query.range as string, 10) || 7;
    const dateLimit = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const patterns = await prisma.$queryRaw<Array<{ hour: number; totalDuration: number; totalCount: number }>>`
      SELECT 
        EXTRACT(hour from hour_bucket)::int as "hour",
        COALESCE(SUM(total_duration_sec), 0)::int as "totalDuration",
        COALESCE(SUM(event_count), 0)::int as "totalCount"
      FROM usage_hourly_summary
      WHERE hotel_id = ${MOCK_HOTEL_ID}
        AND hour_bucket >= ${dateLimit}
        ${itemId ? prisma.$queryRaw`AND item_id = ${itemId}` : prisma.$queryRaw``}
      GROUP BY EXTRACT(hour from hour_bucket)
      ORDER BY "hour" ASC
    `;

    res.status(200).json({ itemId, rangeDays: days, patterns });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch hourly patterns', details: err.message });
  }
});

// ── GET /api/v1/analytics/peak-hours ─────────────────────────────────────────
router.get('/peak-hours', async (req: Request, res: Response) => {
  try {
    const category = String(req.query.category || 'APP').toUpperCase();

    const peaks = await prisma.$queryRaw<Array<{ hour: number; avgEvents: number; maxRooms: number }>>`
      SELECT 
        EXTRACT(hour from hour_bucket)::int as "hour",
        ROUND(AVG(event_count))::int as "avgEvents",
        MAX(unique_rooms)::int as "maxRooms"
      FROM usage_hourly_summary
      WHERE hotel_id = ${MOCK_HOTEL_ID}
        AND category = ${category}
      GROUP BY EXTRACT(hour from hour_bucket)
      ORDER BY "avgEvents" DESC
      LIMIT 5
    `;

    res.status(200).json({ category, peakHours: peaks });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch peak hours', details: err.message });
  }
});

export default router;
