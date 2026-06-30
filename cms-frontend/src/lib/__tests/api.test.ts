import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '../api';

describe('CMS API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getDashboardStats should return correct analytics summary', async () => {
    const stats = await api.getDashboardStats();
    expect(stats).toHaveProperty('activeDevices');
    expect(stats).toHaveProperty('totalDevices');
    expect(stats.totalDevices).toBe(500); // 10 floors * 50 rooms
    expect(stats.topApps.length).toBe(3);
  });

  it('getDevices should support pagination and filtering', async () => {
    // Test fetch first page of all devices
    const page1 = await api.getDevices(1, 20, 'All');
    expect(page1.data.length).toBe(20);
    expect(page1.total).toBe(500);
    expect(page1.page).toBe(1);
    expect(page1.totalPages).toBe(25);

    // Test filtering by status
    const onlineOnly = await api.getDevices(1, 10, 'Online');
    expect(onlineOnly.data.every(d => d.status === 'Online')).toBe(true);
    expect(onlineOnly.total).toBeLessThan(500);
  });

  it('updateDeviceStatus should modify device status in store', async () => {
    // Fetch room 101 device ID
    const devices = await api.getDevices(1, 1, 'All', 'roomNumber', false);
    const targetRoom = devices.data[0];
    
    const initialStatus = targetRoom.status;
    const nextStatus = initialStatus === 'Online' ? 'Offline' : 'Online';

    const success = await api.updateDeviceStatus(targetRoom.id, nextStatus);
    expect(success).toBe(true);

    const updatedDevices = await api.getDevices(1, 1, 'All', 'roomNumber', false);
    expect(updatedDevices.data[0].status).toBe(nextStatus);
  });

  it('should call fetch correctly on network operations like getChannels', async () => {
    const mockChannels = [
      { id: 'ch1', name: 'HBO', category: 'Movies', isActive: true }
    ];

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockChannels
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { location: { hostname: 'localhost' } });

    const channels = await api.getChannels();
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/api/v1/channels', expect.any(Object));
    expect(channels).toEqual(mockChannels);
  });
});
