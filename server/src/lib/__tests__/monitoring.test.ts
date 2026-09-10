import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendAlert, recordMetric, getMetricCount, resetMetricsForTesting } from '../monitoring';

describe('Monitoring & Alert System', () => {
  beforeEach(() => {
    resetMetricsForTesting();
    vi.restoreAllMocks();
  });

  it('should track and retrieve metric counts', () => {
    expect(getMetricCount('duration_clamped_count')).toBe(0);
    recordMetric('duration_clamped_count', 1);
    recordMetric('duration_clamped_count', 3);
    expect(getMetricCount('duration_clamped_count')).toBe(4);
  });

  it('should allow alerts for different hotels without triggering false cooldown suppression', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Hotel A alert
    await sendAlert({
      type: 'DLQ_OVERFLOW',
      hotelId: 'hotel-A',
      message: 'DLQ depth exceeded 10 in Hotel A'
    });

    // Hotel B alert of the same type within 15 mins should NOT be suppressed
    await sendAlert({
      type: 'DLQ_OVERFLOW',
      hotelId: 'hotel-B',
      message: 'DLQ depth exceeded 10 in Hotel B'
    });

    // Verify both were logged (not suppressed)
    const logs = consoleSpy.mock.calls.map(call => call.join(' '));
    const hotelALogs = logs.filter(l => l.includes('Hotel A'));
    const hotelBLogs = logs.filter(l => l.includes('Hotel B'));

    expect(hotelALogs.length).toBeGreaterThan(0);
    expect(hotelBLogs.length).toBeGreaterThan(0);
  });

  it('should suppress duplicate alerts for the same hotel within the cooldown period', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // First alert
    await sendAlert({
      type: 'INGESTION_BACKPRESSURE',
      hotelId: 'hotel-123',
      message: 'Ingestion memory limit reached'
    });

    // Immediate second alert for same hotel should be suppressed
    await sendAlert({
      type: 'INGESTION_BACKPRESSURE',
      hotelId: 'hotel-123',
      message: 'Ingestion memory limit reached again'
    });

    const warnLogs = consoleWarnSpy.mock.calls.map(call => call.join(' '));
    const suppressed = warnLogs.find(l => l.includes('Alert Throttled'));
    expect(suppressed).toBeDefined();
    expect(suppressed).toContain('INGESTION_BACKPRESSURE:hotel-123');
  });
});
