import axios from 'axios';

export interface AlertOptions {
  type: string;
  message: string;
  severity?: 'info' | 'warning' | 'critical';
  hotelId?: string;
  metadata?: Record<string, any>;
}

interface CooldownEntry {
  lastSent: number;
  suppressedCount: number;
}

// 15-minute cooldown per alert key (type + hotelId)
const COOLDOWN_MS = 15 * 60 * 1000;
const alertCooldownMap = new Map<string, CooldownEntry>();

// Metric Counters
let durationClampedCount = 0;
const clampedEventsLog: Array<{ deviceId?: string; originalSeconds: number; timestamp: string }> = [];

/**
 * Increment and log anomalous duration clamp events (> 86400s)
 */
export function incrementDurationClamped(deviceId?: string, originalSeconds?: number) {
  durationClampedCount++;
  if (clampedEventsLog.length > 100) {
    clampedEventsLog.shift(); // Keep last 100 in memory
  }
  clampedEventsLog.push({
    deviceId,
    originalSeconds: originalSeconds || 0,
    timestamp: new Date().toISOString()
  });

  console.warn(`[Metrics] Anomalous duration clamped: deviceId=${deviceId || 'unknown'}, original=${originalSeconds}s. Total clamped so far: ${durationClampedCount}`);
}

/**
 * Get current monitoring metrics
 */
export function getMonitoringMetrics() {
  return {
    durationClampedCount,
    recentClampedEvents: clampedEventsLog.slice(-10),
    activeCooldowns: Array.from(alertCooldownMap.entries()).map(([key, val]) => ({
      key,
      lastSent: new Date(val.lastSent).toISOString(),
      suppressedCount: val.suppressedCount
    }))
  };
}

export function recordMetric(name: string, value: number = 1) {
  if (name === 'duration_clamped_count') {
    durationClampedCount += value;
  }
}

export function getMetricCount(name: string): number {
  if (name === 'duration_clamped_count') {
    return durationClampedCount;
  }
  return 0;
}

export function resetMetricsForTesting() {
  durationClampedCount = 0;
  clampedEventsLog.length = 0;
  alertCooldownMap.clear();
}

/**
 * Dispatches an alert with a 15-minute cooldown scoped by `type + hotelId`
 */
export async function sendAlert(options: AlertOptions): Promise<boolean> {
  const { type, message, severity = 'warning', hotelId = 'system', metadata } = options;
  const cooldownKey = `${type}:${hotelId}`;
  const now = Date.now();
  const entry = alertCooldownMap.get(cooldownKey);

  if (entry && now - entry.lastSent < COOLDOWN_MS) {
    // Within cooldown: suppress and increment count
    entry.suppressedCount++;
    console.warn(`[Alert Throttled] [${severity.toUpperCase()}] [${cooldownKey}] ${message} (Suppressed ${entry.suppressedCount} duplicate(s) so far)`);
    return false;
  }

  const suppressedSummary = entry && entry.suppressedCount > 0
    ? `\n*(Note: Suppressed ${entry.suppressedCount} duplicate alert(s) in the past 15 minutes)*`
    : '';

  alertCooldownMap.set(cooldownKey, {
    lastSent: now,
    suppressedCount: 0
  });

  const fullMessage = `[${severity.toUpperCase()}] [Hotel: ${hotelId}] [${type}] ${message}${suppressedSummary}`;
  console.error(`[Alert] ${fullMessage}`, metadata || '');

  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) {
    return true; // Alert logged to console
  }

  try {
    await axios.post(webhookUrl, {
      text: fullMessage,
      attachments: metadata ? [{
        color: severity === 'critical' ? '#ff0000' : severity === 'warning' ? '#ffaa00' : '#00aa00',
        title: `Hotel TV System Alert: ${type}`,
        text: JSON.stringify(metadata, null, 2),
        ts: Math.floor(now / 1000)
      }] : undefined
    }, { timeout: 5000 });
    return true;
  } catch (err: any) {
    console.error(`[Alert] Failed to dispatch webhook to ${webhookUrl}:`, err.message);
    return false;
  }
}
