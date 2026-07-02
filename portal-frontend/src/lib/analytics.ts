/**
 * Analytics Utility for Hotel TV Portal
 * 
 * Sends events through WebSocket (preferred) with HTTP fetch as fallback.
 * WebSocket is more reliable on Android TV WebViews because it's a persistent
 * connection that doesn't get cut off when navigation occurs.
 */

const API_BASE_URL = `http://${window.location.hostname}:3000/api/v1`;

// The active Socket.IO socket — set by App.tsx after connect
let _socket: any = null;

/**
 * Called by App.tsx once the socket is connected and registered.
 * After this, all trackEvent calls use WebSocket instead of HTTP.
 */
export const setAnalyticsSocket = (socket: any) => {
  _socket = socket;
};

export type EventType = 
  | 'CHANNEL_WATCH'
  | 'APP_OPEN'
  | 'APP_WATCH_DURATION'
  | 'MENU_CLICK'
  | 'ITEM_VIEW'
  | 'ORDER_SUBMITTED'
  | 'HARDWARE_METRIC'
  | 'PLAYBACK_ERROR';

/**
 * Sends an analytics event to the backend.
 * Uses WebSocket if available (preferred on Android TV), falls back to HTTP.
 *
 * @param eventType The type of event (e.g., 'APP_OPEN')
 * @param value Optional JSON-serializable value
 * @param durationSeconds Optional duration in seconds
 * @param socket Optional socket instance to use directly
 */
export const trackEvent = async (
  eventType: EventType,
  value?: any,
  durationSeconds?: number,
  socket?: any
): Promise<void> => {
  const deviceId = window.localStorage.getItem('deviceId') || window.localStorage.getItem('device_id') || 'BOX-101-A';
  const roomId = window.localStorage.getItem('roomNumber') || window.localStorage.getItem('room_number') || 'Unassigned';

  if (!deviceId) {
    console.warn('Skipped tracking event: missing deviceId');
    return;
  }

  const payload = {
    deviceId,
    roomId,
    eventType,
    value,
    durationSeconds
  };

  // Use the passed socket (if available) or the registered module socket
  const activeSocket = socket || _socket;

  // ── Primary: WebSocket ────────────────────────────────────────────────────
  if (activeSocket) {
    if (activeSocket.connected) {
      activeSocket.emit('track_event', payload);
      return;
    }
  } else {
    console.warn('[Analytics] activeSocket is null');
  }

  // ── Fallback: HTTP fetch ──────────────────────────────────────────────────
  try {
    await fetch(`${API_BASE_URL}/analytics/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error('Failed to send analytics event via HTTP', err);
  }
};
