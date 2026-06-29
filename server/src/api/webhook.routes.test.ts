import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import webhookRoutes, { prisma } from './webhook.routes';
import { connectedDevices } from '../websocket/socket';

// Mock Prisma
const mPrismaClient = vi.hoisted(() => ({
  hotel: {
    findFirst: vi.fn(),
  },
  room: {
    findFirst: vi.fn(),
  },
  reservation: {
    create: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  }
}));

vi.mock('@prisma/client', () => {
  return { 
    PrismaClient: class {
      hotel = mPrismaClient.hotel;
      room = mPrismaClient.room;
      reservation = mPrismaClient.reservation;
    }
  };
});

const app = express();
app.use(express.json());

// Mock Socket.io
const mockEmit = vi.fn();
const mockTo = vi.fn(() => ({ emit: mockEmit }));
const mockIo = { to: mockTo };
app.set('io', mockIo);

app.use('/webhooks', webhookRoutes);

describe('Webhook Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WEBHOOK_API_KEY = 'test-key';
    
    // Setup a dummy device for testing
    connectedDevices.clear();
    connectedDevices.set('101', {
      deviceId: '101',
      roomNumber: '101',
      isOnline: true,
      lastSeen: new Date().toISOString()
    });
  });

  afterEach(() => {
    connectedDevices.clear();
  });

  it('should return 401 if API key is missing', async () => {
    const res = await request(app).post('/webhooks/checkin').send({});
    expect(res.status).toBe(401);
  });

  it('should return 401 if API key is invalid', async () => {
    const res = await request(app)
      .post('/webhooks/checkin')
      .set('x-api-key', 'wrong-key')
      .send({});
    expect(res.status).toBe(401);
  });

  it('should process check-in successfully', async () => {
    // Mock DB responses
    (prisma.hotel.findFirst as any).mockResolvedValue({ id: 'hotel-123' });
    (prisma.room.findFirst as any).mockResolvedValue({ id: 'room-123' });
    (prisma.reservation.create as any).mockResolvedValue({});

    const res = await request(app)
      .post('/webhooks/checkin')
      .set('x-api-key', 'test-key')
      .send({ roomNumber: '101', guestName: 'John Doe' });

    expect(res.status).toBe(200);
    expect(prisma.hotel.findFirst).toHaveBeenCalled();
    expect(prisma.room.findFirst).toHaveBeenCalledWith({
      where: { roomNumber: '101', hotelId: 'hotel-123' }
    });
    expect(prisma.reservation.create).toHaveBeenCalled();
    
    // Check if socket was emitted directly to the device
    expect(mockTo).toHaveBeenCalledWith('device_101');
    expect(mockEmit).toHaveBeenCalledWith('guest_update', {
      status: 'checked_in',
      guestName: 'John Doe',
      guestTag: undefined
    });
  });

  it('should process check-out successfully', async () => {
    (prisma.hotel.findFirst as any).mockResolvedValue({ id: 'hotel-123' });
    (prisma.room.findFirst as any).mockResolvedValue({ id: 'room-123' });
    (prisma.reservation.findMany as any).mockResolvedValue([{ id: 'res-123' }]);
    (prisma.reservation.update as any).mockResolvedValue({});

    const res = await request(app)
      .post('/webhooks/checkout')
      .set('x-api-key', 'test-key')
      .send({ roomNumber: '101' });

    expect(res.status).toBe(200);
    expect(prisma.reservation.findMany).toHaveBeenCalledWith({
      where: { roomId: 'room-123', status: 'In-House' }
    });
    expect(prisma.reservation.update).toHaveBeenCalledWith({
      where: { id: 'res-123' },
      data: expect.objectContaining({ status: 'Checked-Out' })
    });
    
    // Check if socket was emitted directly to the device
    expect(mockTo).toHaveBeenCalledWith('device_101');
    expect(mockEmit).toHaveBeenCalledWith('guest_update', {
      status: 'checked_out',
      guestName: null,
      guestTag: null
    });
  });
});
