import crypto from 'crypto';

export const SECRET_MASK = '********';
const ENCRYPTED_PREFIX = 'enc:v1:';

/**
 * Derives a 32-byte key for AES-256-GCM from INCIDENT_ENCRYPTION_KEY or fallback JWT_SECRET.
 */
function getEncryptionKey(): Buffer {
  const rawKey =
    process.env.INCIDENT_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    'hotel-tv-default-incident-encryption-key-fallback';

  // If 64-char hex (32 bytes), decode directly; otherwise SHA-256 hash to 32 bytes
  if (/^[0-9a-fA-F]{64}$/.test(rawKey.trim())) {
    return Buffer.from(rawKey.trim(), 'hex');
  }
  return crypto.createHash('sha256').update(rawKey, 'utf8').digest();
}

/**
 * Checks whether a value is already encrypted with our AES-256-GCM format.
 */
export function isEncryptedSecret(value?: string | null): boolean {
  return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * Encrypts a plaintext secret using AES-256-GCM.
 * Format: enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return '';
  if (isEncryptedSecret(plaintext)) return plaintext;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${ENCRYPTED_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts an AES-256-GCM encrypted secret.
 * Never logs the secret or ciphertext on error.
 */
export function decryptSecret(payload?: string | null): string {
  if (!payload) return '';
  if (!isEncryptedSecret(payload)) {
    return payload;
  }

  try {
    const body = payload.slice(ENCRYPTED_PREFIX.length);
    const parts = body.split(':');
    if (parts.length !== 3) {
      return '';
    }

    const [ivHex, authTagHex, cipherHex] = parts;
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encryptedText = Buffer.from(cipherHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    console.error('[CryptoUtil] Failed to decrypt secret payload (invalid key or corrupted ciphertext).');
    return '';
  }
}

/**
 * Returns a masked representation and boolean flag indicating whether the secret is set.
 * Never returns the actual secret value.
 */
export function maskSecret(decryptedOrEncryptedValue?: string | null): {
  masked: string;
  isSet: boolean;
} {
  if (!decryptedOrEncryptedValue || decryptedOrEncryptedValue.trim() === '') {
    return { masked: '', isSet: false };
  }
  const actual = isEncryptedSecret(decryptedOrEncryptedValue)
    ? decryptSecret(decryptedOrEncryptedValue)
    : decryptedOrEncryptedValue;

  if (!actual || actual.trim() === '') {
    return { masked: '', isSet: false };
  }
  return { masked: SECRET_MASK, isSet: true };
}

/**
 * Determines whether an incoming PUT value means "keep existing secret unchanged".
 * True if undefined, null, empty string, or equals SECRET_MASK ("********").
 */
export function shouldKeepExistingSecret(incomingValue: unknown): boolean {
  if (incomingValue === undefined || incomingValue === null) return true;
  if (typeof incomingValue !== 'string') return true;
  const trimmed = incomingValue.trim();
  return trimmed === '' || trimmed === SECRET_MASK;
}

const SENSITIVE_KEY_PATTERN =
  /^(telegrambottoken|telegram_bot_token|smtppass|smtp_pass|password|pass|token|secret|adminkey|admin_key|x-admin-key|authorization)$/i;

/**
 * Deeply clones an object and replaces sensitive fields with "[REDACTED]"
 * so secrets are never written to console or PM2 logs.
 */
export function redactSensitiveFields(input: any): any {
  if (input === null || input === undefined) return input;
  if (typeof input !== 'object') return input;
  if (Array.isArray(input)) {
    return input.map((item) => redactSensitiveFields(item));
  }

  const redacted: Record<string, any> = {};
  for (const [key, val] of Object.entries(input)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      redacted[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      redacted[key] = redactSensitiveFields(val);
    } else {
      redacted[key] = val;
    }
  }
  return redacted;
}

