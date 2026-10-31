import fs from 'fs';
import path from 'path';

export interface DeviceLogPayload {
  deviceId: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  tag: string;
  message: string;
  details?: any;
  timestamp?: string;
  roomNumber?: string;
  ipAddress?: string;
}

const LOG_DIR = path.resolve(__dirname, '../../logs');
const LOG_FILE = path.join(LOG_DIR, 'devices.log');
const MAX_LOG_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

// Ensure directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Rotate log file if it exceeds MAX_LOG_SIZE_BYTES
 */
function rotateLogIfNeeded() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const stats = fs.statSync(LOG_FILE);
      if (stats.size >= MAX_LOG_SIZE_BYTES) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(LOG_DIR, `devices__${timestamp}.log`);
        fs.renameSync(LOG_FILE, backupFile);
      }
    }
  } catch (err) {
    console.error('[DeviceLog] Failed to check/rotate log file:', err);
  }
}

/**
 * Append device log entry to file and stdout
 */
export function logDeviceEvent(data: DeviceLogPayload) {
  try {
    rotateLogIfNeeded();

    const timestamp = data.timestamp || new Date().toISOString();
    const level = (data.level || 'INFO').toUpperCase();
    const room = data.roomNumber ? `Room:${data.roomNumber}` : 'Unassigned';
    const tag = data.tag || 'Device';
    const device = data.deviceId || 'UnknownBox';
    const message = data.message || '';
    const detailsStr = data.details ? ` | ${typeof data.details === 'object' ? JSON.stringify(data.details) : data.details}` : '';

    const formattedLine = `[${timestamp}] [${level}] [${room}] [${device}] [${tag}] ${message}${detailsStr}\n`;

    fs.appendFileSync(LOG_FILE, formattedLine, 'utf8');

    // Also output to console so PM2 logs capture it
    console.log(`[DEVICE_LOG][${level}][${room}][${device}][${tag}] ${message}`);
  } catch (err) {
    console.error('[DeviceLog] Error writing device log:', err);
  }

}

/**
 * Retrieve recent device logs with optional filtering
 */
export function getRecentDeviceLogs(options: {
  boxSerial?: string;
  roomNumber?: string;
  level?: string;
  tag?: string;
  limit?: number;
} = {}): string[] {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];

    const limit = options.limit || 100;
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = content.split('\n').filter(line => line.trim().length > 0);

    const filtered = lines.filter(line => {
      if (options.boxSerial && !line.includes(`[${options.boxSerial}]`)) return false;
      if (options.roomNumber && !line.includes(`[Room:${options.roomNumber}]`)) return false;
      if (options.level && !line.includes(`[${options.level.toUpperCase()}]`)) return false;
      if (options.tag && !line.includes(`[${options.tag}]`)) return false;
      return true;
    });

    return filtered.slice(-limit);
  } catch (err) {
    console.error('[DeviceLog] Error reading device logs:', err);
    return [];
  }
}
