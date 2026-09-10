import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock Redis stream buffer
vi.mock('../../lib/redis', () => ({
  addUsageEventToStream: vi.fn().mockResolvedValue('1789000000000-0'),
  getStreamStats: vi.fn().mockResolvedValue({ length: 0, pending: 0, consumers: 1 }),
  getDeadLetterStats: vi.fn().mockResolvedValue({ length: 0, sample: [] }),
  requeueDeadLetter: vi.fn().mockResolvedValue({ requeuedCount: 0, remainingDeadLetter: 0 })
}));

// Mock PrismaClient
const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn().mockResolvedValue([]),
  usageHourlySummary: {
    findMany: vi.fn().mockResolvedValue([]),
    groupBy: vi.fn().mockResolvedValue([]),
  },
  usageDailySummary: {
    findMany: vi.fn().mockResolvedValue([]),
    groupBy: vi.fn().mockResolvedValue([]),
  },
  usageEvent: {
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
  },
  channel: {
    count: vi.fn().mockResolvedValue(10),
    findMany: vi.fn().mockResolvedValue([]),
  }
}));

vi.mock('@prisma/client', () => {
  return {
    PrismaClient: class {
      constructor() {
        return prismaMock;
      }
    }
  };
});

import analyticsRoutes from '../analytics.routes';
import { addUsageEventToStream } from '../../lib/redis';

const app = express();
app.use(express.json());
app.use('/api/v1/analytics', analyticsRoutes);

describe('Analytics API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/v1/analytics/events', () => {
    it('should buffer usage event to Redis stream and return 202 Accepted', async () => {
      const mockEventData = {
        deviceId: 'device-123',
        eventType: 'CHANNEL_WATCH',
        value: { channelId: 'ch-1', name: 'BBC News' },
        durationSeconds: 120,
        roomId: 'room-101',
        guestType: 'VIP'
      };

      const response = await request(app)
        .post('/api/v1/analytics/events')
        .send(mockEventData);

      expect(response.status).toBe(202);
      expect(response.body.status).toBe('accepted');
      expect(response.body.eventId).toBeDefined();
      expect(addUsageEventToStream).toHaveBeenCalledTimes(1);

      const streamPayload = (addUsageEventToStream as any).mock.calls[0][0];
      expect(streamPayload.eventType).toBe('CHANNEL_WATCH');
      expect(streamPayload.itemId).toBe('ch_1');
      expect(streamPayload.itemName).toBe('BBC News');
      expect(streamPayload.durationSec).toBe(120);
    });

    it('should return 400 Bad Request when deviceId is missing', async () => {
      const response = await request(app)
        .post('/api/v1/analytics/events')
        .send({
          eventType: 'APP_OPEN'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('deviceId and eventType are required');
      expect(addUsageEventToStream).not.toHaveBeenCalled();
    });

    it('should return 400 Bad Request when eventType is missing', async () => {
      const response = await request(app)
        .post('/api/v1/analytics/events')
        .send({
          deviceId: 'device-123'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('deviceId and eventType are required');
      expect(addUsageEventToStream).not.toHaveBeenCalled();
    });

    it('should handle Redis buffering errors and return 500', async () => {
      vi.mocked(addUsageEventToStream).mockRejectedValueOnce(new Error('Redis connection failed'));

      const response = await request(app)
        .post('/api/v1/analytics/events')
        .send({
          deviceId: 'device-123',
          eventType: 'HARDWARE_METRIC'
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to record event');
    });
  });

  describe('GET /api/v1/analytics/reports', () => {
    it('should return formatted report contract matching CMS dashboard requirements', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/reports?range=24h');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('topApps');
      expect(response.body).toHaveProperty('topChannels');
      expect(response.body).toHaveProperty('topMenus');
      expect(response.body).toHaveProperty('topServices');
      expect(response.body).toHaveProperty('topDining');
      expect(response.body).toHaveProperty('totalEvents');
      expect(Array.isArray(response.body.topApps)).toBe(true);
      expect(Array.isArray(response.body.topChannels)).toBe(true);
      expect(Array.isArray(response.body.topMenus)).toBe(true);
      expect(Array.isArray(response.body.topServices)).toBe(true);
      expect(Array.isArray(response.body.topDining)).toBe(true);
      expect(typeof response.body.totalEvents).toBe('number');
    });

    it('should calculate slotSummary when startHour and endHour are provided', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/reports?range=7d&startHour=8&endHour=12');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('slotSummary');
      expect(response.body.slotSummary).not.toBeNull();
      expect(response.body.slotSummary.startHour).toBe(8);
      expect(response.body.slotSummary.endHour).toBe(12);
      expect(typeof response.body.slotSummary.totalWatchTimeMinutes).toBe('number');
    });

    it('should export analytics report as CSV', async () => {
      const response = await request(app)
        .get('/api/v1/analytics/reports/export?range=7d&startHour=8&endHour=12');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('.csv');
      expect(response.text).toContain('Hotel TV Analytics Report');
      expect(response.text).toContain('Category,Item Name');
    });
  });
});
