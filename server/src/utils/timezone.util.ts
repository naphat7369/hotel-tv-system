export const BANGKOK_TIMEZONE = 'Asia/Bangkok';

export interface BangkokTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  totalMinutes: number;
  totalSeconds: number;
}

const bangkokPartsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: BANGKOK_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/**
 * Extracts year, month, day, hour, minute, second in Asia/Bangkok timezone
 * using standard Intl.DateTimeFormat without manual millisecond offset arithmetic.
 */
export function getBangkokTimeParts(date: Date = new Date()): BangkokTimeParts {
  const parts = bangkokPartsFormatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') {
      map[p.type] = p.value;
    }
  }

  const year = parseInt(map.year || '1970', 10);
  const month = parseInt(map.month || '1', 10);
  const day = parseInt(map.day || '1', 10);
  // Intl hour12:false can occasionally format midnight as "24" in some engines
  const rawHour = parseInt(map.hour || '0', 10);
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = parseInt(map.minute || '0', 10);
  const second = parseInt(map.second || '0', 10);

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    totalMinutes: hour * 60 + minute,
    totalSeconds: hour * 3600 + minute * 60 + second,
  };
}

/**
 * Formats a Date/timestamp into "YYYY-MM-DD HH:mm:ss ICT (+07:00)" in Asia/Bangkok timezone.
 */
export function formatBangkokTimestamp(input: Date | number | string = new Date()): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return 'Invalid Date ICT (+07:00)';
  }

  const { year, month, day, hour, minute, second } = getBangkokTimeParts(date);
  const pad2 = (n: number) => String(n).padStart(2, '0');

  return `${year}-${pad2(month)}-${pad2(day)} ${pad2(hour)}:${pad2(minute)}:${pad2(second)} ICT (+07:00)`;
}

/**
 * Parses "HH:mm" string into seconds since midnight.
 */
export function parseHHMMToSeconds(hhmm: string, fallbackSeconds: number): number {
  if (typeof hhmm !== 'string') return fallbackSeconds;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm.trim());
  if (!match) return fallbackSeconds;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  return h * 3600 + m * 60;
}

/**
 * Evaluates whether the given Date falls inside the configured Maintenance Window
 * or its post-window buffer in Asia/Bangkok timezone.
 *
 * Example with default start="03:58", end="04:06", bufferMinutes=2:
 * - 03:57:59 -> inWindow: false, inBuffer: false, active: false
 * - 03:58:00 -> inWindow: true,  inBuffer: false, active: true
 * - 04:06:00 -> inWindow: true,  inBuffer: false, active: true
 * - 04:06:01 -> inWindow: false, inBuffer: true (if buffer>0), active: true (if buffer>0)
 * - 04:08:00 -> inWindow: false, inBuffer: true,  active: true
 * - 04:08:01 -> inWindow: false, inBuffer: false, active: false
 */
export function checkMaintenanceWindow(
  date: Date = new Date(),
  startHHMM: string = '03:58',
  endHHMM: string = '04:06',
  bufferMinutes: number = 2
): {
  inWindow: boolean;
  inBuffer: boolean;
  active: boolean;
} {
  const { totalSeconds } = getBangkokTimeParts(date);
  const startSec = parseHHMMToSeconds(startHHMM, 3 * 3600 + 58 * 60);
  const endSec = parseHHMMToSeconds(endHHMM, 4 * 3600 + 6 * 60);
  const safeBufferSec = Math.max(0, Math.floor((bufferMinutes || 0) * 60));
  const bufferEndSec = (endSec + safeBufferSec) % 86400;

  let inWindow = false;
  if (startSec <= endSec) {
    inWindow = totalSeconds >= startSec && totalSeconds <= endSec;
  } else {
    // Overnight window crossing midnight (e.g. 23:55 to 00:05)
    inWindow = totalSeconds >= startSec || totalSeconds <= endSec;
  }

  let inBuffer = false;
  if (!inWindow && safeBufferSec > 0) {
    if (endSec <= bufferEndSec) {
      inBuffer = totalSeconds > endSec && totalSeconds <= bufferEndSec;
    } else {
      inBuffer = totalSeconds > endSec || totalSeconds <= bufferEndSec;
    }
  }

  return {
    inWindow,
    inBuffer,
    active: inWindow || inBuffer,
  };
}

