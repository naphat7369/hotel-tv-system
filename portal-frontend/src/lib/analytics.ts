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
  // DISABLED: Analytics network requests are causing buggy Android TV WebViews to 
  // mistakenly trigger "Connection lost" (isForMainFrame bug).
  console.log('[Analytics Disabled]', eventType, value);
};
