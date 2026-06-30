/**
 * Analytics Utility for Hotel TV Portal
 */

const API_BASE_URL = `http://${window.location.hostname}:3000/api/v1`;

export type EventType = 
  | 'CHANNEL_WATCH'
  | 'APP_OPEN'
  | 'MENU_CLICK'
  | 'ITEM_VIEW'
  | 'ORDER_SUBMITTED'
  | 'HARDWARE_METRIC'
  | 'PLAYBACK_ERROR';

/**
 * Sends an analytics event to the backend without blocking the UI.
 * 
 * @param eventType The type of event (e.g., 'CHANNEL_WATCH')
 * @param value Optional JSON-serializable value (e.g., { channelId: '123' })
 * @param durationSeconds Optional duration in seconds (e.g., for watch time)
 */
export const trackEvent = async (
  eventType: EventType,
  value?: any,
  durationSeconds?: number
): Promise<void> => {
  try {
    // Attempt to get deviceId and roomNumber from localStorage
    const deviceId = localStorage.getItem('device_id') || localStorage.getItem('deviceId');
    const roomNumber = localStorage.getItem('room_number') || localStorage.getItem('roomNumber');

    if (!deviceId) {
      console.warn('[Analytics] Skipped tracking event: missing deviceId in localStorage');
      return;
    }

    const payload = {
      deviceId,
      roomId: roomNumber, // backend maps roomId to roomNumber roughly, or stores it
      eventType,
      value,
      durationSeconds,
    };

    // Fire and forget, no await to avoid blocking UI
    fetch(`${API_BASE_URL}/analytics/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }).catch(err => {
      // Silently catch network errors so the UI isn't disrupted
      console.error('[Analytics] Failed to send event (Network error):', err);
    });
  } catch (error) {
    // Catch any synchronous errors (e.g. localStorage access denied)
    console.error('[Analytics] Unexpected error tracking event:', error);
  }
};
