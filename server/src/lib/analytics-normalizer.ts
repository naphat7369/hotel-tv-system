import crypto from 'crypto';
import { incrementDurationClamped } from './monitoring';

export interface NormalizedEvent {
  eventId: string;
  hotelId: string;
  roomId?: string | null;
  deviceId?: string | null;
  category: string;
  itemId: string;
  itemName: string;
  eventType: string;
  startedAt: Date;
  endedAt?: Date | null;
  durationSec?: number | null;
  extra?: any;
}

export interface SessionContext {
  hotelId?: string;
  roomUuid?: string | null;
  deviceUuid?: string | null;
}

/**
 * Standardize item IDs for clean aggregation (e.g., "Netflix" -> "netflix")
 */
export function normalizeItemId(rawId: string): string {
  if (!rawId) return 'unknown';
  const trimmed = String(rawId).toLowerCase().trim();

  // Known alias maps
  if (trimmed.includes('netflix')) return 'netflix';
  if (trimmed.includes('youtube')) return 'youtube';
  if (trimmed.includes('disney')) return 'disney_plus';
  if (trimmed.includes('prime')) return 'amazon_prime';
  if (trimmed.includes('spotify')) return 'spotify';

  // Replace special characters and extra spaces
  return trimmed.replace(/[\s\-_]+/g, '_');
}

/**
 * Normalizes raw incoming TV portal payloads into a structured, validated event
 */
export function normalizeEvent(
  rawPayload: any,
  session?: SessionContext
): NormalizedEvent | null {
  if (!rawPayload || typeof rawPayload !== 'object') {
    console.warn('[Normalizer] Rejected non-object payload');
    return null;
  }

  const eventType = String(rawPayload.eventType || '').trim().toUpperCase();
  if (!eventType) {
    console.warn('[Normalizer] Rejected event: missing eventType');
    return null;
  }

  // Filter out internal Hotel TV app from app analytics
  if (eventType === 'APP_OPEN' || eventType === 'APP_WATCH_DURATION') {
    const val = rawPayload.value || {};
    const appName = String(val.appName || '').toLowerCase();
    const pkgName = String(val.packageName || '').toLowerCase();
    if (pkgName === 'com.hotel.tvapp' || appName.includes('hotel tv')) {
      return null; // Ignore self events
    }
  }

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const hotelId = session?.hotelId || rawPayload.hotelId || '123e4567-e89b-12d3-a456-426614174000';
  const rawRoomCandidate = session?.roomUuid || rawPayload.roomId || null;
  const rawDeviceCandidate = session?.deviceUuid || rawPayload.deviceId || null;

  const roomId = (rawRoomCandidate && UUID_REGEX.test(rawRoomCandidate)) ? rawRoomCandidate : null;
  const deviceId = (rawDeviceCandidate && UUID_REGEX.test(rawDeviceCandidate)) ? rawDeviceCandidate : null;
  const eventId = rawPayload.eventId || crypto.randomUUID();

  // ── 1. Duration Guard Logic ─────────────────────────────────────────────
  let validDuration: number | null = null;
  let startedAt: Date;
  let endedAt: Date | null = null;

  const rawDuration = rawPayload.durationSeconds ?? rawPayload.durationSec;
  if (typeof rawDuration === 'number' && Number.isFinite(rawDuration)) {
    if (rawDuration > 0) {
      if (rawDuration > 86400) {
        // Anomalous duration (>24h): Clamp and track metric
        incrementDurationClamped(rawPayload.deviceId, rawDuration);
        validDuration = 86400;
      } else {
        validDuration = Math.floor(rawDuration);
      }
      endedAt = new Date();
      startedAt = new Date(endedAt.getTime() - validDuration * 1000);
    } else {
      // Clock skew / negative duration: treat as point-in-time
      startedAt = new Date();
    }
  } else {
    // Point-in-time event
    startedAt = new Date();
  }

  // ── 2. Categorization & Metadata Extraction ─────────────────────────────
  let category = 'OTHER';
  let itemId = 'unknown';
  let itemName = 'Unknown';
  const value = rawPayload.value || rawPayload.eventData || {};

  switch (eventType) {
    case 'CHANNEL_WATCH': {
      category = 'CHANNEL';
      const rawId = value.channelId || value.id || value.number || 'unknown';
      itemId = normalizeItemId(String(rawId));
      itemName = String(value.name || `Channel ${rawId}`);
      break;
    }
    case 'APP_OPEN':
    case 'APP_WATCH_DURATION': {
      category = 'APP';
      const rawId = value.packageName || value.appName || 'unknown';
      itemId = normalizeItemId(String(rawId));
      itemName = String(value.appName || value.packageName || 'Unknown App');
      break;
    }
    case 'MENU_CLICK': {
      category = 'MENU';
      const rawId = value.menu || value.id || 'unknown';
      itemId = normalizeItemId(String(rawId));
      itemName = String(value.menu || value.name || rawId);
      break;
    }
    case 'ITEM_VIEW': {
      const section = String(value.section || '').toLowerCase();
      category = section === 'dining' ? 'DINING' : 'SERVICES';
      const rawId = value.itemId || value.id || 'unknown';
      itemId = normalizeItemId(String(rawId));
      itemName = String(value.name || value.title || (section === 'dining' ? `Dining ${rawId}` : `Service ${rawId}`));
      break;
    }
    case 'ORDER_SUBMITTED': {
      category = 'ORDER';
      itemId = 'room_service';
      itemName = 'Room Service Order';
      break;
    }
    case 'HARDWARE_METRIC': {
      category = 'HARDWARE';
      itemId = 'system_metric';
      itemName = 'Hardware Metric';
      break;
    }
    case 'PLAYBACK_ERROR': {
      category = 'ERROR';
      itemId = 'playback_error';
      itemName = 'IPTV Signal Error';
      break;
    }
    default: {
      category = 'OTHER';
      itemId = normalizeItemId(String(value.id || eventType));
      itemName = String(value.name || eventType);
      break;
    }
  }

  // Preserve extra metadata
  const extra = {
    ...value,
    originalDeviceSerial: rawPayload.deviceId,
    originalRoomNumber: rawPayload.roomId,
    guestType: rawPayload.guestType || null
  };

  return {
    eventId,
    hotelId,
    roomId,
    deviceId,
    category,
    itemId,
    itemName,
    eventType,
    startedAt,
    endedAt,
    durationSec: validDuration,
    extra
  };
}
