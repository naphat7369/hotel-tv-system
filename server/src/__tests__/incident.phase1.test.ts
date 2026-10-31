import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import axios from 'axios';
import nodemailer from 'nodemailer';

import {
  encryptSecret,
  decryptSecret,
  maskSecret,
  shouldKeepExistingSecret,
  redactSensitiveFields,
  SECRET_MASK,
} from '../utils/crypto.util';
import {
  formatBangkokTimestamp,
  checkMaintenanceWindow,
} from '../utils/timezone.util';
import {
  requireAdminAuth,
  resetAdminAuthRateLimits,
} from '../middleware/admin-auth.middleware';
import {
  IncidentService,
  resolveFloor,
  splitTelegramMessage,
  escapeTelegramHtml,
} from '../services/incident.service';
import { redis } from '../lib/redis';

vi.mock('axios');
vi.mock('nodemailer');

describe('Phase 1: Smart Incident Notification System (Security, State & Logic)', () => {
  const mockedAxios = vi.mocked(axios, true);
  const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'test-email-id' });

  let mockRedisStore: Map<string, string>;
  let mockRedisLists: Map<string, string[]>;
  let mockRedisClient: any;
  let mockDbSettings: Map<string, any>;
  let mockDbIncidents: Map<string, any>;
  let mockPrismaClient: any;

  beforeEach(() => {
    vi.useFakeTimers();
    resetAdminAuthRateLimits();
    mockedAxios.post.mockReset();
    mockedAxios.get.mockReset();
    sendMailMock.mockReset();
    sendMailMock.mockResolvedValue({ messageId: 'test-email-id' });
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail: sendMailMock,
    } as any);

    mockRedisStore = new Map();
    mockRedisLists = new Map();
    mockRedisClient = {
      get: vi.fn(async (k: string) => mockRedisStore.get(k) ?? null),
      set: vi.fn(async (k: string, v: string) => {
        mockRedisStore.set(k, v);
        return 'OK';
      }),
      del: vi.fn(async (k: string) => {
        mockRedisStore.delete(k);
        mockRedisLists.delete(k);
        return 1;
      }),
      keys: vi.fn(async (pattern: string) => {
        const prefix = pattern.replace('*', '');
        return Array.from(mockRedisStore.keys()).filter((k) => k.startsWith(prefix));
      }),
      lpush: vi.fn(async (k: string, v: string) => {
        const list = mockRedisLists.get(k) || [];
        list.unshift(v);
        mockRedisLists.set(k, list);
        return list.length;
      }),
      rpush: vi.fn(async (k: string, ...vals: string[]) => {
        const list = mockRedisLists.get(k) || [];
        list.push(...vals);
        mockRedisLists.set(k, list);
        return list.length;
      }),
      ltrim: vi.fn(async (k: string, start: number, stop: number) => {
        const list = mockRedisLists.get(k) || [];
        mockRedisLists.set(k, list.slice(start, stop + 1));
        return 'OK';
      }),
      lrange: vi.fn(async (k: string) => mockRedisLists.get(k) || []),
      expire: vi.fn(async () => 1),
      ping: vi.fn(async () => 'PONG'),
    };

    mockDbSettings = new Map();
    mockDbIncidents = new Map();
    mockPrismaClient = {
      systemSetting: {
        findUnique: vi.fn(async ({ where }: any) => mockDbSettings.get(where.key) ?? null),
        upsert: vi.fn(async ({ where, update, create }: any) => {
          const existing = mockDbSettings.get(where.key);
          const next = existing ? { ...existing, ...update } : create;
          mockDbSettings.set(where.key, next);
          return next;
        }),
      },
      incident: {
        upsert: vi.fn(async ({ where, update, create }: any) => {
          const existing = mockDbIncidents.get(where.id);
          const next = existing ? { ...existing, ...update } : create;
          mockDbIncidents.set(where.id, next);
          return next;
        }),
        findMany: vi.fn(async () => Array.from(mockDbIncidents.values())),
      },
      $queryRaw: vi.fn(async () => [{ '?column?': 1 }]),
    };

    process.env.INCIDENT_SYSTEM_ENABLED = 'true';
    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token-123';
    process.env.TELEGRAM_CHAT_ID = '-100999888';

    IncidentService.resetForTesting();
    IncidentService.setDependenciesForTesting({
      prisma: mockPrismaClient,
      redis: mockRedisClient,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // 1. Secret Encryption, Masking & Logger Redaction
  it('encrypts secrets with AES-256-GCM, masks GET config, preserves secrets on empty/masked PUT, and redacts logs', async () => {
    const rawSecret = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
    const encrypted = encryptSecret(rawSecret);
    expect(encrypted).not.toContain(rawSecret);
    expect(encrypted.startsWith('enc:v1:')).toBe(true);
    expect(decryptSecret(encrypted)).toBe(rawSecret);

    // Update config and verify DB stores ciphertext while GET returns mask + isSet
    const publicCfg = await IncidentService.updateConfig({
      telegramBotToken: rawSecret,
      smtpPass: 'my-smtp-secret-pass',
    });

    expect(publicCfg.telegramBotToken).toBe(SECRET_MASK);
    expect(publicCfg.telegramBotTokenIsSet).toBe(true);
    expect(publicCfg.smtpPass).toBe(SECRET_MASK);
    expect(publicCfg.smtpPassIsSet).toBe(true);

    const savedInDb = mockDbSettings.get('incident.config');
    expect(savedInDb.value.telegramBotToken.startsWith('enc:v1:')).toBe(true);
    expect(savedInDb.value.telegramBotToken).not.toContain(rawSecret);

    // PUT with empty string or SECRET_MASK must NOT overwrite existing secret
    await IncidentService.updateConfig({
      telegramBotToken: '',
      smtpPass: SECRET_MASK,
    });
    await IncidentService.loadConfigFromDb();
    expect(IncidentService.getPublicConfig().telegramBotTokenIsSet).toBe(true);
    expect(IncidentService.getPublicConfig().smtpPassIsSet).toBe(true);

    // Logger redaction check
    const redacted = redactSensitiveFields({
      hotel_name: 'Grand Horizon',
      telegramBotToken: rawSecret,
      nested: { smtpPass: 'secret123', normalField: 'ok' },
    });
    expect(redacted.telegramBotToken).toBe('[REDACTED]');
    expect(redacted.nested.smtpPass).toBe('[REDACTED]');
    expect(redacted.nested.normalField).toBe('ok');
  });

  // 2. Admin Auth Middleware: Fail-closed 503, Ignore X-Forwarded-For, Rate-limit 10/min/IP -> 429
  it('enforces fail-closed 503 without ADMIN_API_KEY, ignores X-Forwarded-For, and rate-limits at 10 req/min/IP', () => {
    const createMockRes = () => {
      const res: any = {};
      res.statusCode = 200;
      res.body = null;
      res.status = vi.fn((code: number) => {
        res.statusCode = code;
        return res;
      });
      res.json = vi.fn((payload: any) => {
        res.body = payload;
        return res;
      });
      return res;
    };

    // Case A: ADMIN_API_KEY not configured -> 503 Service Unavailable (even from localhost/127.0.0.1)
    delete process.env.ADMIN_API_KEY;
    const reqNoKey: any = {
      headers: { 'x-forwarded-for': '127.0.0.1' },
      socket: { remoteAddress: '127.0.0.1' },
    };
    const resNoKey = createMockRes();
    const nextFn = vi.fn();
    requireAdminAuth(reqNoKey, resNoKey, nextFn);
    expect(resNoKey.statusCode).toBe(503);
    expect(nextFn).not.toHaveBeenCalled();

    // Case B: ADMIN_API_KEY configured -> valid key passes, invalid key 401
    resetAdminAuthRateLimits();
    process.env.ADMIN_API_KEY = 'super-admin-key-2026';

    const reqValid: any = {
      headers: { 'x-admin-key': 'super-admin-key-2026', 'x-forwarded-for': '1.2.3.4' },
      socket: { remoteAddress: '10.0.101.55' },
    };
    const resValid = createMockRes();
    requireAdminAuth(reqValid, resValid, nextFn);
    expect(nextFn).toHaveBeenCalledTimes(1);

    // Case C: Rate limit > 10 requests in 1 minute from same socket IP -> 429 Too Many Requests
    // Even if attacker spoofs different X-Forwarded-For on every request!
    for (let i = 2; i <= 10; i++) {
      const reqLoop: any = {
        headers: { 'x-admin-key': 'wrong-key', 'x-forwarded-for': `10.0.0.${i}` },
        socket: { remoteAddress: '10.0.101.55' },
      };
      const resLoop = createMockRes();
      requireAdminAuth(reqLoop, resLoop, vi.fn());
      expect(resLoop.statusCode).toBe(401);
    }

    const req11th: any = {
      headers: { 'x-admin-key': 'super-admin-key-2026', 'x-forwarded-for': '9.9.9.9' },
      socket: { remoteAddress: '10.0.101.55' },
    };
    const res11th = createMockRes();
    requireAdminAuth(req11th, res11th, vi.fn());
    expect(res11th.statusCode).toBe(429);
  });

  // 3. Maintenance Window exact boundaries (03:57:59, 03:58:00, 04:06:00, 04:06:01) & Grace crossing window
  it('correctly evaluates Maintenance Window boundaries in Asia/Bangkok and resets consecutiveFailures across window', async () => {
    // 2026-10-31 in Asia/Bangkok (+07:00):
    // 03:57:59 ICT = 2026-10-30T20:57:59Z
    // 03:58:00 ICT = 2026-10-30T20:58:00Z
    // 04:06:00 ICT = 2026-10-30T21:06:00Z
    // 04:06:01 ICT = 2026-10-30T21:06:01Z
    const t035759 = new Date('2026-10-30T20:57:59.000Z');
    const t035800 = new Date('2026-10-30T20:58:00.000Z');
    const t040600 = new Date('2026-10-30T21:06:00.000Z');
    const t040601 = new Date('2026-10-30T21:06:01.000Z');
    const t040800 = new Date('2026-10-30T21:08:00.000Z');
    const t040801 = new Date('2026-10-30T21:08:01.000Z');

    expect(formatBangkokTimestamp(t035800)).toBe('2026-10-31 03:58:00 ICT (+07:00)');

    // Without buffer (0 min):
    expect(checkMaintenanceWindow(t035759, '03:58', '04:06', 0).inWindow).toBe(false);
    expect(checkMaintenanceWindow(t035800, '03:58', '04:06', 0).inWindow).toBe(true);
    expect(checkMaintenanceWindow(t040600, '03:58', '04:06', 0).inWindow).toBe(true);
    expect(checkMaintenanceWindow(t040601, '03:58', '04:06', 0).inWindow).toBe(false);

    // With 2-minute post-window buffer:
    expect(checkMaintenanceWindow(t040601, '03:58', '04:06', 2).inBuffer).toBe(true);
    expect(checkMaintenanceWindow(t040601, '03:58', '04:06', 2).active).toBe(true);
    expect(checkMaintenanceWindow(t040800, '03:58', '04:06', 2).active).toBe(true);
    expect(checkMaintenanceWindow(t040801, '03:58', '04:06', 2).active).toBe(false);

    // Test Grace Period crossing Maintenance Window:
    const channels = [{ id: 'ch1', name: 'BBC News', channelNumber: 1 }];
    const deadStatus = { ch1: false };
    mockedAxios.post.mockResolvedValue({ status: 200, data: { ok: true } });

    // 8 failures before 03:58:00 (not yet 12)
    for (let i = 0; i < 8; i++) {
      await IncidentService.processStreamProbeResults(channels, deadStatus, t035759);
    }
    expect(IncidentService.getConsecutiveFailuresForTesting('IPTV:ch1')).toBe(8);
    expect(mockedAxios.post).not.toHaveBeenCalled();

    // Enter Maintenance Window at 03:58:00 -> counter MUST reset to 0!
    await IncidentService.processStreamProbeResults(channels, deadStatus, t035800);
    expect(IncidentService.getConsecutiveFailuresForTesting('IPTV:ch1')).toBe(0);

    // Exit window + buffer at 04:08:01 -> must count 12 fresh probes from 1 before alerting
    for (let i = 1; i <= 11; i++) {
      await IncidentService.processStreamProbeResults(channels, deadStatus, t040801);
      expect(IncidentService.getConsecutiveFailuresForTesting('IPTV:ch1')).toBe(i);
    }
    expect(mockedAxios.post).not.toHaveBeenCalled();

    // 12th probe after window triggers alert
    await IncidentService.processStreamProbeResults(channels, deadStatus, t040801);
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  // 4. resolveFloor strict validation
  it('resolves floor strictly for 3-4 digit numeric rooms and returns "ไม่ทราบชั้น" for invalid formats', () => {
    expect(resolveFloor('516')).toBe('ชั้น 5');
    expect(resolveFloor('1103')).toBe('ชั้น 11');
    expect(resolveFloor('1610')).toBe('ชั้น 16');
    expect(resolveFloor('A101', 8)).toBe('ชั้น 8'); // Explicit dbFloor

    // Must NOT guess for non-matching formats:
    expect(resolveFloor('A101')).toBe('ไม่ทราบชั้น');
    expect(resolveFloor('VIP-1')).toBe('ไม่ทราบชั้น');
    expect(resolveFloor('12')).toBe('ไม่ทราบชั้น');
    expect(resolveFloor('12138')).toBe('ไม่ทราบชั้น');
    expect(resolveFloor('012')).toBe('ไม่ทราบชั้น');
    expect(resolveFloor('0102')).toBe('ไม่ทราบชั้น');
    expect(resolveFloor('Unassigned')).toBe('ไม่ทราบชั้น');
    expect(resolveFloor('')).toBe('ไม่ทราบชั้น');
    expect(resolveFloor(null)).toBe('ไม่ทราบชั้น');
  });

  // 5. IPTV Hysteresis (2 probes = 30s), Separate Resolved Cooldown & Flapping Protection
  it('handles IPTV OPEN -> RESOLVED hysteresis (30s) and detects Flapping on rapid re-failure', async () => {
    mockedAxios.post.mockResolvedValue({ status: 200, data: { ok: true } });
    const channels = [{ id: 'ch1', name: 'CNN', channelNumber: 2 }];
    const baseTime = new Date('2026-10-31T05:00:00.000Z'); // 12:00:00 ICT

    // 12 failed probes -> OPEN alert
    for (let i = 0; i < 12; i++) {
      await IncidentService.processStreamProbeResults(channels, { ch1: false }, baseTime);
    }
    expect(IncidentService.getStateForTesting('IPTV:STREAM_OUTAGE')?.status).toBe('OPEN');
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);

    // 1st alive probe (15s) -> still OPEN (needs 2 probes = 30s)
    const tPlus15s = new Date(baseTime.getTime() + 15000);
    await IncidentService.processStreamProbeResults(channels, { ch1: true }, tPlus15s);
    expect(IncidentService.getStateForTesting('IPTV:STREAM_OUTAGE')?.status).toBe('OPEN');

    // 2nd alive probe (30s) -> transitions to RESOLVED even though 15-min alert cooldown is active!
    const tPlus30s = new Date(baseTime.getTime() + 30000);
    await IncidentService.processStreamProbeResults(channels, { ch1: true }, tPlus30s);
    expect(IncidentService.getStateForTesting('IPTV:STREAM_OUTAGE')?.status).toBe('RESOLVED');
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);

    // Fail again within 10 minutes (Flapping cycle 1 -> Reopen, cycle 2 -> FLAPPING)
    const tPlus3Min = new Date(baseTime.getTime() + 3 * 60 * 1000);
    for (let i = 0; i < 12; i++) {
      await IncidentService.processStreamProbeResults(channels, { ch1: false }, tPlus3Min);
    }
    expect(IncidentService.getStateForTesting('IPTV:STREAM_OUTAGE')?.status).toBe('OPEN');
    expect(IncidentService.getStateForTesting('IPTV:STREAM_OUTAGE')?.flappingCount).toBe(1);

    // Recover after 3 minutes (past resolvedCooldownMinutes=2)
    const tPlus6Min = new Date(baseTime.getTime() + 6 * 60 * 1000);
    await IncidentService.processStreamProbeResults(channels, { ch1: true }, tPlus6Min);
    await IncidentService.processStreamProbeResults(channels, { ch1: true }, tPlus6Min);
    expect(IncidentService.getStateForTesting('IPTV:STREAM_OUTAGE')?.status).toBe('RESOLVED');

    // Fail again at +8m -> flappingCount reaches 2 -> status becomes FLAPPING
    const tPlus8Min = new Date(baseTime.getTime() + 8 * 60 * 1000);
    for (let i = 0; i < 12; i++) {
      await IncidentService.processStreamProbeResults(channels, { ch1: false }, tPlus8Min);
    }
    expect(IncidentService.getStateForTesting('IPTV:STREAM_OUTAGE')?.status).toBe('FLAPPING');
  });

  // 6. State Persistence across Restart & Graceful Shutdown batch flush
  it('flushes pending room batch on shutdown() and restores OPEN state across restart', async () => {
    mockedAxios.post.mockResolvedValue({ status: 200, data: { ok: true } });

    await IncidentService.ingestDeviceLog({
      deviceId: 'BOX-1',
      level: 'ERROR',
      tag: 'Crash',
      message: 'NullPointerException',
      roomNumber: '1103',
      ipAddress: '172.16.110.10',
    });

    // Before 45s timer fires, call shutdown() -> must flush immediately
    expect(mockedAxios.post).not.toHaveBeenCalled();
    await IncidentService.shutdown();
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);

    const openState = IncidentService.getStateForTesting('TV_BOX:APP_CRASH');
    expect(openState?.status).toBe('OPEN');

    // Simulate process restart: clear memory and call restorePersistedState()
    IncidentService.resetForTesting();
    IncidentService.setDependenciesForTesting({
      prisma: mockPrismaClient,
      redis: mockRedisClient,
    });
    expect(IncidentService.getStateForTesting('TV_BOX:APP_CRASH')).toBeUndefined();

    await IncidentService.restorePersistedState();
    const restored = IncidentService.getStateForTesting('TV_BOX:APP_CRASH');
    expect(restored).toBeDefined();
    expect(restored?.status).toBe('OPEN');
    expect(restored?.affectedRooms).toContain('1103');
  });

  // 7. Telegram HTTP 400 Plain-Text Fallback, >4096 Message Splitting & Retry Queue
  it('splits messages >4096 chars, falls back to plain text on HTTP 400, and queues failed sends for retry', async () => {
    const longText = Array.from({ length: 120 }, (_, i) => `บรรทัดที่ ${i + 1}: รายละเอียดข้อผิดพลาดยาวมาก`).join('\n');
    const fullText = longText.repeat(2);
    expect(fullText.length).toBeGreaterThan(4096);

    const chunks = splitTelegramMessage(fullText, 4096);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(4096);
    }
    expect(chunks[0]).toContain('[ส่วนที่ 1/');

    // HTTP 400 fallback to plain text
    mockedAxios.post
      .mockRejectedValueOnce({ response: { status: 400, data: { description: 'Bad Request: parse error' } } })
      .mockResolvedValueOnce({ status: 200, data: { ok: true } });

    const sent400 = await IncidentService.sendTelegramSerialized('<b>Test <unclosed tag</b>');
    expect(sent400).toBe(true);
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect((mockedAxios.post.mock.calls[1][1] as any).parse_mode).toBeUndefined();

    // Network failure -> Retry Queue -> Delayed delivery
    mockedAxios.post.mockReset();
    mockedAxios.post.mockRejectedValueOnce(new Error('Network unreachable'));

    const t0 = new Date('2026-10-31T06:00:00.000Z').getTime();
    await IncidentService.triggerCoreIncident(
      'CORE:REDIS',
      'REDIS_DOWN',
      'CRITICAL',
      'Redis Down',
      'Connection refused',
      t0
    );

    expect(IncidentService.getStateForTesting('CORE:REDIS')?.telegramStatus).toBe('FAILED');
    expect(IncidentService.getRetryQueueForTesting().length).toBe(1);

    // Network recovers after 20s
    mockedAxios.post.mockResolvedValueOnce({ status: 200, data: { ok: true } });
    await IncidentService.processRetryQueue(t0 + 20 * 1000);
    expect(IncidentService.getRetryQueueForTesting().length).toBe(0);
    expect(IncidentService.getStateForTesting('CORE:REDIS')?.telegramStatus).toBe('SENT');
    expect((mockedAxios.post.mock.calls[1][1] as any).text).toContain('เวลาเกิดเหตุจริง');
  });

  // 8. Room Batching (5 rooms in 45s = 1 message), Cooldown + Escalation, & TV Box Inferred Resolve
  it('batches 5 rooms in 45s into 1 message, escalates after 60m with suppressedCount, and auto-resolves as Inferred Resolve after 10m + heartbeat', async () => {
    mockedAxios.post.mockResolvedValue({ status: 200, data: { ok: true } });
    const tStart = new Date('2026-10-31T07:00:00.000Z');
    vi.setSystemTime(tStart);

    const rooms = ['1101', '1102', '1201', '1202', '1610'];
    for (const r of rooms) {
      await IncidentService.ingestDeviceLog(
        {
          deviceId: `BOX-${r}`,
          level: 'ERROR',
          tag: 'Crash',
          message: 'Fatal crash',
          roomNumber: r,
          ipAddress: `172.16.110.${r.slice(-2)}`,
        },
        tStart
      );
    }

    // Advance 45 seconds -> exactly 1 combined message sent for all 5 rooms
    await vi.advanceTimersByTimeAsync(45 * 1000);
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    const sentPayload = (mockedAxios.post.mock.calls[0][1] as any).text;
    for (const r of rooms) {
      expect(sentPayload).toContain(r);
    }

    // Duplicate error within 15-min cooldown -> suppressedCount incremented, no new message
    const tPlus2Min = new Date(tStart.getTime() + 2 * 60 * 1000);
    await IncidentService.ingestDeviceLog(
      {
        deviceId: 'BOX-1101',
        level: 'ERROR',
        tag: 'Crash',
        message: 'Fatal crash again',
        roomNumber: '1101',
      },
      tPlus2Min
    );
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(IncidentService.getStateForTesting('TV_BOX:APP_CRASH')?.suppressedCount).toBe(1);

    // Escalate at +61 minutes (while still OPEN without heartbeat resolve)
    const tPlus61Min = tStart.getTime() + 61 * 60 * 1000;
    await IncidentService.checkEscalationsAndAutoResolves(tPlus61Min);
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    const escalationText = (mockedAxios.post.mock.calls[1][1] as any).text;
    expect(escalationText).toContain('REMINDER / ESCALATION');
    expect(escalationText).toContain('1 ครั้ง');

    // Now send normal heartbeats for all 5 rooms after the last error, and advance +11 minutes -> Inferred Resolve Digest
    const tHeartbeat = tStart.getTime() + 62 * 60 * 1000;
    for (const r of rooms) {
      IncidentService.recordDeviceHeartbeat(`BOX-${r}`, r, tHeartbeat);
    }
    const tResolveCheck = tStart.getTime() + 75 * 60 * 1000;
    await IncidentService.checkEscalationsAndAutoResolves(tResolveCheck);
    expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    const digestText = (mockedAxios.post.mock.calls[2][1] as any).text;
    expect(digestText).toContain('Inferred Resolve');
  });

  // 9. Entry point dotenv.config() & Redis Port Verification
  it('has dotenv.config() only at the top of app.ts and resolves Redis port 6379 from .env', () => {
    const appTsPath = path.resolve(__dirname, '../app.ts');
    const adbTsPath = path.resolve(__dirname, '../services/adb.service.ts');
    const envPath = path.resolve(__dirname, '../../.env');

    const appSource = fs.readFileSync(appTsPath, 'utf8');
    const adbSource = fs.readFileSync(adbTsPath, 'utf8');

    // Verify app.ts starts with dotenv setup before other imports
    const firstLines = appSource.split('\n').slice(0, 5).join('\n');
    expect(firstLines).toContain('dotenv');
    expect(firstLines).toContain('dotenv.config()');

    // Verify adb.service.ts no longer calls dotenv.config()
    expect(adbSource).not.toContain('dotenv.config()');

    // Verify .env configures REDIS_URL with port 6379 and INCIDENT_SYSTEM_ENABLED=false by default
    const parsedEnv = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
    expect(parsedEnv.REDIS_URL).toContain(':6379');
    expect(parsedEnv.INCIDENT_SYSTEM_ENABLED).toBe('false');
    expect(redis.options.port).toBe(6379);
  });
});
