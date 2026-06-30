import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { trackEvent } from '../analytics';

// Mock global fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('Analytics Utility: trackEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock localStorage
    const localStorageMock = (() => {
      let store: Record<string, string> = {};
      return {
        getItem: vi.fn((key: string) => store[key] || null),
        setItem: vi.fn((key: string, value: string) => {
          store[key] = value.toString();
        }),
        clear: vi.fn(() => {
          store = {};
        })
      };
    })();
    
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true
    });
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('should not fire fetch if deviceId is missing from localStorage', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    await trackEvent('APP_OPEN', { app: 'Netflix' });
    
    expect(fetchMock).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Skipped tracking event: missing deviceId')
    );
    
    consoleWarnSpy.mockRestore();
  });

  it('should fire fetch with correct payload when deviceId exists', async () => {
    window.localStorage.setItem('deviceId', 'BOX-001');
    window.localStorage.setItem('roomNumber', 'RM-101');
    fetchMock.mockResolvedValueOnce({ ok: true });

    await trackEvent('CHANNEL_WATCH', { channelId: 'CH-1' }, 120);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    
    expect(url).toContain('/api/v1/analytics/events');
    expect(options.method).toBe('POST');
    
    const body = JSON.parse(options.body);
    expect(body).toEqual({
      deviceId: 'BOX-001',
      roomId: 'RM-101',
      eventType: 'CHANNEL_WATCH',
      value: { channelId: 'CH-1' },
      durationSeconds: 120
    });
  });

  it('should silently catch network errors without throwing', async () => {
    window.localStorage.setItem('deviceId', 'BOX-001');
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Mock a network failure
    fetchMock.mockRejectedValueOnce(new Error('Network offline'));

    // This should not throw an exception
    await expect(trackEvent('MENU_CLICK')).resolves.not.toThrow();

    // Verify it attempted to fetch
    expect(fetchMock).toHaveBeenCalledTimes(1);
    
    consoleErrorSpy.mockRestore();
  });
});
