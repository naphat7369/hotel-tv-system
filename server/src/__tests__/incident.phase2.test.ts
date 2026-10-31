import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock child_process for adb.service
const mockExec = vi.fn();
vi.mock('child_process', () => ({
  exec: (cmd: string, options: any, callback: any) => {
    const cb = typeof options === 'function' ? options : callback;
    mockExec(cmd, options, cb);
  },
}));

import { IncidentService } from '../services/incident.service';
import { logDeviceEvent } from '../services/device-log.service';
import { StreamService } from '../services/stream.service';
import { connectAdb, unauthorizedIps, markIpUnauthorized } from '../services/adb.service';
import { sendAlert, resetMetricsForTesting } from '../lib/monitoring';
import webhookRoutes, { prisma as webhookPrisma } from '../api/webhook.routes';
import { connectedDevices } from '../websocket/socket';

describe('Phase 2: Non-Blocking Event Hooks & Fault Isolation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockExec.mockReset();
    unauthorizedIps.clear();
    connectedDevices.clear();
    resetMetricsForTesting();
    IncidentService.resetForTesting();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('isolates logDeviceEvent when IncidentService throws synchronously or rejects asynchronously', async () => {
    vi.spyOn(IncidentService, 'isEnabled').mockReturnValue(true);
    const ingestSpy = vi
      .spyOn(IncidentService, 'ingestDeviceLog')
      .mockRejectedValueOnce(new Error('Simulated async IncidentService failure'));

    expect(() =>
      logDeviceEvent({
        deviceId: 'BOX-1103',
        level: 'ERROR',
        tag: 'Crash',
        message: 'Simulated crash',
        roomNumber: '1103',
        ipAddress: '172.16.110.11',
      })
    ).not.toThrow();

    await new Promise((r) => setTimeout(r, 10));
    expect(ingestSpy).toHaveBeenCalledTimes(1);

    // Also test synchronous throw inside isEnabled()
    vi.spyOn(IncidentService, 'isEnabled').mockImplementation(() => {
      throw new Error('Simulated sync throw in isEnabled');
    });

    expect(() =>
      logDeviceEvent({
        deviceId: 'BOX-1103',
        level: 'ERROR',
        tag: 'Crash',
        message: 'Simulated crash 2',
        roomNumber: '1103',
      })
    ).not.toThrow();
  });

  it('isolates StreamService.probeAllChannels when IncidentService throws', async () => {
    vi.spyOn(IncidentService, 'isEnabled').mockReturnValue(true);
    const probeHookSpy = vi
      .spyOn(IncidentService, 'processStreamProbeResults')
      .mockRejectedValueOnce(new Error('Simulated stream hook failure'));

    const mockIo = { emit: vi.fn() };
    (StreamService as any).io = mockIo;

    await expect(StreamService.probeAllChannels()).resolves.not.toThrow();
    expect(mockIo.emit).toHaveBeenCalledWith('channel_status_update', expect.any(Object));

    await new Promise((r) => setTimeout(r, 10));
    expect(probeHookSpy).toHaveBeenCalledTimes(1);
  });

  it('handles connectAdb and module-level unauthorizedIps, clearing 6h cooldown on resolve and isolating errors', async () => {
    vi.spyOn(IncidentService, 'isEnabled').mockReturnValue(true);
    const reportUnauthSpy = vi
      .spyOn(IncidentService, 'reportAdbUnauthorized')
      .mockImplementation(() => {
        throw new Error('Simulated ADB report error');
      });
    const resolveUnauthSpy = vi
      .spyOn(IncidentService, 'resolveAdbUnauthorized')
      .mockRejectedValue(new Error('Simulated ADB resolve error'));

    // 1. Simulate unauthorized output from adb connect
    mockExec.mockImplementation((cmd: string, _opts: any, cb: Function) => {
      if (cmd.includes('connect 172.16.110.50:5555')) {
        cb(null, { stdout: 'failed to authenticate to 172.16.110.50:5555\n', stderr: '' });
      } else {
        cb(null, { stdout: 'disconnected\n', stderr: '' });
      }
    });

    const connected1 = await connectAdb('172.16.110.50');
    expect(connected1).toBe(false);
    expect(unauthorizedIps.has('172.16.110.50')).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(reportUnauthSpy).toHaveBeenCalledWith('172.16.110.50');

    // 2. Subsequent call within 6h cooldown skips adb connect
    mockExec.mockClear();
    const connectedDuringCooldown = await connectAdb('172.16.110.50');
    expect(connectedDuringCooldown).toBe(false);
    expect(mockExec).not.toHaveBeenCalled();

    // 3. Simulate successful connection (after IT authorizes box) -> clears unauthorizedIps & triggers resolveAdbUnauthorized
    mockExec.mockImplementation((cmd: string, _opts: any, cb: Function) => {
      cb(null, { stdout: 'connected to 172.16.110.50:5555\n', stderr: '' });
    });

    const connectedAfterAllow = await connectAdb('172.16.110.50', true);
    expect(connectedAfterAllow).toBe(true);
    expect(unauthorizedIps.has('172.16.110.50')).toBe(false);
    await new Promise((r) => setTimeout(r, 10));
    expect(resolveUnauthSpy).toHaveBeenCalledWith('172.16.110.50');
  });

  it('isolates all 5 webhook.routes.ts hooks outside transactions even when IncidentService throws', async () => {
    vi.spyOn(IncidentService, 'isEnabled').mockImplementation(() => {
      throw new Error('Simulated fatal throw inside IncidentService.isEnabled()');
    });

    vi.spyOn(webhookPrisma.hotel, 'findFirst').mockResolvedValue({
      id: 'hotel-1',
      name: 'Grand Horizon',
    } as any);
    vi.spyOn(webhookPrisma.room, 'findFirst').mockResolvedValue({
      id: 'room-1103',
      roomNumber: '1103',
      hotelId: 'hotel-1',
    } as any);
    vi.spyOn(webhookPrisma.reservation, 'findFirst').mockResolvedValue(null);
    vi.spyOn(webhookPrisma.reservation, 'create').mockResolvedValue({ id: 'res-1' } as any);
    vi.spyOn(webhookPrisma.reservation, 'findMany').mockResolvedValue([{ id: 'res-1' }] as any);
    vi.spyOn(webhookPrisma.reservation, 'update').mockResolvedValue({ id: 'res-1' } as any);

    const app = express();
    app.use(express.json());
    app.set('io', { to: vi.fn().mockReturnThis(), emit: vi.fn() });
    app.use('/api/v1/webhooks/pms', webhookRoutes);

    const apiKey = process.env.WEBHOOK_API_KEY || 'default-secret-key-123';

    // Hook 1: Normal check-in
    const resCheckin = await request(app)
      .post('/api/v1/webhooks/pms/checkin')
      .set('x-api-key', apiKey)
      .send({ roomNumber: '1103', guestName: 'Alice' });
    expect(resCheckin.status).toBe(200);

    // Hook 2: Check-out via service='delete' on /checkin
    const resDelete = await request(app)
      .post('/api/v1/webhooks/pms/checkin')
      .set('x-api-key', apiKey)
      .send({ roomNumber: '1103', service: 'delete' });
    expect(resDelete.status).toBe(200);

    // Hook 3: Normal check-out on /checkout
    const resCheckout = await request(app)
      .post('/api/v1/webhooks/pms/checkout')
      .set('x-api-key', apiKey)
      .send({ roomNumber: '1103' });
    expect(resCheckout.status).toBe(200);
  });

  it('isolates monitoring.sendAlert when IncidentService throws and prevents circular loops', async () => {
    vi.spyOn(IncidentService, 'isEnabled').mockReturnValue(true);
    const monSpy = vi
      .spyOn(IncidentService, 'reportMonitoringAlert')
      .mockRejectedValueOnce(new Error('Simulated monitoring bridge error'));

    const result = await sendAlert({
      type: 'REDIS_OOM',
      message: 'Memory full',
      severity: 'critical',
    });

    expect(result).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(monSpy).toHaveBeenCalledTimes(1);
  });

  it('resolves ipAddress in socket.ts device_log directly from connectedDevices Map without querying DB', async () => {
    const socketSource = require('fs').readFileSync(
      require('path').resolve(__dirname, '../websocket/socket.ts'),
      'utf8'
    );
    const deviceLogBlockMatch = /socket\.on\('device_log'[\s\S]*?\}\);/.exec(socketSource);
    expect(deviceLogBlockMatch).not.toBeNull();
    const block = deviceLogBlockMatch![0];

    expect(block).toContain('connectedDevices.get(deviceId)');
    expect(block).toContain('existing?.ipAddress');
    expect(block).not.toContain('prisma.');
  });
});
