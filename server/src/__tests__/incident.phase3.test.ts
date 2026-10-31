import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import axios from 'axios';
import nodemailer from 'nodemailer';

import settingsRoutes from '../api/settings.routes';
import { IncidentService } from '../services/incident.service';
import { resetAdminAuthRateLimits } from '../middleware/admin-auth.middleware';
import { SECRET_MASK } from '../utils/crypto.util';

vi.mock('axios');
vi.mock('nodemailer');

describe('Phase 3: Incident API Routes (Supertest), Disabled-Mode Isolation & Test Delivery', () => {
  const mockedAxios = vi.mocked(axios, true);
  const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'test-mail-1' });

  let app: express.Express;
  let mockDbSettings: Map<string, any>;
  let mockDbIncidents: Map<string, any>;
  let mockPrisma: any;
  let mockRedis: any;

  beforeEach(() => {
    resetAdminAuthRateLimits();
    mockedAxios.post.mockReset();
    sendMailMock.mockReset();
    sendMailMock.mockResolvedValue({ messageId: 'test-mail-1' });
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail: sendMailMock,
    } as any);

    mockDbSettings = new Map();
    mockDbIncidents = new Map();
    mockPrisma = {
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

    mockRedis = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => 'OK'),
      del: vi.fn(async () => 1),
      keys: vi.fn(async () => []),
      lpush: vi.fn(async () => 1),
      rpush: vi.fn(async () => 1),
      ltrim: vi.fn(async () => 'OK'),
      lrange: vi.fn(async () => []),
      expire: vi.fn(async () => 1),
      ping: vi.fn(async () => 'PONG'),
    };

    process.env.INCIDENT_SYSTEM_ENABLED = 'false';
    process.env.ADMIN_API_KEY = 'phase3-test-admin-key';

    IncidentService.resetForTesting();
    IncidentService.setDependenciesForTesting({
      prisma: mockPrisma,
      redis: mockRedis,
    });

    app = express();
    app.use(express.json());
    app.use('/api/v1/settings', settingsRoutes);
  });

  afterEach(() => {
    IncidentService.resetForTesting();
  });

  it('does NOT write heartbeat, open timers, query Redis, or send alerts when INCIDENT_SYSTEM_ENABLED=false', async () => {
    process.env.INCIDENT_SYSTEM_ENABLED = 'false';
    IncidentService.resetForTesting();
    IncidentService.setDependenciesForTesting({
      prisma: mockPrisma,
      redis: mockRedis,
    });

    const writeHeartbeatSpy = vi.spyOn(IncidentService, 'writeHeartbeat');
    const startTimersSpy = vi.spyOn(IncidentService, 'startBackgroundTimers');

    await IncidentService.initialize();

    expect(IncidentService.isEnabled()).toBe(false);
    expect(writeHeartbeatSpy).not.toHaveBeenCalled();
    expect(startTimersSpy).not.toHaveBeenCalled();
    expect(mockRedis.keys).not.toHaveBeenCalled();
    expect(mockRedis.lpush).not.toHaveBeenCalled();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('returns 503 when ADMIN_API_KEY is missing, 401 on wrong key, and 429 after 10 attempts/min/IP', async () => {
    delete process.env.ADMIN_API_KEY;
    const res503 = await request(app).get('/api/v1/settings/incidents/config');
    expect(res503.status).toBe(503);

    resetAdminAuthRateLimits();
    process.env.ADMIN_API_KEY = 'phase3-test-admin-key';

    for (let i = 1; i <= 10; i++) {
      const res401 = await request(app)
        .get('/api/v1/settings/incidents/config')
        .set('x-admin-key', `wrong-guess-${i}`)
        .set('x-forwarded-for', `203.0.113.${i}`); // Spoofed header must be ignored
      expect(res401.status).toBe(401);
    }

    // 11th request within 1 minute from same IP must return 429 Too Many Requests
    const res429 = await request(app)
      .get('/api/v1/settings/incidents/config')
      .set('x-admin-key', 'phase3-test-admin-key');
    expect(res429.status).toBe(429);
  });

  it('masks secrets on GET and preserves existing secrets when PUT receives empty string or "********"', async () => {
    const secretToken = '999888777:AAH_real_secret_bot_token_value';
    const secretSmtp = 'real_smtp_password_value_2026';

    // 1. PUT initial secrets
    const put1 = await request(app)
      .put('/api/v1/settings/incidents/config')
      .set('x-admin-key', 'phase3-test-admin-key')
      .send({
        telegramBotToken: secretToken,
        telegramChatId: '-100123456',
        smtpHost: 'smtp.hotel.local',
        smtpUser: 'alerts@hotel.local',
        smtpPass: secretSmtp,
        alertEmailTo: 'it@hotel.local',
      });

    expect(put1.status).toBe(200);
    expect(put1.body.config.telegramBotToken).toBe(SECRET_MASK);
    expect(put1.body.config.telegramBotTokenIsSet).toBe(true);
    expect(put1.body.config.smtpPass).toBe(SECRET_MASK);
    expect(put1.body.config.smtpPassIsSet).toBe(true);
    expect(JSON.stringify(put1.body)).not.toContain(secretToken);
    expect(JSON.stringify(put1.body)).not.toContain(secretSmtp);

    // 2. GET config must never return raw secret
    const get1 = await request(app)
      .get('/api/v1/settings/incidents/config')
      .set('x-admin-key', 'phase3-test-admin-key');
    expect(get1.status).toBe(200);
    expect(get1.body.telegramBotToken).toBe(SECRET_MASK);
    expect(get1.body.telegramBotTokenIsSet).toBe(true);
    expect(get1.body.smtpPass).toBe(SECRET_MASK);
    expect(get1.body.smtpPassIsSet).toBe(true);
    expect(JSON.stringify(get1.body)).not.toContain(secretToken);

    // 3. PUT with empty string "" and "********" must NOT overwrite saved secrets
    const put2 = await request(app)
      .put('/api/v1/settings/incidents/config')
      .set('x-admin-key', 'phase3-test-admin-key')
      .send({
        telegramBotToken: '',
        smtpPass: SECRET_MASK,
        alertCooldownMinutes: 20,
      });
    expect(put2.status).toBe(200);
    expect(put2.body.config.alertCooldownMinutes).toBe(20);
    expect(put2.body.config.telegramBotTokenIsSet).toBe(true);
    expect(put2.body.config.smtpPassIsSet).toBe(true);
  });

  it('allows Test Telegram/Email via POST /incidents/test even when system is disabled (enabled=false) AND muted', async () => {
    mockedAxios.post.mockResolvedValue({ status: 200, data: { ok: true } });

    // Configure credentials while keeping enabled: false
    await request(app)
      .put('/api/v1/settings/incidents/config')
      .set('x-admin-key', 'phase3-test-admin-key')
      .send({
        enabled: false,
        telegramBotToken: 'test-token-abc',
        telegramChatId: '-100555666',
        smtpHost: 'smtp.hotel.local',
        smtpPass: 'smtp-pass-xyz',
        alertEmailTo: 'it@hotel.local',
      })
      .expect(200);

    // Mute for 4 hours (240 minutes)
    const muteRes = await request(app)
      .post('/api/v1/settings/incidents/mute')
      .set('x-admin-key', 'phase3-test-admin-key')
      .send({ durationMinutes: 240 })
      .expect(200);

    expect(muteRes.body.muteUntil).toBeTruthy();
    expect(IncidentService.isEnabled()).toBe(false);
    expect(IncidentService.isMuted()).toBe(true);

    // Trigger POST /api/v1/settings/incidents/test -> must still send both Telegram & Email!
    const testRes = await request(app)
      .post('/api/v1/settings/incidents/test')
      .set('x-admin-key', 'phase3-test-admin-key')
      .send({ channel: 'both' })
      .expect(200);

    expect(testRes.body.success).toBe(true);
    expect(testRes.body.telegramSent).toBe(true);
    expect(testRes.body.emailSent).toBe(true);
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
  });
});

