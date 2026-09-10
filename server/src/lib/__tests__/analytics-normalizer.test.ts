import { describe, it, expect, beforeEach } from 'vitest';
import { normalizeEvent } from '../analytics-normalizer';
import { getMetricCount, resetMetricsForTesting } from '../monitoring';

describe('Analytics Normalizer', () => {
  beforeEach(() => {
    resetMetricsForTesting();
  });

  it('should generate valid eventId and normalize item names', () => {
    const raw = {
      deviceId: 'BOX-101-A',
      eventType: 'CHANNEL_WATCH',
      value: { channelId: 'ch-01', name: 'HBO HD' },
      durationSeconds: 300,
      timestamp: Date.now()
    };

    const normalized = normalizeEvent(raw);
    expect(normalized).not.toBeNull();
    expect(normalized!.eventId).toBeDefined();
    expect(normalized!.eventId.length).toBeGreaterThan(10);
    expect(normalized!.category).toBe('CHANNEL');
    expect(normalized!.itemId).toBe('ch_01');
    expect(normalized!.itemName).toBe('HBO HD');
    expect(normalized!.durationSec).toBe(300);
  });

  it('should ignore self-app events for Hotel TV UI', () => {
    const raw = {
      deviceId: 'BOX-101-A',
      eventType: 'APP_OPEN',
      value: { packageName: 'com.hotel.tvapp', appName: 'Hotel TV System' }
    };

    const normalized = normalizeEvent(raw);
    expect(normalized).toBeNull();
  });

  it('should clamp duration exceeding 86400s and increment duration_clamped_count metric', () => {
    const raw = {
      deviceId: 'BOX-101-A',
      eventType: 'APP_WATCH_DURATION',
      value: { packageName: 'com.netflix.ninja', appName: 'Netflix' },
      durationSeconds: 150000 // > 86400 (approx 41 hours)
    };

    const initialClampCount = getMetricCount('duration_clamped_count');
    const normalized = normalizeEvent(raw);

    expect(normalized).not.toBeNull();
    expect(normalized!.durationSec).toBe(86400); // Clamped to 1 day
    expect(getMetricCount('duration_clamped_count')).toBe(initialClampCount + 1);
  });

  it('should clamp negative duration to 0 and not track as excessive clamp', () => {
    const raw = {
      deviceId: 'BOX-101-A',
      eventType: 'CHANNEL_WATCH',
      value: { channelId: 'ch-02', name: 'CNN' },
      durationSeconds: -50
    };

    const initialClampCount = getMetricCount('duration_clamped_count');
    const normalized = normalizeEvent(raw);

    expect(normalized).not.toBeNull();
    expect(normalized!.durationSec).toBeNull();
    expect(getMetricCount('duration_clamped_count')).toBe(initialClampCount);
  });

  it('should correct future clock skew exceeding 5 minutes to current time', () => {
    const futureTime = Date.now() + 30 * 60 * 1000; // 30 minutes in future
    const raw = {
      deviceId: 'BOX-101-A',
      eventType: 'MENU_CLICK',
      value: { menuName: 'Room Service' },
      timestamp: futureTime
    };

    const normalized = normalizeEvent(raw);
    expect(normalized).not.toBeNull();
    expect(new Date(normalized!.startedAt).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('should preserve session context provided by socket.data', () => {
    const raw = {
      eventType: 'CHANNEL_WATCH',
      value: { channelId: 'ch-05', name: 'BBC' },
      durationSeconds: 60
    };

    const session = {
      hotelId: 'custom-hotel-uuid',
      roomUuid: '11111111-1111-1111-1111-111111111111',
      deviceUuid: '22222222-2222-2222-2222-222222222222'
    };

    const normalized = normalizeEvent(raw, session);
    expect(normalized).not.toBeNull();
    expect(normalized!.hotelId).toBe('custom-hotel-uuid');
    expect(normalized!.roomId).toBe('11111111-1111-1111-1111-111111111111');
    expect(normalized!.deviceId).toBe('22222222-2222-2222-2222-222222222222');
  });

  it('should categorize ITEM_VIEW correctly for dining and services sub-menus', () => {
    const diningEvent = {
      deviceId: 'BOX-101-A',
      eventType: 'ITEM_VIEW',
      value: { itemId: 'item-breakfast', name: 'In-Room Breakfast', section: 'dining' }
    };
    const normDining = normalizeEvent(diningEvent);
    expect(normDining).not.toBeNull();
    expect(normDining!.category).toBe('DINING');
    expect(normDining!.itemId).toBe('item_breakfast');
    expect(normDining!.itemName).toBe('In-Room Breakfast');

    const serviceEvent = {
      deviceId: 'BOX-101-A',
      eventType: 'ITEM_VIEW',
      value: { itemId: 'item-spa', name: 'Thai Herbal Spa', section: 'services' }
    };
    const normService = normalizeEvent(serviceEvent);
    expect(normService).not.toBeNull();
    expect(normService!.category).toBe('SERVICES');
    expect(normService!.itemId).toBe('item_spa');
    expect(normService!.itemName).toBe('Thai Herbal Spa');
  });
});
