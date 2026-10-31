import fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';
import nodemailer from 'nodemailer';
import { PrismaClient } from '@prisma/client';
import * as redisModule from '../lib/redis';
import {
  encryptSecret,
  decryptSecret,
  maskSecret,
  shouldKeepExistingSecret,
  isEncryptedSecret,
} from '../utils/crypto.util';
import {
  formatBangkokTimestamp,
  checkMaintenanceWindow,
  getBangkokTimeParts,
} from '../utils/timezone.util';

export type IncidentSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type IncidentStatus = 'OPEN' | 'FLAPPING' | 'RESOLVED';
export type ChannelDeliveryStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED' | 'MUTED';

export interface IncidentConfig {
  enabled: boolean;
  muteUntil: string | null;
  telegramEnabled: boolean;
  telegramBotToken: string;
  telegramChatId: string;
  telegramMinSeverity: IncidentSeverity;
  emailEnabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  alertEmailFrom: string;
  alertEmailTo: string;
  emailMinSeverity: IncidentSeverity;
  maintenanceWindowStart: string;
  maintenanceWindowEnd: string;
  maintenanceBufferMinutes: number;
  iptvGracePeriodMinutes: number;
  flappingWindowMinutes: number;
  roomBatchWindowSeconds: number;
  stormThresholdRooms: number;
  alertCooldownMinutes: number;
  resolvedCooldownMinutes: number;
  escalationMinutes: number;
  tvBoxAutoResolveMinutes: number;
  pmsSilenceThresholdHours: number;
  pmsHealthUrl: string;
  webviewErrorAllowList: string[];
}

export interface IncidentStateRecord {
  incidentId: string;
  incidentKey: string;
  category: 'CORE' | 'IPTV' | 'TV_BOX' | 'ADB';
  type: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  summary: string;
  openedAt: number;
  lastAlertAt: number;
  lastErrorAt: number;
  lastResolvedAt?: number;
  cooldownUntil: number;
  resolvedCooldownUntil: number;
  suppressedCount: number;
  escalationCount: number;
  flappingCount: number;
  affectedRooms: string[];
  telegramStatus: ChannelDeliveryStatus;
  emailStatus: ChannelDeliveryStatus;
  metadata?: Record<string, any>;
}

export interface RoomBatchEntry {
  roomNumber: string;
  deviceId: string;
  ipAddress?: string;
  floor: string;
  vlan: string;
  message: string;
  occurredAt: number;
}

export interface RetryQueueItem {
  id: string;
  incidentId: string;
  incidentKey: string;
  title: string;
  htmlBody: string;
  plainTextBody: string;
  severity: IncidentSeverity;
  occurredAt: number;
  attempt: number;
  nextRetryAt: number;
  retryTelegram: boolean;
  retryEmail: boolean;
}

const DEFAULT_WEBVIEW_ALLOW_LIST = [
  'ERR_CONNECTION_TIMED_OUT',
  'ERR_ADDRESS_UNREACHABLE',
  'ERR_CONNECTION_REFUSED',
  'ERR_NAME_NOT_RESOLVED',
  'ERR_CONNECTION_RESET',
  'ERR_INTERNET_DISCONNECTED',
  'ERR_SSL_',
  'ERR_CERT_',
  'HTTP_5',
  'HTTP ERROR (5',
  'TIMED_OUT',
  'UNREACHABLE',
];

const SEVERITY_RANK: Record<IncidentSeverity, number> = {
  INFO: 1,
  WARNING: 2,
  CRITICAL: 3,
};

const REDIS_STATE_PREFIX = 'incident:state:';
const REDIS_FAILURES_PREFIX = 'incident:failures:';
const REDIS_RETRY_QUEUE_KEY = 'incident:retry_queue';
const REDIS_BOOT_HISTORY_KEY = 'incident:boot_history';
const STATE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const FAILURES_TTL_SECONDS = 60 * 60;       // 1 hour
const MAX_RETRY_ATTEMPTS = 5;
const TELEGRAM_MAX_LENGTH = 4096;
const TELEGRAM_SAFE_CHUNK_LENGTH = 3800;
const JSONL_MAX_BYTES = 10 * 1024 * 1024;   // 10 MB
const JSONL_MAX_BACKUPS = 5;

const LOG_DIR = path.resolve(__dirname, '../../logs');
const HEARTBEAT_FILE = path.join(LOG_DIR, '.heartbeat.json');
const INCIDENT_JSONL_FILE = path.join(LOG_DIR, 'incidents.jsonl');

/**
 * Escapes external dynamic text for safe inclusion inside Telegram HTML messages.
 */
export function escapeTelegramHtml(input: unknown): string {
  const str = String(input ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Strips HTML tags for plain-text fallback when Telegram returns HTTP 400.
 */
export function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

/**
 * Splits a message exceeding 4,096 characters into safe chunks at line boundaries.
 */
export function splitTelegramMessage(text: string, maxLen = TELEGRAM_MAX_LENGTH): string[] {
  if (text.length <= maxLen) {
    return [text];
  }

  const chunkLimit = Math.min(TELEGRAM_SAFE_CHUNK_LENGTH, maxLen - 64);
  const lines = text.split('\n');
  const rawChunks: string[] = [];
  let current = '';

  for (const line of lines) {
    if (line.length > chunkLimit) {
      if (current.length > 0) {
        rawChunks.push(current);
        current = '';
      }
      for (let i = 0; i < line.length; i += chunkLimit) {
        rawChunks.push(line.slice(i, i + chunkLimit));
      }
      continue;
    }

    const candidate = current.length === 0 ? line : `${current}\n${line}`;
    if (candidate.length > chunkLimit) {
      rawChunks.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }

  if (current.length > 0) {
    rawChunks.push(current);
  }

  const total = rawChunks.length;
  return rawChunks.map((chunk, idx) => `[ส่วนที่ ${idx + 1}/${total}]\n${chunk}`);
}

/**
 * Resolves floor label strictly from dbFloor or a 3-4 digit numeric room number.
 * Never guesses if the room number contains letters or is not 3-4 digits.
 */
export function resolveFloor(roomNumber?: string | null, dbFloor?: number | null): string {
  if (typeof dbFloor === 'number' && Number.isInteger(dbFloor) && dbFloor > 0) {
    return `ชั้น ${dbFloor}`;
  }

  const trimmed = String(roomNumber ?? '').trim();
  if (!/^\d{3,4}$/.test(trimmed)) {
    return 'ไม่ทราบชั้น';
  }

  if (trimmed.length === 3) {
    const floorNum = parseInt(trimmed.slice(0, 1), 10);
    if (floorNum <= 0) return 'ไม่ทราบชั้น';
    return `ชั้น ${floorNum}`;
  }

  // 4 digits (e.g. 1103 -> 11, 0102 -> invalid leading zero)
  if (trimmed.startsWith('0')) {
    return 'ไม่ทราบชั้น';
  }
  const floorNum = parseInt(trimmed.slice(0, 2), 10);
  if (floorNum <= 0) return 'ไม่ทราบชั้น';
  return `ชั้น ${floorNum}`;
}

/**
 * Extracts /24 subnet from IPv4 address for VLAN/Subnet grouping.
 */
export function resolveVlanSubnet(ipAddress?: string | null): string {
  const trimmed = String(ipAddress ?? '').trim();
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(trimmed);
  if (!match) {
    return 'ไม่ทราบวงแลน';
  }
  const octets = [match[1], match[2], match[3], match[4]].map((n) => parseInt(n, 10));
  if (octets.some((o) => o < 0 || o > 255)) {
    return 'ไม่ทราบวงแลน';
  }
  return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
}

/**
 * Checks if a URL points to a sub-resource (image, font, stylesheet, script) rather than main frame.
 */
export function isSubResourceUrl(url?: string | null): boolean {
  if (!url) return false;
  const cleanUrl = url.split('?')[0].split('#')[0].toLowerCase();
  return /\.(png|jpg|jpeg|webp|gif|ico|svg|woff|woff2|ttf|eot|otf|css|js|map|mp4|mp3|wav)$/i.test(
    cleanUrl
  );
}

const defaultPrisma = new PrismaClient();

export class IncidentService {
  private static prisma: PrismaClient = defaultPrisma;
  private static customRedisClient: any = null;
  private static get redisClient(): any {
    return this.customRedisClient || (redisModule as any).redis;
  }
  private static set redisClient(client: any) {
    this.customRedisClient = client;
  }
  private static config: IncidentConfig = IncidentService.getDefaultConfig();
  private static initialized = false;

  // State maps
  private static stateMap = new Map<string, IncidentStateRecord>();
  private static consecutiveFailuresMap = new Map<string, number>();
  private static consecutiveSuccessesMap = new Map<string, number>();

  // TV Box per-room health tracking for Inferred Auto-Resolve & Cooldown
  private static roomErrorStateMap = new Map<
    string,
    {
      incidentKey: string;
      type: string;
      roomNumber: string;
      deviceId: string;
      openedAt: number;
      lastErrorAt: number;
      lastHeartbeatAt: number;
      cooldownUntil: number;
      suppressedCount: number;
    }
  >();
  private static pendingResolvedRoomsDigest = new Map<
    string,
    { roomNumber: string; type: string; resolvedAt: number }
  >();

  // Room Batching queues (45s window)
  private static batchQueues = new Map<string, Map<string, RoomBatchEntry>>();
  private static batchTimers = new Map<string, NodeJS.Timeout>();

  // Delivery queues
  private static telegramSendQueue: Array<() => Promise<void>> = [];
  private static isProcessingTelegramQueue = false;
  private static retryQueue: RetryQueueItem[] = [];

  // Maintenance window tracking
  private static wasInMaintenanceWindow = false;

  // Periodic timers
  private static heartbeatTimer: NodeJS.Timeout | null = null;
  private static healthCheckTimer: NodeJS.Timeout | null = null;
  private static retryTimer: NodeJS.Timeout | null = null;
  private static digestTimer: NodeJS.Timeout | null = null;

  // PMS passive tracking
  private static lastPmsWebhookAt: number = Date.now();
  private static consecutivePmsFailures = 0;

  // Startup loop rate limit
  private static lastStartupAlertAt = 0;

  public static setDependenciesForTesting(deps: { prisma?: any; redis?: any }) {
    if (deps.prisma) this.prisma = deps.prisma;
    if (deps.redis) this.redisClient = deps.redis;
  }

  public static getDefaultConfig(): IncidentConfig {
    // Default INCIDENT_SYSTEM_ENABLED=false on first deploy unless explicitly enabled
    const envEnabled = process.env.INCIDENT_SYSTEM_ENABLED === 'true';
    return {
      enabled: envEnabled,
      muteUntil: null,
      telegramEnabled: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
      telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
      telegramMinSeverity: 'INFO',
      emailEnabled: Boolean(process.env.SMTP_HOST && process.env.ALERT_EMAIL_TO),
      smtpHost: process.env.SMTP_HOST || '',
      smtpPort: parseInt(process.env.SMTP_PORT || '587', 10) || 587,
      smtpSecure: process.env.SMTP_SECURE === 'true',
      smtpUser: process.env.SMTP_USER || '',
      smtpPass: process.env.SMTP_PASS || '',
      alertEmailFrom: process.env.ALERT_EMAIL_FROM || process.env.SMTP_USER || 'noreply@hotel-tv.local',
      alertEmailTo: process.env.ALERT_EMAIL_TO || '',
      emailMinSeverity: 'WARNING',
      maintenanceWindowStart: process.env.MAINTENANCE_WINDOW_START || '03:58',
      maintenanceWindowEnd: process.env.MAINTENANCE_WINDOW_END || '04:06',
      maintenanceBufferMinutes: parseInt(process.env.MAINTENANCE_BUFFER_MINUTES || '2', 10) || 2,
      iptvGracePeriodMinutes: 3,
      flappingWindowMinutes: 10,
      roomBatchWindowSeconds: 45,
      stormThresholdRooms: 10,
      alertCooldownMinutes: 15,
      resolvedCooldownMinutes: 2,
      escalationMinutes: 60,
      tvBoxAutoResolveMinutes: 10,
      pmsSilenceThresholdHours: 12,
      pmsHealthUrl: process.env.PMS_HEALTH_URL || '',
      webviewErrorAllowList: [...DEFAULT_WEBVIEW_ALLOW_LIST],
    };
  }

  public static isEnabled(): boolean {
    return Boolean(this.config.enabled);
  }

  public static isMuted(now: number = Date.now()): boolean {
    if (!this.config.muteUntil) return false;
    const untilMs = new Date(this.config.muteUntil).getTime();
    if (Number.isNaN(untilMs)) return false;
    return now < untilMs;
  }

  /**
   * Ensures log directory and files use strict permissions (0700 dir / 0600 files).
   */
  private static ensureLogDirectory(): void {
    try {
      if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 });
      }
    } catch {
      // Ignore filesystem errors so main flow never blocks
    }
  }

  /**
   * Appends incident record to rotated JSONL fallback file with 0600 permissions.
   */
  private static appendFallbackJsonl(record: Record<string, any>): void {
    try {
      this.ensureLogDirectory();
      if (fs.existsSync(INCIDENT_JSONL_FILE)) {
        const stats = fs.statSync(INCIDENT_JSONL_FILE);
        if (stats.size >= JSONL_MAX_BYTES) {
          for (let i = JSONL_MAX_BACKUPS - 1; i >= 1; i--) {
            const src = `${INCIDENT_JSONL_FILE}.${i}`;
            const dst = `${INCIDENT_JSONL_FILE}.${i + 1}`;
            if (fs.existsSync(src)) {
              fs.renameSync(src, dst);
            }
          }
          fs.renameSync(INCIDENT_JSONL_FILE, `${INCIDENT_JSONL_FILE}.1`);
        }
      }
      fs.appendFileSync(INCIDENT_JSONL_FILE, `${JSON.stringify(record)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
      try {
        fs.chmodSync(INCIDENT_JSONL_FILE, 0o600);
      } catch {}
    } catch (err: any) {
      console.error('[IncidentService] Fallback JSONL write error:', err?.message || err);
    }
  }

  /**
   * Writes heartbeat timestamp every 30s to distinguish crashes/power loss from normal restarts.
   */
  public static writeHeartbeat(gracefulShutdown = false, now = Date.now()): void {
    try {
      this.ensureLogDirectory();
      const payload = {
        lastHeartbeatAt: now,
        formattedTime: formatBangkokTimestamp(now),
        pid: process.pid,
        osUptimeSec: Math.floor(os.uptime()),
        gracefulShutdown,
      };
      fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify(payload, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });
      try {
        fs.chmodSync(HEARTBEAT_FILE, 0o600);
      } catch {}
    } catch {
      // Non-blocking
    }
  }

  /**
   * Reads previous heartbeat file to classify startup cause and downtime duration.
   */
  private static analyzePreviousHeartbeat(now = Date.now()): {
    startupType: 'HOST_REBOOT' | 'PROCESS_CRASH' | 'NORMAL_RESTART' | 'FIRST_BOOT';
    downtimeSec: number;
  } {
    const osUptimeSec = Math.floor(os.uptime());
    try {
      if (!fs.existsSync(HEARTBEAT_FILE)) {
        return {
          startupType: osUptimeSec < 300 ? 'HOST_REBOOT' : 'FIRST_BOOT',
          downtimeSec: 0,
        };
      }
      const raw = JSON.parse(fs.readFileSync(HEARTBEAT_FILE, 'utf8'));
      const lastHeartbeatAt = Number(raw?.lastHeartbeatAt) || 0;
      const downtimeSec = lastHeartbeatAt > 0 ? Math.max(0, Math.floor((now - lastHeartbeatAt) / 1000)) : 0;

      if (osUptimeSec < 300) {
        return { startupType: 'HOST_REBOOT', downtimeSec };
      }
      if (raw?.gracefulShutdown === true) {
        return { startupType: 'NORMAL_RESTART', downtimeSec };
      }
      if (downtimeSec > 45) {
        return { startupType: 'PROCESS_CRASH', downtimeSec };
      }
      return { startupType: 'NORMAL_RESTART', downtimeSec };
    } catch {
      return {
        startupType: osUptimeSec < 300 ? 'HOST_REBOOT' : 'NORMAL_RESTART',
        downtimeSec: 0,
      };
    }
  }

  /**
   * Initializes IncidentService with exponential backoff retry for DB/Redis,
   * state restoration, and startup/restart-loop detection.
   * When INCIDENT_SYSTEM_ENABLED=false, exits immediately without writing heartbeat,
   * opening timers/health checks, querying Redis, or sending notifications.
   */
  public static async initialize(): Promise<void> {
    this.config = this.getDefaultConfig();
    if (!this.isEnabled()) {
      return;
    }

    // 1. Retry loading config and state with exponential backoff
    let loadedFromDb = false;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        await this.loadConfigFromDb();
        loadedFromDb = true;
        break;
      } catch {
        if (attempt === 5) {
          console.warn('[IncidentService] Could not load config from DB after 5 attempts; using .env fallback.');
        } else {
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }

    if (!this.isEnabled()) {
      return;
    }

    // 2. Restore persisted OPEN/FLAPPING states and counters from Redis / DB
    await this.restorePersistedState();

    // 3. Check startup type & restart loop
    const now = Date.now();
    const { startupType, downtimeSec } = this.analyzePreviousHeartbeat(now);
    this.writeHeartbeat(false, now);

    await this.handleStartupNotification(startupType, downtimeSec, loadedFromDb, now);

    // 4. Start background timers
    this.startBackgroundTimers();

    this.initialized = true;
  }

  public static startBackgroundTimers(): void {
    this.stopBackgroundTimers();
    if (!this.isEnabled()) return;

    this.heartbeatTimer = setInterval(() => this.writeHeartbeat(false), 30 * 1000);
    this.healthCheckTimer = setInterval(() => {
      this.runPeriodicChecks().catch(() => {});
    }, 60 * 1000);
    this.retryTimer = setInterval(() => {
      this.processRetryQueue().catch(() => {});
    }, 15 * 1000);
    this.digestTimer = setInterval(() => {
      this.flushResolvedRoomsDigest().catch(() => {});
    }, 5 * 60 * 1000);
  }

  public static stopBackgroundTimers(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.digestTimer) {
      clearInterval(this.digestTimer);
      this.digestTimer = null;
    }
  }

  /**
   * Graceful shutdown (SIGTERM / SIGINT): flushes all pending room batches and records clean exit.
   */
  public static async shutdown(): Promise<void> {
    try {
      this.stopBackgroundTimers();
      if (!this.isEnabled()) return;

      this.writeHeartbeat(true, Date.now());

      // Flush all pending batch queues immediately
      const batchKeys = Array.from(this.batchQueues.keys());
      for (const batchKey of batchKeys) {
        const timer = this.batchTimers.get(batchKey);
        if (timer) clearTimeout(timer);
        this.batchTimers.delete(batchKey);
        await this.flushRoomBatch(batchKey);
      }

      await this.flushResolvedRoomsDigest();
    } catch (err: any) {
      console.error('[IncidentService] Error during graceful shutdown:', err?.message || err);
    }
  }

  /**
   * Loads configuration from SystemSetting table ("incident.config") and decrypts secrets.
   */
  public static async loadConfigFromDb(): Promise<IncidentConfig> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'incident.config' },
    });

    const base = this.getDefaultConfig();
    if (!setting || !setting.value || typeof setting.value !== 'object') {
      this.config = base;
      return this.config;
    }

    const raw = setting.value as Record<string, any>;
    this.config = {
      ...base,
      ...raw,
      telegramBotToken: raw.telegramBotToken ? decryptSecret(String(raw.telegramBotToken)) : base.telegramBotToken,
      smtpPass: raw.smtpPass ? decryptSecret(String(raw.smtpPass)) : base.smtpPass,
      webviewErrorAllowList: Array.isArray(raw.webviewErrorAllowList)
        ? raw.webviewErrorAllowList
        : base.webviewErrorAllowList,
    };

    return this.config;
  }

  /**
   * Returns masked configuration safe for GET /api/v1/settings/incidents/config.
   * Never exposes plaintext or encrypted secret strings.
   */
  public static getPublicConfig(): Record<string, any> {
    const tgMask = maskSecret(this.config.telegramBotToken);
    const smtpMask = maskSecret(this.config.smtpPass);

    return {
      ...this.config,
      telegramBotToken: tgMask.masked,
      telegramBotTokenIsSet: tgMask.isSet,
      smtpPass: smtpMask.masked,
      smtpPassIsSet: smtpMask.isSet,
    };
  }

  /**
   * Updates configuration in SystemSetting with AES-256-GCM encryption for secrets.
   * Empty or masked secret fields preserve the existing secret.
   */
  public static async updateConfig(
    updates: Partial<IncidentConfig> & {
      clearTelegramToken?: boolean;
      clearSmtpPass?: boolean;
    },
    updatedBy = 'admin'
  ): Promise<Record<string, any>> {
    const nextConfig: IncidentConfig = {
      ...this.config,
    };

    for (const [k, v] of Object.entries(updates)) {
      if (k === 'telegramBotToken' || k === 'smtpPass' || k === 'clearTelegramToken' || k === 'clearSmtpPass') {
        continue;
      }
      if (v !== undefined) {
        (nextConfig as any)[k] = v;
      }
    }

    if (updates.clearTelegramToken) {
      nextConfig.telegramBotToken = '';
    } else if (!shouldKeepExistingSecret(updates.telegramBotToken)) {
      nextConfig.telegramBotToken = String(updates.telegramBotToken).trim();
    }

    if (updates.clearSmtpPass) {
      nextConfig.smtpPass = '';
    } else if (!shouldKeepExistingSecret(updates.smtpPass)) {
      nextConfig.smtpPass = String(updates.smtpPass).trim();
    }

    this.config = nextConfig;

    // Encrypt secrets before persisting to DB
    const dbPayload = {
      ...nextConfig,
      telegramBotToken: nextConfig.telegramBotToken ? encryptSecret(nextConfig.telegramBotToken) : '',
      smtpPass: nextConfig.smtpPass ? encryptSecret(nextConfig.smtpPass) : '',
    };

    await this.prisma.systemSetting.upsert({
      where: { key: 'incident.config' },
      update: {
        value: dbPayload,
        updatedBy,
      },
      create: {
        key: 'incident.config',
        value: dbPayload,
        updatedBy,
      },
    });

    return this.getPublicConfig();
  }

  /**
   * Temporarily mutes/silences notifications for durationMinutes (0 = unmute).
   */
  public static async setMute(durationMinutes: number, updatedBy = 'admin'): Promise<{ muteUntil: string | null }> {
    const muteUntil =
      durationMinutes > 0 ? new Date(Date.now() + durationMinutes * 60 * 1000).toISOString() : null;
    await this.updateConfig({ muteUntil }, updatedBy);
    return { muteUntil };
  }

  /**
   * Persists an IncidentStateRecord to Redis (with 7-day TTL) and PostgreSQL Incident table.
   */
  public static async persistIncidentState(state: IncidentStateRecord): Promise<void> {
    this.stateMap.set(state.incidentKey, state);

    // 1. Save to Redis with TTL
    try {
      await this.redisClient.set(
        `${REDIS_STATE_PREFIX}${state.incidentKey}`,
        JSON.stringify(state),
        'EX',
        STATE_TTL_SECONDS
      );
    } catch {
      // Fallback continues to DB / JSONL
    }

    // 2. Upsert to PostgreSQL Incident table
    try {
      const data = {
        incidentKey: state.incidentKey,
        category: state.category,
        type: state.type,
        severity: state.severity,
        status: state.status,
        title: state.title,
        summary: state.summary,
        affectedRooms: state.affectedRooms,
        floorBreakdown: state.metadata?.floorBreakdown ?? null,
        vlanBreakdown: state.metadata?.vlanBreakdown ?? null,
        suppressedCount: state.suppressedCount,
        escalationCount: state.escalationCount,
        flappingCount: state.flappingCount,
        telegramStatus: state.telegramStatus,
        emailStatus: state.emailStatus,
        occurredAt: new Date(state.openedAt),
        lastAlertAt: state.lastAlertAt ? new Date(state.lastAlertAt) : null,
        resolvedAt: state.lastResolvedAt ? new Date(state.lastResolvedAt) : null,
        durationSec:
          state.status === 'RESOLVED' && state.lastResolvedAt
            ? Math.max(0, Math.floor((state.lastResolvedAt - state.openedAt) / 1000))
            : null,
        metadata: state.metadata ?? {},
      };

      await this.prisma.incident.upsert({
        where: { id: state.incidentId },
        update: data,
        create: {
          id: state.incidentId,
          ...data,
        },
      });
    } catch {
      this.appendFallbackJsonl({
        ...state,
        savedAt: formatBangkokTimestamp(),
      });
    }
  }

  /**
   * Restores OPEN/FLAPPING incident states, cooldowns, and consecutiveFailures from Redis or DB.
   */
  public static async restorePersistedState(): Promise<void> {
    // 1. Try Redis state keys
    try {
      const keys: string[] = await this.redisClient.keys(`${REDIS_STATE_PREFIX}*`);
      for (const key of keys) {
        const raw = await this.redisClient.get(key);
        if (!raw) continue;
        const parsed: IncidentStateRecord = JSON.parse(raw);
        this.stateMap.set(parsed.incidentKey, parsed);
      }

      const failureKeys: string[] = await this.redisClient.keys(`${REDIS_FAILURES_PREFIX}*`);
      for (const fKey of failureKeys) {
        const val = await this.redisClient.get(fKey);
        const target = fKey.slice(REDIS_FAILURES_PREFIX.length);
        if (val !== null) {
          this.consecutiveFailuresMap.set(target, parseInt(val, 10) || 0);
        }
      }

      const retryItems: string[] = await this.redisClient.lrange(REDIS_RETRY_QUEUE_KEY, 0, -1);
      if (Array.isArray(retryItems) && retryItems.length > 0) {
        this.retryQueue = retryItems.map((item) => JSON.parse(item));
      }
    } catch {
      // Redis unavailable, fallback to DB
    }

    // 2. Fallback / supplement with OPEN incidents from PostgreSQL
    try {
      const openDbIncidents = await this.prisma.incident.findMany({
        where: { status: { in: ['OPEN', 'FLAPPING'] } },
      });
      for (const inc of openDbIncidents) {
        if (!this.stateMap.has(inc.incidentKey)) {
          const openedAt = inc.occurredAt.getTime();
          const lastAlertAt = inc.lastAlertAt ? inc.lastAlertAt.getTime() : openedAt;
          this.stateMap.set(inc.incidentKey, {
            incidentId: inc.id,
            incidentKey: inc.incidentKey,
            category: inc.category as any,
            type: inc.type,
            severity: inc.severity as IncidentSeverity,
            status: inc.status as IncidentStatus,
            title: inc.title,
            summary: inc.summary,
            openedAt,
            lastAlertAt,
            lastErrorAt: lastAlertAt,
            cooldownUntil: lastAlertAt + this.config.alertCooldownMinutes * 60 * 1000,
            resolvedCooldownUntil: 0,
            suppressedCount: inc.suppressedCount,
            escalationCount: inc.escalationCount,
            flappingCount: inc.flappingCount,
            affectedRooms: Array.isArray(inc.affectedRooms) ? (inc.affectedRooms as string[]) : [],
            telegramStatus: inc.telegramStatus as ChannelDeliveryStatus,
            emailStatus: inc.emailStatus as ChannelDeliveryStatus,
            metadata: (inc.metadata as Record<string, any>) || {},
          });
        }
      }
    } catch {
      // DB unavailable during startup
    }
  }

  /**
   * Startup notification with Restart Loop detection (>= 3 boots within 10 minutes) and 15-min rate limit.
   */
  public static async handleStartupNotification(
    startupType: 'HOST_REBOOT' | 'PROCESS_CRASH' | 'NORMAL_RESTART' | 'FIRST_BOOT',
    downtimeSec: number,
    loadedFromDb: boolean,
    now = Date.now()
  ): Promise<void> {
    if (!this.isEnabled()) return;

    const tenMinAgo = now - 10 * 60 * 1000;
    let bootTimestamps: number[] = [];

    try {
      await this.redisClient.lpush(REDIS_BOOT_HISTORY_KEY, String(now));
      await this.redisClient.ltrim(REDIS_BOOT_HISTORY_KEY, 0, 19);
      await this.redisClient.expire(REDIS_BOOT_HISTORY_KEY, 900);
      const rawList: string[] = await this.redisClient.lrange(REDIS_BOOT_HISTORY_KEY, 0, -1);
      bootTimestamps = rawList.map((t) => parseInt(t, 10)).filter((t) => t >= tenMinAgo);
    } catch {
      bootTimestamps = [now];
    }

    const isRestartLoop = bootTimestamps.length >= 3;
    const rateLimitMs = 15 * 60 * 1000;

    if (now - this.lastStartupAlertAt < rateLimitMs) {
      return;
    }

    let severity: IncidentSeverity = 'INFO';
    let title = 'ℹ️ ระบบ Hotel TV Server เริ่มทำงาน (Normal Service Restart)';

    if (isRestartLoop) {
      severity = 'CRITICAL';
      title = `🚨 CRITICAL: Restart Loop Detected (เซิร์ฟเวอร์รีสตาร์ทซ้ำ ${bootTimestamps.length} ครั้งใน 10 นาที)`;
      this.lastStartupAlertAt = now;
    } else if (startupType === 'HOST_REBOOT') {
      severity = 'WARNING';
      title = '⚠️ เครื่องเซิร์ฟเวอร์หลักเพิ่งรีบูตกลับมา (Linux Host Reboot / Power Recovery)';
    } else if (startupType === 'PROCESS_CRASH') {
      severity = 'CRITICAL';
      title = '🚨 โปรเซสเซิร์ฟเวอร์ฟื้นตัวจากอาการค้าง/ดับผิดปกติ (Unclean Crash Recovery)';
    }

    const summary = [
      `สาเหตุการเริ่มระบบ: ${isRestartLoop ? 'Restart Loop Detected' : startupType}`,
      `ระยะเวลาที่ระบบหยุดทำงาน (Downtime): ${downtimeSec} วินาที`,
      `Uptime ของเครื่อง Linux: ${Math.floor(os.uptime())} วินาที`,
      `แหล่งข้อมูล Config: ${loadedFromDb ? 'PostgreSQL SystemSetting' : 'Fallback (.env)'}`,
      `เวลาปัจจุบัน: ${formatBangkokTimestamp(now)}`,
    ].join('\n');

    const record: IncidentStateRecord = {
      incidentId: `boot-${now}-${Math.random().toString(36).slice(2, 8)}`,
      incidentKey: 'CORE:SERVER_BOOT',
      category: 'CORE',
      type: isRestartLoop ? 'RESTART_LOOP' : startupType,
      severity,
      status: 'RESOLVED',
      title,
      summary,
      openedAt: now - downtimeSec * 1000,
      lastAlertAt: now,
      lastErrorAt: now,
      lastResolvedAt: now,
      cooldownUntil: now + rateLimitMs,
      resolvedCooldownUntil: 0,
      suppressedCount: 0,
      escalationCount: 0,
      flappingCount: 0,
      affectedRooms: [],
      telegramStatus: 'PENDING',
      emailStatus: 'PENDING',
      metadata: { startupType, downtimeSec, bootCountIn10Min: bootTimestamps.length },
    };

    await this.dispatchAndPersist(record, false);
  }

  /**
   * Evaluates Maintenance Window and resets consecutiveFailures immediately upon entry.
   */
  public static checkAndHandleMaintenanceWindow(nowDate: Date = new Date()): boolean {
    const status = checkMaintenanceWindow(
      nowDate,
      this.config.maintenanceWindowStart,
      this.config.maintenanceWindowEnd,
      this.config.maintenanceBufferMinutes
    );

    if (status.active) {
      if (!this.wasInMaintenanceWindow || this.consecutiveFailuresMap.size > 0) {
        // Reset all IPTV / stream consecutive failures upon entering or during the window
        for (const key of this.consecutiveFailuresMap.keys()) {
          if (key.startsWith('IPTV:') || key.startsWith('STREAM:')) {
            this.consecutiveFailuresMap.set(key, 0);
            this.redisClient.set(`${REDIS_FAILURES_PREFIX}${key}`, '0', 'EX', FAILURES_TTL_SECONDS).catch(() => {});
          }
        }
      }
      this.wasInMaintenanceWindow = true;
      return true;
    }

    if (this.wasInMaintenanceWindow) {
      // Just exited window + buffer: ensure counters start from 0 cleanly
      for (const key of this.consecutiveFailuresMap.keys()) {
        if (key.startsWith('IPTV:') || key.startsWith('STREAM:')) {
          this.consecutiveFailuresMap.set(key, 0);
        }
      }
      this.wasInMaintenanceWindow = false;
    }

    return false;
  }

  /**
   * Processes IPTV stream probe results (every 15s).
   * Implements Maintenance Window reset, 3-minute Grace Period (12 probes),
   * Hysteresis (2 consecutive successes = 30s), Flapping Protection, and Separate Resolved Cooldown.
   */
  public static async processStreamProbeResults(
    channels: Array<{ id: string; name: string; channelNumber?: number | null; inputIp?: string | null }>,
    statusMap: Record<string, boolean>,
    nowDate: Date = new Date()
  ): Promise<void> {
    if (!this.isEnabled()) return;
    if (this.checkAndHandleMaintenanceWindow(nowDate)) {
      return;
    }

    const now = nowDate.getTime();
    const requiredFailures = Math.max(1, Math.ceil((this.config.iptvGracePeriodMinutes * 60) / 15)); // 12 probes = 3 mins
    const incidentKey = 'IPTV:STREAM_OUTAGE';
    const existing = this.stateMap.get(incidentKey);

    const deadChannels: string[] = [];
    let maxFailuresAcrossDead = 0;

    for (const ch of channels) {
      const fKey = `IPTV:${ch.id}`;
      const isAlive = Boolean(statusMap[ch.id]);

      if (!isAlive) {
        const nextFail = (this.consecutiveFailuresMap.get(fKey) || 0) + 1;
        this.consecutiveFailuresMap.set(fKey, nextFail);
        this.consecutiveSuccessesMap.set(fKey, 0);
        this.redisClient.set(`${REDIS_FAILURES_PREFIX}${fKey}`, String(nextFail), 'EX', FAILURES_TTL_SECONDS).catch(() => {});

        if (nextFail >= requiredFailures) {
          const label = ch.channelNumber ? `Ch.${ch.channelNumber} (${ch.name})` : ch.name;
          deadChannels.push(label);
          if (nextFail > maxFailuresAcrossDead) {
            maxFailuresAcrossDead = nextFail;
          }
        }
      } else {
        this.consecutiveFailuresMap.set(fKey, 0);
        const nextSucc = (this.consecutiveSuccessesMap.get(fKey) || 0) + 1;
        this.consecutiveSuccessesMap.set(fKey, nextSucc);
        this.redisClient.set(`${REDIS_FAILURES_PREFIX}${fKey}`, '0', 'EX', FAILURES_TTL_SECONDS).catch(() => {});
      }
    }

    if (deadChannels.length > 0) {
      this.consecutiveSuccessesMap.set(incidentKey, 0);
      const isMassOutage = channels.length > 0 && deadChannels.length >= Math.ceil(channels.length * 0.5);
      const severity: IncidentSeverity = isMassOutage ? 'CRITICAL' : 'WARNING';
      const title = isMassOutage
        ? `🚨 CRITICAL: สัญญาณทีวี IPTV ล่มวงกว้าง (${deadChannels.length}/${channels.length} ช่อง)`
        : `⚠️ WARNING: สัญญาณทีวี IPTV ขัดข้อง (${deadChannels.length} ช่อง)`;
      const summary = [
        `ช่องที่ขัดข้องต่อเนื่องเกิน ${this.config.iptvGracePeriodMinutes} นาที (${maxFailuresAcrossDead} รอบ):`,
        deadChannels.join(', '),
        `เวลาตรวจพบ: ${formatBangkokTimestamp(now)}`,
      ].join('\n');

      if (existing && (existing.status === 'OPEN' || existing.status === 'FLAPPING')) {
        existing.lastErrorAt = now;
        existing.summary = summary;
        existing.severity = severity;
        existing.metadata = { ...existing.metadata, deadChannels, isMassOutage };

        if (existing.status === 'FLAPPING') {
          await this.persistIncidentState(existing);
          return;
        }

        if (now < existing.cooldownUntil) {
          existing.suppressedCount += 1;
          await this.persistIncidentState(existing);
          return;
        }
      }

      // Check Flapping: was this incident resolved within flappingWindowMinutes?
      const flappingWindowMs = this.config.flappingWindowMinutes * 60 * 1000;
      if (
        existing &&
        existing.status === 'RESOLVED' &&
        existing.lastResolvedAt &&
        now - existing.lastResolvedAt <= flappingWindowMs
      ) {
        existing.flappingCount += 1;
        existing.lastErrorAt = now;
        existing.lastAlertAt = now;
        existing.cooldownUntil = now + this.config.alertCooldownMinutes * 60 * 1000;
        existing.metadata = { ...existing.metadata, deadChannels, isMassOutage };

        if (existing.flappingCount >= 2) {
          existing.status = 'FLAPPING';
          existing.title = `⚠️ FLAPPING DETECTED: สัญญาณทีวี IPTV แกว่งติดๆ ดับๆ (${deadChannels.length} ช่อง)`;
          existing.summary = `${summary}\n(ระบบระงับการส่งแจ้งเตือนสลับไปมาชั่วคราว จนกว่าสัญญาณจะนิ่งต่อเนื่องครบ ${this.config.flappingWindowMinutes} นาที)`;
          await this.dispatchAndPersist(existing, false);
          return;
        } else {
          // Reopen existing incident
          existing.status = 'OPEN';
          existing.title = `${title} [Reopened]`;
          existing.summary = summary;
          await this.dispatchAndPersist(existing, false);
          return;
        }
      }

      const nextRecord: IncidentStateRecord = {
        incidentId: existing && existing.status !== 'RESOLVED' ? existing.incidentId : `iptv-${now}`,
        incidentKey,
        category: 'IPTV',
        type: 'STREAM_OUTAGE',
        severity,
        status: 'OPEN',
        title,
        summary,
        openedAt: existing && existing.status !== 'RESOLVED' ? existing.openedAt : now,
        lastAlertAt: now,
        lastErrorAt: now,
        cooldownUntil: now + this.config.alertCooldownMinutes * 60 * 1000,
        resolvedCooldownUntil: existing?.resolvedCooldownUntil || 0,
        suppressedCount: 0,
        escalationCount: existing && existing.status !== 'RESOLVED' ? existing.escalationCount : 0,
        flappingCount: existing?.flappingCount || 0,
        affectedRooms: [],
        telegramStatus: 'PENDING',
        emailStatus: 'PENDING',
        metadata: { deadChannels, isMassOutage },
      };

      await this.dispatchAndPersist(nextRecord, false);
    } else if (existing && (existing.status === 'OPEN' || existing.status === 'FLAPPING')) {
      // All channels alive — check hysteresis before resolving
      const succCount = (this.consecutiveSuccessesMap.get(incidentKey) || 0) + 1;
      this.consecutiveSuccessesMap.set(incidentKey, succCount);

      const requiredSuccesses =
        existing.status === 'FLAPPING'
          ? Math.max(2, Math.ceil((this.config.flappingWindowMinutes * 60) / 15))
          : 2; // 2 consecutive probes = 30 seconds

      if (succCount >= requiredSuccesses && now >= existing.resolvedCooldownUntil) {
        const durationSec = Math.max(0, Math.floor((now - existing.openedAt) / 1000));
        existing.status = 'RESOLVED';
        existing.lastResolvedAt = now;
        existing.resolvedCooldownUntil = now + this.config.resolvedCooldownMinutes * 60 * 1000;
        existing.title = `✅ RESOLVED: สัญญาณทีวี IPTV กลับมาออนไลน์ปกติ`;
        existing.summary = [
          `ช่องสัญญาณทีวีทั้งหมดกลับมาทำงานปกติต่อเนื่อง (${succCount * 15} วินาที)`,
          `ระยะเวลาที่ขัดข้องรวม: ${durationSec} วินาที`,
          `เวลาที่หายดี: ${formatBangkokTimestamp(now)}`,
        ].join('\n');

        await this.dispatchAndPersist(existing, true);
      }
    }
  }

  /**
   * Checks whether a parent Core or Mass IPTV incident is currently OPEN,
   * to suppress child room alerts and prevent alert storms.
   */
  public static isSuppressedByParentIncident(childType: 'WEBVIEW_ERROR' | 'EXOPLAYER_ERROR'): boolean {
    if (childType === 'WEBVIEW_ERROR') {
      const dbInc = this.stateMap.get('CORE:DB');
      const redisInc = this.stateMap.get('CORE:REDIS');
      if (
        (dbInc && dbInc.status !== 'RESOLVED') ||
        (redisInc && redisInc.status !== 'RESOLVED')
      ) {
        return true;
      }
    }

    if (childType === 'EXOPLAYER_ERROR') {
      const iptvInc = this.stateMap.get('IPTV:STREAM_OUTAGE');
      if (iptvInc && iptvInc.status !== 'RESOLVED' && iptvInc.metadata?.isMassOutage) {
        return true;
      }
    }

    return false;
  }

  /**
   * Checks if a WebView error log matches the Main-Frame Allow-List.
   */
  public static isAllowedMainFrameWebViewError(data: {
    tag: string;
    message: string;
    details?: any;
  }): boolean {
    if (data.tag !== 'WebView') return false;
    if (data.details && typeof data.details === 'object' && data.details.isMainFrame === false) {
      return false;
    }

    const msg = String(data.message || '');
    const urlMatch = /\bfor\s+(https?:\/\/\S+)/i.exec(msg);
    const targetUrl = data.details?.url || (urlMatch ? urlMatch[1] : null);
    if (isSubResourceUrl(targetUrl)) {
      return false;
    }

    const upperMsg = msg.toUpperCase();
    return this.config.webviewErrorAllowList.some((pattern) =>
      upperMsg.includes(pattern.toUpperCase())
    );
  }

  /**
   * Records a normal heartbeat or INFO event from a TV Box for Inferred Auto-Resolve tracking.
   */
  public static recordDeviceHeartbeat(deviceId: string, roomNumber?: string, now = Date.now()): void {
    try {
      if (!this.isEnabled()) return;
      for (const state of this.roomErrorStateMap.values()) {
        if (state.deviceId === deviceId || (roomNumber && state.roomNumber === roomNumber)) {
          state.lastHeartbeatAt = now;
        }
      }
    } catch {
      // Non-blocking
    }
  }

  /**
   * Ingests a TV Box log event (non-blocking hook target from device-log.service.ts).
   */
  public static async ingestDeviceLog(
    data: {
      deviceId: string;
      level: string;
      tag: string;
      message: string;
      details?: any;
      roomNumber?: string;
      ipAddress?: string;
      dbFloor?: number | null;
    },
    nowDate: Date = new Date()
  ): Promise<void> {
    if (!this.isEnabled()) return;
    const now = nowDate.getTime();
    const level = String(data.level || '').toUpperCase();
    const roomNumber = data.roomNumber || 'Unassigned';

    if (level === 'INFO') {
      this.recordDeviceHeartbeat(data.deviceId, roomNumber, now);
      return;
    }

    if (level !== 'ERROR') return;

    let incidentType: 'APP_CRASH' | 'WEBVIEW_ERROR' | 'EXOPLAYER_ERROR' | null = null;

    if (data.tag === 'Crash') {
      incidentType = 'APP_CRASH';
    } else if (data.tag === 'WebView') {
      if (!this.isAllowedMainFrameWebViewError(data)) return;
      if (this.isSuppressedByParentIncident('WEBVIEW_ERROR')) return;
      incidentType = 'WEBVIEW_ERROR';
    } else if (data.tag === 'ExoPlayer') {
      if (this.checkAndHandleMaintenanceWindow(nowDate)) return;
      if (this.isSuppressedByParentIncident('EXOPLAYER_ERROR')) return;
      incidentType = 'EXOPLAYER_ERROR';
    }

    if (!incidentType) return;

    this.queueRoomIncident({
      category: 'TV_BOX',
      type: incidentType,
      roomNumber,
      deviceId: data.deviceId,
      ipAddress: data.ipAddress,
      dbFloor: data.dbFloor,
      message: data.message,
      now,
    });
  }

  /**
   * Queues a room-level incident into the 45-second batching window, respecting per-room cooldown.
   */
  public static queueRoomIncident(params: {
    category: 'TV_BOX' | 'ADB';
    type: string;
    roomNumber: string;
    deviceId: string;
    ipAddress?: string;
    dbFloor?: number | null;
    message: string;
    cooldownMsOverride?: number;
    now?: number;
  }): void {
    const now = params.now ?? Date.now();
    const roomKey = `${params.category}:${params.type}:${params.roomNumber}`;
    const existingRoom = this.roomErrorStateMap.get(roomKey);
    const cooldownMs =
      params.cooldownMsOverride ?? this.config.alertCooldownMinutes * 60 * 1000;

    if (existingRoom && now < existingRoom.cooldownUntil) {
      existingRoom.lastErrorAt = now;
      existingRoom.suppressedCount += 1;

      const parentState = this.stateMap.get(existingRoom.incidentKey);
      if (parentState) {
        parentState.suppressedCount += 1;
        parentState.lastErrorAt = now;
      }
      return;
    }

    const batchKey = `${params.category}:${params.type}`;
    this.roomErrorStateMap.set(roomKey, {
      incidentKey: batchKey,
      type: params.type,
      roomNumber: params.roomNumber,
      deviceId: params.deviceId,
      openedAt: existingRoom ? existingRoom.openedAt : now,
      lastErrorAt: now,
      lastHeartbeatAt: existingRoom ? existingRoom.lastHeartbeatAt : 0,
      cooldownUntil: now + cooldownMs,
      suppressedCount: 0,
    });

    let queue = this.batchQueues.get(batchKey);
    if (!queue) {
      queue = new Map<string, RoomBatchEntry>();
      this.batchQueues.set(batchKey, queue);
    }

    queue.set(params.roomNumber, {
      roomNumber: params.roomNumber,
      deviceId: params.deviceId,
      ipAddress: params.ipAddress,
      floor: resolveFloor(params.roomNumber, params.dbFloor),
      vlan: resolveVlanSubnet(params.ipAddress),
      message: params.message,
      occurredAt: now,
    });

    if (!this.batchTimers.has(batchKey)) {
      const delayMs = Math.max(1, this.config.roomBatchWindowSeconds * 1000);
      const timer = setTimeout(() => {
        this.batchTimers.delete(batchKey);
        this.flushRoomBatch(batchKey).catch(() => {});
      }, delayMs);
      this.batchTimers.set(batchKey, timer);
    }
  }

  /**
   * Flushes a batched room queue, applying Alert Storm floor/VLAN grouping if rooms >= stormThresholdRooms.
   */
  public static async flushRoomBatch(batchKey: string, now = Date.now()): Promise<void> {
    const queue = this.batchQueues.get(batchKey);
    if (!queue || queue.size === 0) return;

    const entries = Array.from(queue.values());
    this.batchQueues.delete(batchKey);

    const [category, type] = batchKey.split(':') as ['TV_BOX' | 'ADB', string];
    const roomNumbers = entries.map((e) => e.roomNumber);
    const isStorm = entries.length >= this.config.stormThresholdRooms;

    const floorBreakdown: Record<string, number> = {};
    const vlanBreakdown: Record<string, number> = {};
    for (const e of entries) {
      floorBreakdown[e.floor] = (floorBreakdown[e.floor] || 0) + 1;
      vlanBreakdown[e.vlan] = (vlanBreakdown[e.vlan] || 0) + 1;
    }

    let severity: IncidentSeverity = 'WARNING';
    if (isStorm || type === 'APP_CRASH') {
      severity = 'CRITICAL';
    }

    const title = isStorm
      ? `🚨 ALERT STORM (${type}): พบปัญหาพร้อมกัน ${entries.length} ห้อง`
      : `⚠️ แจ้งเตือน ${type}: พบปัญหาใน ${entries.length} ห้อง (${roomNumbers.join(', ')})`;

    let summaryLines: string[] = [];
    if (isStorm) {
      const floorStr = Object.entries(floorBreakdown)
        .map(([f, c]) => `${f}: ${c} ห้อง`)
        .join(', ');
      const vlanStr = Object.entries(vlanBreakdown)
        .map(([v, c]) => `${v}: ${c} ห้อง`)
        .join(', ');
      const sampleRooms = roomNumbers.slice(0, 10).join(', ');
      const remaining = entries.length - 10;

      summaryLines = [
        `จำนวนห้องที่ได้รับผลกระทบทั้งหมด: ${entries.length} ห้อง`,
        `แยกตามชั้น: ${floorStr}`,
        `แยกตามวงแลน (VLAN): ${vlanStr}`,
        `ตัวอย่างห้อง (10 ห้องแรก): ${sampleRooms}${remaining > 0 ? ` ...และอีก ${remaining} ห้อง` : ''}`,
        `ตัวอย่างสาเหตุ: ${entries[0]?.message || '-'}`,
        `เวลาเกิดเหตุ: ${formatBangkokTimestamp(entries[0]?.occurredAt || now)}`,
      ];
    } else {
      summaryLines = entries.map(
        (e) =>
          `• ห้อง ${e.roomNumber} (${e.floor}, IP: ${e.ipAddress || 'ไม่ทราบ IP'}): ${e.message}`
      );
      summaryLines.push(`เวลาเกิดเหตุ: ${formatBangkokTimestamp(entries[0]?.occurredAt || now)}`);
    }

    const existing = this.stateMap.get(batchKey);
    const record: IncidentStateRecord = {
      incidentId: existing && existing.status === 'OPEN' ? existing.incidentId : `batch-${now}-${Math.random().toString(36).slice(2, 7)}`,
      incidentKey: batchKey,
      category,
      type,
      severity,
      status: 'OPEN',
      title,
      summary: summaryLines.join('\n'),
      openedAt: existing && existing.status === 'OPEN' ? existing.openedAt : entries[0]?.occurredAt || now,
      lastAlertAt: now,
      lastErrorAt: now,
      cooldownUntil: now + this.config.alertCooldownMinutes * 60 * 1000,
      resolvedCooldownUntil: 0,
      suppressedCount: existing ? existing.suppressedCount : 0,
      escalationCount: existing && existing.status === 'OPEN' ? existing.escalationCount : 0,
      flappingCount: 0,
      affectedRooms: roomNumbers,
      telegramStatus: 'PENDING',
      emailStatus: 'PENDING',
      metadata: {
        floorBreakdown,
        vlanBreakdown,
        isStorm,
      },
    };

    await this.dispatchAndPersist(record, false);
  }

  /**
   * Reports ADB_UNAUTHORIZED for a box IP and batches notifications.
   */
  public static reportAdbUnauthorized(
    ip: string,
    roomNumber = 'Unassigned',
    deviceId = 'UnknownBox',
    now = Date.now()
  ): void {
    try {
      if (!this.isEnabled()) return;
      this.queueRoomIncident({
        category: 'ADB',
        type: 'ADB_UNAUTHORIZED',
        roomNumber,
        deviceId,
        ipAddress: ip,
        message: `กล่องทีวี IP ${ip} ติดสถานะ ADB Unauthorized (รอทีม IT กด Allow เมื่อห้องว่าง)`,
        cooldownMsOverride: 6 * 60 * 60 * 1000, // 6 hours matching ADB cooldown
        now,
      });
    } catch {
      // Non-blocking
    }
  }

  /**
   * Resolves ADB_UNAUTHORIZED for a box IP and clears its incident cooldown immediately.
   */
  public static async resolveAdbUnauthorized(
    ip: string,
    roomNumber = 'Unassigned',
    now = Date.now()
  ): Promise<void> {
    try {
      // Clear room cooldown entry so any future unauthorized state alerts immediately
      for (const [k, v] of this.roomErrorStateMap.entries()) {
        if (v.type === 'ADB_UNAUTHORIZED' && (v.roomNumber === roomNumber || k.includes(roomNumber))) {
          this.roomErrorStateMap.delete(k);
        }
      }

      if (!this.isEnabled()) return;

      const batchKey = 'ADB:ADB_UNAUTHORIZED';
      const existing = this.stateMap.get(batchKey);
      const durationSec = existing ? Math.max(0, Math.floor((now - existing.openedAt) / 1000)) : 0;

      const resolvedRecord: IncidentStateRecord = {
        incidentId: existing?.incidentId || `adb-res-${now}`,
        incidentKey: batchKey,
        category: 'ADB',
        type: 'ADB_UNAUTHORIZED',
        severity: 'INFO',
        status: 'RESOLVED',
        title: `✅ RESOLVED: กล่องทีวีเชื่อมต่อ ADB สำเร็จ (IP: ${ip}, ห้อง: ${roomNumber})`,
        summary: [
          `กล่องทีวี IP ${ip} (ห้อง ${roomNumber}) กลับมาเชื่อมต่อ ADB ได้ตามปกติ และล้าง Cooldown 6 ชม. เรียบร้อยแล้ว`,
          `ระยะเวลาที่ติดสถานะ Unauthorized: ${durationSec} วินาที`,
          `เวลาที่หายดี: ${formatBangkokTimestamp(now)}`,
        ].join('\n'),
        openedAt: existing?.openedAt || now,
        lastAlertAt: now,
        lastErrorAt: existing?.lastErrorAt || now,
        lastResolvedAt: now,
        cooldownUntil: 0,
        resolvedCooldownUntil: 0,
        suppressedCount: 0,
        escalationCount: 0,
        flappingCount: 0,
        affectedRooms: [roomNumber],
        telegramStatus: 'PENDING',
        emailStatus: 'PENDING',
        metadata: { ip, roomNumber },
      };

      await this.dispatchAndPersist(resolvedRecord, true);
    } catch {
      // Non-blocking
    }
  }

  /**
   * One-way bridge from monitoring.ts (Redis OOM / DLQ).
   * Circular-guard: IncidentService NEVER calls monitoring.sendAlert().
   */
  public static async reportMonitoringAlert(options: {
    type: string;
    message: string;
    severity?: 'info' | 'warning' | 'critical';
    hotelId?: string;
    metadata?: Record<string, any>;
    now?: number;
  }): Promise<void> {
    try {
      if (!this.isEnabled()) return;
      const now = options.now ?? Date.now();
      const incidentKey = `CORE:MONITORING:${options.type}`;
      const existing = this.stateMap.get(incidentKey);

      if (existing && existing.status === 'OPEN' && now < existing.cooldownUntil) {
        existing.suppressedCount += 1;
        await this.persistIncidentState(existing);
        return;
      }

      const sevMap: Record<string, IncidentSeverity> = {
        info: 'INFO',
        warning: 'WARNING',
        critical: 'CRITICAL',
      };
      const severity = sevMap[options.severity || 'warning'] || 'WARNING';

      const record: IncidentStateRecord = {
        incidentId: existing && existing.status === 'OPEN' ? existing.incidentId : `mon-${now}`,
        incidentKey,
        category: 'CORE',
        type: options.type,
        severity,
        status: 'OPEN',
        title: `🚨 [${severity}] ระบบ Monitoring แจ้งเตือน: ${options.type}`,
        summary: `${options.message}\nเวลาเกิดเหตุ: ${formatBangkokTimestamp(now)}`,
        openedAt: existing && existing.status === 'OPEN' ? existing.openedAt : now,
        lastAlertAt: now,
        lastErrorAt: now,
        cooldownUntil: now + this.config.alertCooldownMinutes * 60 * 1000,
        resolvedCooldownUntil: 0,
        suppressedCount: 0,
        escalationCount: 0,
        flappingCount: 0,
        affectedRooms: [],
        telegramStatus: 'PENDING',
        emailStatus: 'PENDING',
        metadata: options.metadata,
      };

      await this.dispatchAndPersist(record, false);
    } catch {
      // Never throw or call back into monitoring.sendAlert
    }
  }

  /**
   * Records PMS webhook activity or failure (non-blocking hook target from webhook.routes.ts).
   */
  public static recordPmsActivity(success: boolean, errorMessage?: string, now = Date.now()): void {
    try {
      if (success) {
        this.lastPmsWebhookAt = now;
        this.consecutivePmsFailures = 0;
        const existing = this.stateMap.get('CORE:PMS');
        if (existing && existing.status === 'OPEN') {
          this.resolveCoreIncident('CORE:PMS', 'ระบบ PMS Webhook กลับมาทำงานปกติ', now).catch(() => {});
        }
      } else {
        this.consecutivePmsFailures += 1;
        if (this.consecutivePmsFailures >= 2) {
          this.triggerCoreIncident(
            'CORE:PMS',
            'PMS_WEBHOOK_ERROR',
            'CRITICAL',
            '🚨 CRITICAL: ระบบ PMS Webhook เกิดข้อผิดพลาดติดต่อกันครบ 2 ครั้ง',
            `สาเหตุล่าสุด: ${errorMessage || 'HTTP 500 Internal Error'}\nเวลาตรวจพบ: ${formatBangkokTimestamp(now)}`,
            now
          ).catch(() => {});
        }
      }
    } catch {
      // Non-blocking
    }
  }

  /**
   * Periodic loop (every 60s): checks DB, Redis, PMS health (2 consecutive failures = ~2 mins),
   * Escalations (60 mins), and TV Box Inferred Auto-Resolves (10 mins no error + normal heartbeat).
   */
  public static async runPeriodicChecks(now = Date.now()): Promise<void> {
    if (!this.isEnabled()) return;

    // 1. PostgreSQL Health Check (2 consecutive failures = ~2 mins)
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      await this.handleCoreHealthResult('CORE:DB', 'POSTGRES_DOWN', true, 'PostgreSQL Database', now);
    } catch (err: any) {
      await this.handleCoreHealthResult('CORE:DB', 'POSTGRES_DOWN', false, 'PostgreSQL Database', now, err?.message);
    }

    // 2. Redis Health Check (2 consecutive failures = ~2 mins)
    try {
      await this.redisClient.ping();
      await this.handleCoreHealthResult('CORE:REDIS', 'REDIS_DOWN', true, 'Redis Server', now);
    } catch (err: any) {
      await this.handleCoreHealthResult('CORE:REDIS', 'REDIS_DOWN', false, 'Redis Server', now, err?.message);
    }

    // 3. PMS Active/Passive Check
    await this.checkPmsHealth(now);

    // 4. Escalations & TV Box Inferred Auto-Resolve
    await this.checkEscalationsAndAutoResolves(now);
  }

  private static async handleCoreHealthResult(
    incidentKey: string,
    type: string,
    isHealthy: boolean,
    serviceName: string,
    now: number,
    errorMsg?: string
  ): Promise<void> {
    if (!isHealthy) {
      const failCount = (this.consecutiveFailuresMap.get(incidentKey) || 0) + 1;
      this.consecutiveFailuresMap.set(incidentKey, failCount);
      this.consecutiveSuccessesMap.set(incidentKey, 0);

      // 2 consecutive 60s checks = ~2 minutes
      if (failCount >= 2) {
        await this.triggerCoreIncident(
          incidentKey,
          type,
          'CRITICAL',
          `🚨 CRITICAL: ${serviceName} ขัดข้อง (ติดต่อไม่ได้ ${failCount} ครั้งติด / ~${failCount} นาที)`,
          `รายละเอียด: ${errorMsg || 'Connection failed'}\nเวลาตรวจพบ: ${formatBangkokTimestamp(now)}`,
          now
        );
      }
    } else {
      this.consecutiveFailuresMap.set(incidentKey, 0);
      const succCount = (this.consecutiveSuccessesMap.get(incidentKey) || 0) + 1;
      this.consecutiveSuccessesMap.set(incidentKey, succCount);

      const existing = this.stateMap.get(incidentKey);
      if (existing && existing.status === 'OPEN' && succCount >= 2) {
        await this.resolveCoreIncident(incidentKey, `${serviceName} กลับมาเชื่อมต่อได้ปกติ (2 รอบติด / ~2 นาที)`, now);
      }
    }
  }

  private static async checkPmsHealth(now: number): Promise<void> {
    if (this.config.pmsHealthUrl) {
      try {
        await axios.get(this.config.pmsHealthUrl, { timeout: 5000 });
        await this.handleCoreHealthResult('CORE:PMS', 'PMS_DOWN', true, 'PMS Gateway', now);
      } catch (err: any) {
        await this.handleCoreHealthResult('CORE:PMS', 'PMS_DOWN', false, 'PMS Gateway', now, err?.message);
      }
    } else {
      // Passive check during daytime business hours (08:00 - 22:00 ICT)
      const { hour } = getBangkokTimeParts(new Date(now));
      const silenceMs = this.config.pmsSilenceThresholdHours * 60 * 60 * 1000;
      if (hour >= 8 && hour <= 22 && now - this.lastPmsWebhookAt >= silenceMs) {
        await this.triggerCoreIncident(
          'CORE:PMS_SILENCE',
          'PMS_SILENT',
          'WARNING',
          `⚠️ WARNING: ไม่มีข้อมูล Check-in/Check-out จาก PMS นานเกิน ${this.config.pmsSilenceThresholdHours} ชั่วโมง`,
          `เวลาที่ได้รับข้อมูล PMS ล่าสุด: ${formatBangkokTimestamp(this.lastPmsWebhookAt)}`,
          now
        );
      }
    }
  }

  public static async triggerCoreIncident(
    incidentKey: string,
    type: string,
    severity: IncidentSeverity,
    title: string,
    summary: string,
    now = Date.now()
  ): Promise<void> {
    const existing = this.stateMap.get(incidentKey);
    if (existing && existing.status === 'OPEN' && now < existing.cooldownUntil) {
      existing.suppressedCount += 1;
      existing.lastErrorAt = now;
      await this.persistIncidentState(existing);
      return;
    }

    const record: IncidentStateRecord = {
      incidentId: existing && existing.status === 'OPEN' ? existing.incidentId : `core-${now}-${Math.random().toString(36).slice(2, 6)}`,
      incidentKey,
      category: 'CORE',
      type,
      severity,
      status: 'OPEN',
      title,
      summary,
      openedAt: existing && existing.status === 'OPEN' ? existing.openedAt : now,
      lastAlertAt: now,
      lastErrorAt: now,
      cooldownUntil: now + this.config.alertCooldownMinutes * 60 * 1000,
      resolvedCooldownUntil: existing?.resolvedCooldownUntil || 0,
      suppressedCount: 0,
      escalationCount: existing && existing.status === 'OPEN' ? existing.escalationCount : 0,
      flappingCount: 0,
      affectedRooms: [],
      telegramStatus: 'PENDING',
      emailStatus: 'PENDING',
    };

    await this.dispatchAndPersist(record, false);
  }

  public static async resolveCoreIncident(
    incidentKey: string,
    reason: string,
    now = Date.now()
  ): Promise<void> {
    const existing = this.stateMap.get(incidentKey);
    if (!existing || existing.status === 'RESOLVED') return;
    if (now < existing.resolvedCooldownUntil) return;

    const durationSec = Math.max(0, Math.floor((now - existing.openedAt) / 1000));
    existing.status = 'RESOLVED';
    existing.lastResolvedAt = now;
    existing.resolvedCooldownUntil = now + this.config.resolvedCooldownMinutes * 60 * 1000;
    existing.title = `✅ RESOLVED: ${reason}`;
    existing.summary = [
      reason,
      `ระยะเวลาที่ขัดข้องรวม: ${durationSec} วินาที`,
      `เวลาที่หายดี: ${formatBangkokTimestamp(now)}`,
    ].join('\n');

    await this.dispatchAndPersist(existing, true);
  }

  /**
   * Checks open incidents for Escalation/Reminder (after escalationMinutes)
   * and TV Box rooms for Inferred Auto-Resolve (10 mins without error + normal heartbeat).
   */
  public static async checkEscalationsAndAutoResolves(now = Date.now()): Promise<void> {
    const escalationMs = this.config.escalationMinutes * 60 * 1000;
    const autoResolveMs = this.config.tvBoxAutoResolveMinutes * 60 * 1000;

    // 1. Check TV Box room Inferred Auto-Resolve ("ไม่มี ERROR ซ้ำครบ 10 นาที และ heartbeat ปกติ")
    for (const [roomKey, roomState] of this.roomErrorStateMap.entries()) {
      if (roomState.type === 'ADB_UNAUTHORIZED') continue;
      const noRepeatErrorFor10Min = now - roomState.lastErrorAt >= autoResolveMs;
      const hasNormalHeartbeatAfterError = roomState.lastHeartbeatAt > roomState.lastErrorAt;

      if (noRepeatErrorFor10Min && hasNormalHeartbeatAfterError) {
        this.roomErrorStateMap.delete(roomKey);
        this.pendingResolvedRoomsDigest.set(roomKey, {
          roomNumber: roomState.roomNumber,
          type: roomState.type,
          resolvedAt: now,
        });
      }
    }

    // If all rooms under an open TV_BOX incident have auto-resolved, flush digest immediately
    if (this.pendingResolvedRoomsDigest.size > 0 && this.roomErrorStateMap.size === 0) {
      await this.flushResolvedRoomsDigest(now);
    }

    // 2. Check Escalation/Reminder for OPEN incidents exceeding escalationMinutes
    for (const state of this.stateMap.values()) {
      if (state.status !== 'OPEN') continue;
      if (state.escalationCount >= 3) continue;

      if (now - state.lastAlertAt >= escalationMs) {
        state.escalationCount += 1;
        state.severity = 'CRITICAL';
        state.lastAlertAt = now;
        state.cooldownUntil = now + this.config.alertCooldownMinutes * 60 * 1000;

        const suppressedNote = `จำนวนครั้งที่เกิดซ้ำระหว่างช่วง Cooldown: ${state.suppressedCount} ครั้ง`;
        const openDurationMin = Math.floor((now - state.openedAt) / 60000);
        state.title = `🔔 REMINDER / ESCALATION (#${state.escalationCount}): ปัญหาค้างนาน ${openDurationMin} นาที (${state.type})`;
        state.summary = `${state.summary}\n${suppressedNote}\nเวลาแจ้งเตือนซ้ำ: ${formatBangkokTimestamp(now)}`;
        state.suppressedCount = 0;

        await this.dispatchAndPersist(state, false);
      }
    }
  }

  /**
   * Flushes pending TV Box auto-resolved rooms as a single Inferred Resolve Digest notification.
   */
  public static async flushResolvedRoomsDigest(now = Date.now()): Promise<void> {
    if (this.pendingResolvedRoomsDigest.size === 0) return;

    const items = Array.from(this.pendingResolvedRoomsDigest.values());
    this.pendingResolvedRoomsDigest.clear();

    const roomsList = Array.from(new Set(items.map((i) => i.roomNumber)));
    const typesList = Array.from(new Set(items.map((i) => i.type)));

    // Mark corresponding TV_BOX incident states as RESOLVED if no active room errors remain
    for (const t of typesList) {
      const incKey = `TV_BOX:${t}`;
      const existing = this.stateMap.get(incKey);
      if (existing && existing.status === 'OPEN') {
        const stillOpenForType = Array.from(this.roomErrorStateMap.values()).some((r) => r.type === t);
        if (!stillOpenForType) {
          existing.status = 'RESOLVED';
          existing.lastResolvedAt = now;
          existing.metadata = {
            ...existing.metadata,
            resolutionType: 'inferred_resolve',
          };
          await this.persistIncidentState(existing);
        }
      }
    }

    const digestRecord: IncidentStateRecord = {
      incidentId: `digest-res-${now}`,
      incidentKey: 'TV_BOX:INFERRED_RESOLVED_DIGEST',
      category: 'TV_BOX',
      type: 'INFERRED_RESOLVED',
      severity: 'INFO',
      status: 'RESOLVED',
      title: `✅ RESOLVED Digest (Inferred Resolve): กล่องทีวีกลับมาทำงานปกติ ${roomsList.length} ห้อง`,
      summary: [
        `สถานะ: Inferred Resolve (อนุมานว่าหายดีเนื่องจากไม่มี ERROR ซ้ำครบ ${this.config.tvBoxAutoResolveMinutes} นาที และได้รับสัญญาณ Heartbeat ปกติ)`,
        `ห้องที่กลับมาปกติ (${roomsList.length} ห้อง): ${roomsList.join(', ')}`,
        `ประเภทปัญหาที่หายดี: ${typesList.join(', ')}`,
        `เวลาสรุปผล: ${formatBangkokTimestamp(now)}`,
      ].join('\n'),
      openedAt: now,
      lastAlertAt: now,
      lastErrorAt: now,
      lastResolvedAt: now,
      cooldownUntil: 0,
      resolvedCooldownUntil: 0,
      suppressedCount: 0,
      escalationCount: 0,
      flappingCount: 0,
      affectedRooms: roomsList,
      telegramStatus: 'PENDING',
      emailStatus: 'PENDING',
      metadata: { resolutionType: 'inferred_resolve', rooms: roomsList, types: typesList },
    };

    await this.dispatchAndPersist(digestRecord, true);
  }

  /**
   * Formats HTML and Plain Text bodies, checks Mute status, dispatches to Telegram & Email,
   * records per-channel status, and enqueues failed channels into Retry Queue.
   */
  public static async dispatchAndPersist(
    record: IncidentStateRecord,
    isResolvedNotification: boolean
  ): Promise<void> {
    const now = record.lastAlertAt || Date.now();

    if (this.isMuted(now)) {
      record.telegramStatus = 'MUTED';
      record.emailStatus = 'MUTED';
      await this.persistIncidentState(record);
      return;
    }

    const htmlBody = [
      `<b>${escapeTelegramHtml(record.title)}</b>`,
      `<b>หมวดหมู่:</b> <code>${escapeTelegramHtml(record.category)} / ${escapeTelegramHtml(record.type)}</code>`,
      `<b>ระดับความรุนแรง:</b> <code>${escapeTelegramHtml(record.severity)}</code>`,
      `<b>สถานะ:</b> <code>${escapeTelegramHtml(record.status)}</code>`,
      '',
      escapeTelegramHtml(record.summary),
    ].join('\n');

    const plainTextBody = stripHtmlTags(htmlBody);

    // 1. Telegram Dispatch
    const shouldSendTelegram =
      this.config.telegramEnabled &&
      Boolean(this.config.telegramBotToken && this.config.telegramChatId) &&
      (isResolvedNotification ||
        SEVERITY_RANK[record.severity] >= SEVERITY_RANK[this.config.telegramMinSeverity]);

    if (!shouldSendTelegram) {
      record.telegramStatus = 'SKIPPED';
    } else {
      const tgOk = await this.sendTelegramSerialized(htmlBody);
      record.telegramStatus = tgOk ? 'SENT' : 'FAILED';
    }

    // 2. Email Dispatch (only WARNING/CRITICAL or resolved of WARNING/CRITICAL)
    const shouldSendEmail =
      this.config.emailEnabled &&
      Boolean(this.config.smtpHost && this.config.alertEmailTo) &&
      SEVERITY_RANK[record.severity] >= SEVERITY_RANK[this.config.emailMinSeverity];

    if (!shouldSendEmail) {
      record.emailStatus = 'SKIPPED';
    } else {
      const emailOk = await this.sendEmailNotification(record.title, plainTextBody, htmlBody);
      record.emailStatus = emailOk ? 'SENT' : 'FAILED';
    }

    // 3. Enqueue failed channel(s) into Exponential Backoff Retry Queue
    const needRetryTelegram = record.telegramStatus === 'FAILED';
    const needRetryEmail = record.emailStatus === 'FAILED';

    if (needRetryTelegram || needRetryEmail) {
      await this.enqueueRetry({
        id: `retry-${record.incidentId}-${now}`,
        incidentId: record.incidentId,
        incidentKey: record.incidentKey,
        title: record.title,
        htmlBody,
        plainTextBody,
        severity: record.severity,
        occurredAt: record.openedAt || now,
        attempt: 1,
        nextRetryAt: now + 15 * 1000, // 15s initial backoff
        retryTelegram: needRetryTelegram,
        retryEmail: needRetryEmail,
      });
    }

    await this.persistIncidentState(record);
  }

  /**
   * Serialized FIFO Telegram sender queue with >4096 splitting, HTTP 400 plain-text fallback,
   * and HTTP 429 retry_after handling.
   */
  public static async sendTelegramSerialized(htmlText: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.telegramSendQueue.push(async () => {
        const ok = await this.executeTelegramSend(htmlText);
        resolve(ok);
      });
      this.drainTelegramQueue().catch(() => {});
    });
  }

  private static async drainTelegramQueue(): Promise<void> {
    if (this.isProcessingTelegramQueue) return;
    this.isProcessingTelegramQueue = true;

    try {
      while (this.telegramSendQueue.length > 0) {
        const task = this.telegramSendQueue.shift();
        if (task) {
          await task();
        }
      }
    } finally {
      this.isProcessingTelegramQueue = false;
    }
  }

  private static async executeTelegramSend(htmlText: string): Promise<boolean> {
    const token = this.config.telegramBotToken;
    const chatId = this.config.telegramChatId;
    if (!token || !chatId) return false;

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const chunks = splitTelegramMessage(htmlText, TELEGRAM_MAX_LENGTH);

    for (const chunk of chunks) {
      const sent = await this.sendSingleTelegramChunk(url, chatId, chunk);
      if (!sent) return false;
    }
    return true;
  }

  private static async sendSingleTelegramChunk(
    url: string,
    chatId: string,
    chunk: string
  ): Promise<boolean> {
    try {
      await axios.post(
        url,
        {
          chat_id: chatId,
          text: chunk,
          parse_mode: 'HTML',
        },
        { timeout: 8000 }
      );
      return true;
    } catch (err: any) {
      const status = err?.response?.status;

      // Requirement 15: HTTP 400 Bad Request -> fallback to plain text immediately
      if (status === 400) {
        try {
          await axios.post(
            url,
            {
              chat_id: chatId,
              text: stripHtmlTags(chunk),
            },
            { timeout: 8000 }
          );
          return true;
        } catch {
          return false;
        }
      }

      // Requirement 16: HTTP 429 Too Many Requests -> wait retry_after seconds and retry once
      if (status === 429) {
        const retryAfterSec = Number(err?.response?.data?.parameters?.retry_after) || 5;
        await new Promise((r) => setTimeout(r, (retryAfterSec + 1) * 1000));
        try {
          await axios.post(
            url,
            {
              chat_id: chatId,
              text: chunk,
              parse_mode: 'HTML',
            },
            { timeout: 8000 }
          );
          return true;
        } catch {
          return false;
        }
      }

      return false;
    }
  }

  /**
   * Sends Email via Nodemailer SMTP. Never logs SMTP password.
   */
  public static async sendEmailNotification(
    subject: string,
    textBody: string,
    htmlBody: string
  ): Promise<boolean> {
    try {
      if (!this.config.smtpHost || !this.config.alertEmailTo) return false;

      const transporter = nodemailer.createTransport({
        host: this.config.smtpHost,
        port: Number(this.config.smtpPort) || 587,
        secure: Boolean(this.config.smtpSecure),
        auth: this.config.smtpUser
          ? {
              user: this.config.smtpUser,
              pass: this.config.smtpPass,
            }
          : undefined,
      });

      await transporter.sendMail({
        from: this.config.alertEmailFrom || this.config.smtpUser || 'noreply@hotel-tv.local',
        to: this.config.alertEmailTo,
        subject: `[Hotel TV Incident] ${subject}`,
        text: textBody,
        html: `<pre style="font-family: sans-serif; white-space: pre-wrap;">${htmlBody}</pre>`,
      });

      return true;
    } catch {
      console.error('[IncidentService] Failed to send email notification via SMTP.');
      return false;
    }
  }

  /**
   * Adds a failed delivery item to the Retry Queue and syncs to Redis.
   */
  private static async enqueueRetry(item: RetryQueueItem): Promise<void> {
    this.retryQueue.push(item);
    await this.syncRetryQueueToRedis();
  }

  private static async syncRetryQueueToRedis(): Promise<void> {
    try {
      await this.redisClient.del(REDIS_RETRY_QUEUE_KEY);
      if (this.retryQueue.length > 0) {
        const serialized = this.retryQueue.map((i) => JSON.stringify(i));
        await this.redisClient.rpush(REDIS_RETRY_QUEUE_KEY, ...serialized);
        await this.redisClient.expire(REDIS_RETRY_QUEUE_KEY, 86400);
      }
    } catch {
      // Ignore Redis error
    }
  }

  /**
   * Processes due items in the Retry Queue with Exponential Backoff (max 5 attempts),
   * attaching original occurredAt timestamp and only retrying failed channels.
   */
  public static async processRetryQueue(now = Date.now()): Promise<void> {
    if (this.retryQueue.length === 0) return;

    const remaining: RetryQueueItem[] = [];
    let changed = false;

    for (const item of this.retryQueue) {
      if (now < item.nextRetryAt) {
        remaining.push(item);
        continue;
      }

      changed = true;
      const delayedHeaderHtml = `<i>[ส่งซ้ำเมื่อระบบเครือข่ายกลับมาทำงาน — เวลาเกิดเหตุจริง: ${escapeTelegramHtml(
        formatBangkokTimestamp(item.occurredAt)
      )}]</i>\n`;
      const delayedHeaderText = `[ส่งซ้ำเมื่อระบบเครือข่ายกลับมาทำงาน — เวลาเกิดเหตุจริง: ${formatBangkokTimestamp(
        item.occurredAt
      )}]\n`;

      let tgStillFailed = item.retryTelegram;
      let emailStillFailed = item.retryEmail;

      if (item.retryTelegram) {
        const tgOk = await this.sendTelegramSerialized(`${delayedHeaderHtml}${item.htmlBody}`);
        if (tgOk) tgStillFailed = false;
      }

      if (item.retryEmail) {
        const emailOk = await this.sendEmailNotification(
          `[Delayed Retry] ${item.title}`,
          `${delayedHeaderText}${item.plainTextBody}`,
          `${delayedHeaderHtml}${item.htmlBody}`
        );
        if (emailOk) emailStillFailed = false;
      }

      const existingState = this.stateMap.get(item.incidentKey);
      if (existingState) {
        if (!tgStillFailed && item.retryTelegram) existingState.telegramStatus = 'SENT';
        if (!emailStillFailed && item.retryEmail) existingState.emailStatus = 'SENT';
        await this.persistIncidentState(existingState);
      }

      if ((tgStillFailed || emailStillFailed) && item.attempt < MAX_RETRY_ATTEMPTS) {
        const nextAttempt = item.attempt + 1;
        const backoffSec = 15 * Math.pow(2, nextAttempt - 1);
        remaining.push({
          ...item,
          attempt: nextAttempt,
          nextRetryAt: now + backoffSec * 1000,
          retryTelegram: tgStillFailed,
          retryEmail: emailStillFailed,
        });
      }
    }

    if (changed) {
      this.retryQueue = remaining;
      await this.syncRetryQueueToRedis();
    }
  }

  /**
   * Sends a manual test notification via Telegram and/or Email from CMS Settings UI.
   */
  public static async sendTestNotification(channel: 'telegram' | 'email' | 'both' = 'both'): Promise<{
    telegramSent: boolean;
    emailSent: boolean;
  }> {
    const nowStr = formatBangkokTimestamp();
    const title = '🔔 ทดสอบระบบแจ้งเตือน Hotel TV Incident Notification';
    const html = [
      `<b>${escapeTelegramHtml(title)}</b>`,
      `เวลาทดสอบ: <code>${escapeTelegramHtml(nowStr)}</code>`,
      `สถานะ: การตั้งค่าระบบแจ้งเตือนทำงานได้สมบูรณ์ ✅`,
    ].join('\n');

    let telegramSent = false;
    let emailSent = false;

    if (channel === 'telegram' || channel === 'both') {
      telegramSent = await this.sendTelegramSerialized(html);
    }
    if (channel === 'email' || channel === 'both') {
      emailSent = await this.sendEmailNotification(title, stripHtmlTags(html), html);
    }

    return { telegramSent, emailSent };
  }

  /**
   * Fetches recent incidents from PostgreSQL Incident table (with in-memory fallback).
   */
  public static async getRecentIncidents(options?: {
    limit?: number;
    status?: string;
    severity?: string;
    category?: string;
  }): Promise<any[]> {
    const limit = Math.min(Math.max(1, Number(options?.limit) || 50), 200);
    try {
      const where: Record<string, any> = {};
      if (options?.status) where.status = options.status;
      if (options?.severity) where.severity = options.severity;
      if (options?.category) where.category = options.category;

      const list = await (this.prisma.incident as any).findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        take: limit,
      });
      return list;
    } catch {
      return Array.from(this.stateMap.values()).slice(0, limit);
    }
  }

  /**
   * Resets internal state for isolated unit testing.
   */
  public static resetForTesting(): void {
    for (const t of this.batchTimers.values()) clearTimeout(t);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
    if (this.retryTimer) clearInterval(this.retryTimer);
    if (this.digestTimer) clearInterval(this.digestTimer);

    this.stateMap.clear();
    this.consecutiveFailuresMap.clear();
    this.consecutiveSuccessesMap.clear();
    this.roomErrorStateMap.clear();
    this.pendingResolvedRoomsDigest.clear();
    this.batchQueues.clear();
    this.batchTimers.clear();
    this.telegramSendQueue = [];
    this.isProcessingTelegramQueue = false;
    this.retryQueue = [];
    this.wasInMaintenanceWindow = false;
    this.lastStartupAlertAt = 0;
    this.consecutivePmsFailures = 0;
    this.config = this.getDefaultConfig();
  }

  public static getStateForTesting(key: string): IncidentStateRecord | undefined {
    return this.stateMap.get(key);
  }

  public static getConsecutiveFailuresForTesting(key: string): number {
    return this.consecutiveFailuresMap.get(key) || 0;
  }

  public static getRetryQueueForTesting(): RetryQueueItem[] {
    return this.retryQueue;
  }
}
