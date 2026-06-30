import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import analyticsRoutes from '../analytics.routes';

// Mock the PrismaClient instance that is created inside analytics.routes.ts
const prismaMock = vi.hoisted(() => ({
  usageEvent: {
    create: vi.fn(),
  },
  channel: {
    count: vi.fn(),
    findMany: vi.fn(),
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

const app = express();
app.use(express.json());
app.use('/api/v1/analytics', analyticsRoutes);

describe('Analytics API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/v1/analytics/events', () => {
    it('should successfully record a usage event and return 201', async () => {
      const mockEventData = {
        deviceId: 'device-123',
        eventType: 'CHANNEL_WATCH',
        value: { channelId: 'ch-1', name: 'BBC News' },
        durationSeconds: 120,
        roomId: 'room-101',
        guestType: 'VIP'
      };

      const mockCreatedEvent = {
        id: 'event-1',
        hotelId: '123e4567-e89b-12d3-a456-426614174000',
        deviceId: 'device-123',
        eventType: 'CHANNEL_WATCH',
        value: JSON.stringify(mockEventData.value),
        durationSeconds: 120,
        roomId: 'room-101',
        guestType: 'VIP',
        timestamp: new Date()
      };

      prismaMock.usageEvent.create.mockResolvedValue(mockCreatedEvent);

      const response = await request(app)
        .post('/api/v1/analytics/events')
        .send(mockEventData);

      expect(response.status).toBe(201);
      expect(response.body.id).toBe('event-1');
      expect(prismaMock.usageEvent.create).toHaveBeenCalledTimes(1);
      
      // Verify correct parameters passed to Prisma
      const createCall = prismaMock.usageEvent.create.mock.calls[0][0];
      expect(createCall.data.deviceId).toBe('device-123');
      expect(createCall.data.eventType).toBe('CHANNEL_WATCH');
      expect(createCall.data.durationSeconds).toBe(120);
      expect(createCall.data.value).toBe(JSON.stringify(mockEventData.value));
    });

    it('should return 400 Bad Request when deviceId is missing', async () => {
      const response = await request(app)
        .post('/api/v1/analytics/events')
        .send({
          eventType: 'APP_OPEN'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('deviceId and eventType are required');
      expect(prismaMock.usageEvent.create).not.toHaveBeenCalled();
    });

    it('should return 400 Bad Request when eventType is missing', async () => {
      const response = await request(app)
        .post('/api/v1/analytics/events')
        .send({
          deviceId: 'device-123'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('deviceId and eventType are required');
      expect(prismaMock.usageEvent.create).not.toHaveBeenCalled();
    });

    it('should handle internal server errors and return 500', async () => {
      prismaMock.usageEvent.create.mockRejectedValue(new Error('DB Error'));

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
});
