import crypto from 'crypto';

export const DEFAULT_SEED_PASSWORD = 'admin123';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_SALT_BYTES = 16;

/**
 * Genera un hash seguro usando scrypt con salt aleatorio de 16 bytes.
 * Formato: scrypt$N$r$p$saltHex$keyHex
 */
export function hashPassword(password: string): string {
  const normalized = String(password).trim();
  const saltHex = crypto.randomBytes(SCRYPT_SALT_BYTES).toString('hex');
  const derivedKey = crypto.scryptSync(normalized, saltHex, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${saltHex}$${derivedKey.toString('hex')}`;
}

/**
 * Verifica una contraseña en texto plano contra un hash scrypt o SHA-256 legacy en tiempo constante.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    if (typeof password !== 'string' || typeof storedHash !== 'string' || !storedHash) {
      return false;
    }

    const normalized = password.trim();

    if (storedHash.startsWith('scrypt$')) {
      const parts = storedHash.split('$');
      if (parts.length !== 6) {
        return false;
      }

      const [, nStr, rStr, pStr, saltHex, keyHex] = parts;
      if (!/^\d+$/.test(nStr) || !/^\d+$/.test(rStr) || !/^\d+$/.test(pStr)) {
        return false;
      }

      const N = Number(nStr);
      const r = Number(rStr);
      const p = Number(pStr);

      if (
        !Number.isInteger(N) ||
        N <= 1 ||
        N > 131072 ||
        !Number.isInteger(r) ||
        r < 1 ||
        r > 16 ||
        !Number.isInteger(p) ||
        p < 1 ||
        p > 8
      ) {
        return false;
      }

      if (!saltHex || !/^[a-f0-9]+$/i.test(keyHex) || keyHex.length % 2 !== 0) {
        return false;
      }

      const expectedKey = Buffer.from(keyHex, 'hex');
      if (expectedKey.length === 0 || expectedKey.length > 256) {
        return false;
      }

      const derivedKey = crypto.scryptSync(normalized, saltHex, expectedKey.length, {
        N,
        r,
        p,
        maxmem: Math.max(32 * 1024 * 1024, 256 * N * r),
      });

      if (derivedKey.length !== expectedKey.length) {
        return false;
      }

      return crypto.timingSafeEqual(derivedKey, expectedKey);
    }

    if (/^[a-f0-9]{64}$/i.test(storedHash)) {
      const candidateHash = crypto.createHash('sha256').update(normalized).digest();
      const expectedHash = Buffer.from(storedHash, 'hex');
      if (candidateHash.length !== expectedHash.length) {
        return false;
      }
      return crypto.timingSafeEqual(candidateHash, expectedHash);
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Indica si un hash almacenado debe migrarse al algoritmo scrypt actual.
 */
export function needsRehash(storedHash: string): boolean {
  return typeof storedHash !== 'string' || !storedHash.startsWith('scrypt$');
}

/**
 * Indica si la contraseña ingresada coincide con la contraseña semilla por defecto.
 */
export function isDefaultPassword(password: string): boolean {
  return typeof password === 'string' && password.trim() === DEFAULT_SEED_PASSWORD;
}
