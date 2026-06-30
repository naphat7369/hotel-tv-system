import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import pmsRoutes from '../pms.routes';

// Mock the adb.service
vi.mock('../../services/adb.service', () => ({
  clearGuestApps: vi.fn().mockResolvedValue(undefined),
  rebootDevice: vi.fn().mockResolvedValue(undefined),
  wakeUpDevice: vi.fn().mockResolvedValue(undefined),
}));

// Import mock functions to verify calls
import { clearGuestApps } from '../../services/adb.service';

const app = express();
app.use(express.json());
// Setup mock io
const mockIo = {
  to: vi.fn().mockReturnThis(),
  emit: vi.fn(),
};
app.set('io', mockIo);
app.use('/api/v1/pms', pmsRoutes);

describe('PMS Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POST /api/v1/pms/checkin should process check-in successfully', async () => {
    const checkinData = {
      roomNumber: '101',
      guestName: 'John Doe',
      guestTag: 'VIP',
      deviceId: 'BOX-101-A',
      ip: '192.168.1.101',
    };

    const res = await request(app)
      .post('/api/v1/pms/checkin')
      .send(checkinData)
      .expect(200);

    expect(res.body.status).toBe('success');
    expect(mockIo.to).toHaveBeenCalledWith('device_BOX-101-A');
    expect(mockIo.emit).toHaveBeenCalledWith('guest_update', {
      status: 'checked_in',
      guestName: 'John Doe',
      guestTag: 'VIP',
    });
  });

  it('POST /api/v1/pms/checkout should clear guest apps and process checkout successfully', async () => {
    const checkoutData = {
      roomNumber: '101',
      deviceId: 'BOX-101-A',
      ip: '192.168.1.101',
    };

    const res = await request(app)
      .post('/api/v1/pms/checkout')
      .send(checkoutData)
      .expect(200);

    expect(res.body.status).toBe('success');
    expect(clearGuestApps).toHaveBeenCalledWith('192.168.1.101');
    expect(mockIo.to).toHaveBeenCalledWith('device_BOX-101-A');
    expect(mockIo.emit).toHaveBeenCalledWith('guest_update', {
      status: 'checked_out',
      guestName: null,
      guestTag: null,
    });
  });

  it('POST /api/v1/pms/checkout should return 400 if no IP is provided or found', async () => {
    const checkoutData = {
      roomNumber: '101',
      deviceId: 'BOX-NONEXISTENT', // No device in connected map, so IP can't be found
    };

    const res = await request(app)
      .post('/api/v1/pms/checkout')
      .send(checkoutData)
      .expect(400);

    expect(res.body.error).toBe('IP address is required for ADB execution');
  });

  it('GET /api/v1/pms/status/:ip should return current reservation status', async () => {
    // Check-in first to store in map
    await request(app)
      .post('/api/v1/pms/checkin')
      .send({
        roomNumber: '202',
        guestName: 'Jane Smith',
        guestTag: 'Regular',
        ip: '192.168.1.202',
      })
      .expect(200);

    // Fetch status
    const statusRes = await request(app)
      .get('/api/v1/pms/status/192.168.1.202')
      .expect(200);

    expect(statusRes.body.status).toBe('checked_in');
    expect(statusRes.body.guestName).toBe('Jane Smith');
    expect(statusRes.body.roomNumber).toBe('202');
  });

  it('GET /api/v1/pms/status/:ip should return checked_out for unknown IP', async () => {
    const res = await request(app)
      .get('/api/v1/pms/status/192.168.1.999')
      .expect(200);

    expect(res.body.status).toBe('checked_out');
    expect(res.body.guestName).toBeNull();
  });
});
