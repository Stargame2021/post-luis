import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { parseEnvFile } from './db';

export const SESSION_COOKIE_NAME = 'pos_session';

const DEFAULT_SESSION_TTL_SECONDS = 43200; // 12 horas
const SECRET_FILE_NAME = '.auth-secret';

export interface SessionPayload {
  uid: number;
  iat: number;
  exp: number;
}

let inMemoryFallbackSecret: string | null = null;

/**
 * Obtiene el TTL de sesión en segundos desde SESSION_TTL_SECONDS o usa 12 horas por defecto.
 */
export function getSessionTtlSeconds(): number {
  const env = parseEnvFile();
  const raw = (env.SESSION_TTL_SECONDS || process.env.SESSION_TTL_SECONDS || '').trim();
  if (raw) {
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_SESSION_TTL_SECONDS;
}

/**
 * Indica si las cookies deben marcarse con el atributo Secure (por defecto false para red local HTTP).
 */
export function isSecureCookieEnabled(): boolean {
  const env = parseEnvFile();
  return (env.SESSION_COOKIE_SECURE || process.env.SESSION_COOKIE_SECURE) === 'true';
}

/**
 * Resuelve el secreto HMAC para firmar tokens de sesión:
 * 1) process.env.AUTH_SECRET
 * 2) .env AUTH_SECRET
 * 3) Archivo local .auth-secret (creado automáticamente si no existe, con fallback en memoria).
 */
export function getAuthSecret(): string {
  const processSecret = process.env.AUTH_SECRET?.trim();
  if (processSecret) {
    return processSecret;
  }

  const fileEnv = parseEnvFile();
  const dotEnvSecret = fileEnv.AUTH_SECRET?.trim();
  if (dotEnvSecret) {
    return dotEnvSecret;
  }

  const secretPath = path.join(process.cwd(), SECRET_FILE_NAME);
  try {
    if (fs.existsSync(secretPath)) {
      const existing = fs.readFileSync(secretPath, 'utf-8').trim();
      if (existing) {
        return existing;
      }
    }
  } catch {
    // Continuar hacia generación o fallback en memoria
  }

  const generated = inMemoryFallbackSecret ?? crypto.randomBytes(32).toString('hex');

  try {
    fs.writeFileSync(secretPath, generated, { encoding: 'utf-8', mode: 0o600 });
    return generated;
  } catch {
    // Si el sistema de archivos es de solo lectura, conservar en memoria del proceso
    inMemoryFallbackSecret = generated;
    return generated;
  }
}

function signPayload(encodedPayload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

/**
 * Crea un token de sesión firmado con HMAC-SHA256 para el ID de usuario indicado.
 */
export function createSessionToken(userId: number, ttlSeconds?: number): string {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('userId inválido para crear token de sesión');
  }

  const iat = Math.floor(Date.now() / 1000);
  const effectiveTtl =
    typeof ttlSeconds === 'number' && Number.isFinite(ttlSeconds)
      ? Math.floor(ttlSeconds)
      : getSessionTtlSeconds();

  const payload: SessionPayload = {
    uid: userId,
    iat,
    exp: iat + effectiveTtl,
  };

  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = signPayload(encodedPayload, getAuthSecret());
  return `${encodedPayload}.${signature}`;
}

/**
 * Verifica firma HMAC-SHA256, estructura y expiración de un token de sesión.
 */
export function verifySessionToken(token: string | null | undefined): SessionPayload | null {
  try {
    if (!token || typeof token !== 'string') {
      return null;
    }

    const parts = token.split('.');
    if (parts.length !== 2) {
      return null;
    }

    const [encodedPayload, providedSignature] = parts;
    if (!encodedPayload || !providedSignature) {
      return null;
    }

    const expectedSignature = signPayload(encodedPayload, getAuthSecret());
    const providedBuf = Buffer.from(providedSignature, 'utf8');
    const expectedBuf = Buffer.from(expectedSignature, 'utf8');

    if (providedBuf.length !== expectedBuf.length) {
      return null;
    }

    if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) {
      return null;
    }

    const decodedRaw = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    const parsed = JSON.parse(decodedRaw) as Partial<SessionPayload>;

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    if (!Number.isInteger(parsed.uid) || (parsed.uid as number) <= 0) {
      return null;
    }

    if (
      typeof parsed.iat !== 'number' ||
      !Number.isFinite(parsed.iat) ||
      typeof parsed.exp !== 'number' ||
      !Number.isFinite(parsed.exp)
    ) {
      return null;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!(parsed.exp > nowSeconds)) {
      return null;
    }

    return {
      uid: parsed.uid as number,
      iat: parsed.iat,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

/**
 * Extrae el token de la cookie pos_session a partir de un header Cookie.
 */
export function extractSessionTokenFromHeader(
  cookieHeader: string | null | undefined
): string | null {
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return null;
  }

  const segments = cookieHeader.split(';');
  for (const segment of segments) {
    const eqIndex = segment.indexOf('=');
    if (eqIndex === -1) continue;

    const name = segment.slice(0, eqIndex).trim();
    if (name !== SESSION_COOKIE_NAME) continue;

    let value = segment.slice(eqIndex + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1);
    }

    if (!value) {
      return null;
    }

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
}

/**
 * Adjunta la cookie HttpOnly de sesión a una respuesta NextResponse.
 */
export function attachSessionCookie(res: NextResponse, token: string): NextResponse {
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureCookieEnabled(),
    path: '/',
    maxAge: getSessionTtlSeconds(),
  });
  return res;
}

/**
 * Elimina la cookie HttpOnly de sesión en una respuesta NextResponse.
 */
export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureCookieEnabled(),
    path: '/',
    maxAge: 0,
  });
  return res;
}
