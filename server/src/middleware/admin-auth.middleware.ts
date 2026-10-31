import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10;     // 10 requests / minute / IP

interface RateLimitBucket {
  count: number;
  windowStart: number;
}

const ipRateLimitMap = new Map<string, RateLimitBucket>();

/**
 * Clears rate limit state (used in unit tests).
 */
export function resetAdminAuthRateLimits(): void {
  ipRateLimitMap.clear();
}

/**
 * Extracts client IP directly from the TCP socket.
 * Deliberately ignores X-Forwarded-For to prevent client header spoofing.
 */
function getDirectSocketIp(req: Request): string {
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Constant-time string comparison using crypto.timingSafeEqual.
 */
export function safeCompareKeys(provided: string, expected: string): boolean {
  const hashProvided = crypto.createHash('sha256').update(provided, 'utf8').digest();
  const hashExpected = crypto.createHash('sha256').update(expected, 'utf8').digest();
  const hashesMatch = crypto.timingSafeEqual(hashProvided, hashExpected);
  return hashesMatch && Buffer.byteLength(provided, 'utf8') === Buffer.byteLength(expected, 'utf8');
}

/**
 * Admin authentication middleware for /api/v1/settings/incidents/* endpoints.
 * - Rate-limits to 10 requests/minute/IP (429 Too Many Requests).
 * - Fail-closed (503 Service Unavailable) if ADMIN_API_KEY is not configured.
 * - No IP-allowlist fallback.
 * - Never trusts X-Forwarded-For.
 * - Uses crypto.timingSafeEqual for key verification.
 */
export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const clientIp = getDirectSocketIp(req);
  const now = Date.now();

  // 1. Rate-limit check (10 requests / minute / IP)
  const bucket = ipRateLimitMap.get(clientIp);
  if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    ipRateLimitMap.set(clientIp, { count: 1, windowStart: now });
  } else {
    bucket.count += 1;
    if (bucket.count > RATE_LIMIT_MAX_REQUESTS) {
      res.status(429).json({
        error: 'Too Many Requests: Rate limit of 10 requests per minute exceeded.',
      });
      return;
    }
  }

  // 2. Fail-closed check: require ADMIN_API_KEY to be configured
  const expectedKey = (process.env.ADMIN_API_KEY || '').trim();
  if (!expectedKey) {
    res.status(503).json({
      error: 'Service Unavailable: ADMIN_API_KEY is not configured on the server.',
    });
    return;
  }

  // 3. Extract provided key from X-Admin-Key or Authorization: Bearer
  const headerKey = req.headers['x-admin-key'];
  const authHeader = req.headers['authorization'];
  let providedKey = '';

  if (typeof headerKey === 'string' && headerKey.trim() !== '') {
    providedKey = headerKey.trim();
  } else if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    providedKey = authHeader.slice(7).trim();
  }

  if (!providedKey || !safeCompareKeys(providedKey, expectedKey)) {
    res.status(401).json({
      error: 'Unauthorized: Valid Admin API Key is required.',
    });
    return;
  }

  next();
}

