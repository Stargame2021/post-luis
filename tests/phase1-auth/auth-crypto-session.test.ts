import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_SEED_PASSWORD,
  hashPassword,
  isDefaultPassword,
  needsRehash,
  verifyPassword,
} from '@/lib/auth';
import {
  ALL_PERMISSIONS,
  hasAnyPermission,
  hasTabPermission,
  isAdminUser,
  parsePermisos,
} from '@/lib/permissions';
import {
  SESSION_COOKIE_NAME,
  attachSessionCookie,
  clearSessionCookie,
  createSessionToken,
  extractSessionTokenFromHeader,
  verifySessionToken,
} from '@/lib/session';
import { proxy } from '@/proxy';
import type { Usuario } from '@/types';

let previousAuthSecret: string | undefined;
let previousSecureCookie: string | undefined;

beforeAll(() => {
  previousAuthSecret = process.env.AUTH_SECRET;
  previousSecureCookie = process.env.SESSION_COOKIE_SECURE;
  process.env.AUTH_SECRET = 'test-auth-secret-phase1-unit-suite';
  delete process.env.SESSION_COOKIE_SECURE;
});

afterAll(() => {
  if (previousAuthSecret === undefined) {
    delete process.env.AUTH_SECRET;
  } else {
    process.env.AUTH_SECRET = previousAuthSecret;
  }

  if (previousSecureCookie === undefined) {
    delete process.env.SESSION_COOKIE_SECURE;
  } else {
    process.env.SESSION_COOKIE_SECURE = previousSecureCookie;
  }
});

describe('Auth crypto helpers (src/lib/auth.ts)', () => {
  it('genera hashes scrypt$16384$8$1$ con salt único por llamada', () => {
    const hashA = hashPassword('ClaveSegura2026!');
    const hashB = hashPassword('ClaveSegura2026!');

    expect(hashA).toMatch(/^scrypt\$16384\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
    expect(hashB).toMatch(/^scrypt\$16384\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
    expect(hashA).not.toBe(hashB);
  });

  it('verifica contraseñas correctas e incorrectas contra hash scrypt', () => {
    const storedHash = hashPassword('MiPasswordRobusta#99');

    expect(verifyPassword('MiPasswordRobusta#99', storedHash)).toBe(true);
    expect(verifyPassword('  MiPasswordRobusta#99  ', storedHash)).toBe(true);
    expect(verifyPassword('MiPasswordIncorrecta', storedHash)).toBe(false);
    expect(verifyPassword('', storedHash)).toBe(false);
  });

  it('mantiene compatibilidad con SHA-256 legacy de 64 chars e indica needsRehash', () => {
    const legacyHash = crypto.createHash('sha256').update('ClaveLegacy123').digest('hex');
    const scryptHash = hashPassword('ClaveLegacy123');

    expect(legacyHash).toHaveLength(64);
    expect(verifyPassword('ClaveLegacy123', legacyHash)).toBe(true);
    expect(verifyPassword('ClaveErronea', legacyHash)).toBe(false);
    expect(needsRehash(legacyHash)).toBe(true);
    expect(needsRehash(scryptHash)).toBe(false);
  });

  it('rechaza hashes corruptos o parámetros inválidos sin lanzar excepciones', () => {
    const malformedHashes = [
      '',
      'no-es-un-hash',
      'scrypt$16384$8$1$soloSalt',
      'scrypt$1$8$1$abcd$abcd',
      'scrypt$999999$8$1$abcd$abcd',
      'scrypt$16384$8$1$salt$zzzz',
      'scrypt$16384$8$1$salt$abc',
      'scrypt$abc$8$1$salt$abcd',
      'a'.repeat(63),
      'g'.repeat(64),
    ];

    for (const badHash of malformedHashes) {
      expect(verifyPassword('admin123', badHash)).toBe(false);
    }
    expect(needsRehash('')).toBe(true);
  });

  it('detecta si una contraseña corresponde al seed por defecto', () => {
    expect(DEFAULT_SEED_PASSWORD).toBe('admin123');
    expect(isDefaultPassword('admin123')).toBe(true);
    expect(isDefaultPassword('  admin123  ')).toBe(true);
    expect(isDefaultPassword('Admin123')).toBe(false);
    expect(isDefaultPassword('ClaveNueva2026!')).toBe(false);
  });
});

describe('Session tokens y cookies HttpOnly (src/lib/session.ts)', () => {
  it('crea y verifica un token HMAC-SHA256 válido', () => {
    const token = createSessionToken(42, 3600);
    const parts = token.split('.');

    expect(parts).toHaveLength(2);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);

    const payload = verifySessionToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.uid).toBe(42);
    expect(payload!.exp).toBeGreaterThan(payload!.iat);
  });

  it('rechaza tokens con firma manipulada o payload alterado', () => {
    const token = createSessionToken(7, 3600);
    const [encodedPayload, signature] = token.split('.');

    const tamperedSig =
      signature.slice(0, -1) + (signature.endsWith('a') ? 'b' : 'a');
    expect(verifySessionToken(`${encodedPayload}.${tamperedSig}`)).toBeNull();

    const forgedPayload = Buffer.from(
      JSON.stringify({ uid: 1, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }),
      'utf8'
    ).toString('base64url');
    expect(verifySessionToken(`${forgedPayload}.${signature}`)).toBeNull();

    expect(verifySessionToken(null)).toBeNull();
    expect(verifySessionToken(undefined)).toBeNull();
    expect(verifySessionToken('sin-punto')).toBeNull();
    expect(verifySessionToken('a.b.c')).toBeNull();
  });

  it('rechaza tokens expirados (ttlSeconds: -5)', () => {
    const expiredToken = createSessionToken(1, -5);
    expect(verifySessionToken(expiredToken)).toBeNull();
  });

  it('lanza error al intentar crear token con userId inválido', () => {
    expect(() => createSessionToken(0)).toThrow();
    expect(() => createSessionToken(-1)).toThrow();
    expect(() => createSessionToken(1.5)).toThrow();
  });

  it('extrae correctamente pos_session desde el header Cookie', () => {
    expect(
      extractSessionTokenFromHeader(`a=1; ${SESSION_COOKIE_NAME}=payloadPart.sigPart; b=2`)
    ).toBe('payloadPart.sigPart');
    expect(
      extractSessionTokenFromHeader(`${SESSION_COOKIE_NAME}="quoted.token"`)
    ).toBe('quoted.token');
    expect(extractSessionTokenFromHeader('other=123')).toBeNull();
    expect(extractSessionTokenFromHeader(`${SESSION_COOKIE_NAME}=`)).toBeNull();
    expect(extractSessionTokenFromHeader(null)).toBeNull();
  });

  it('adjunta cookie HttpOnly SameSite=lax y la limpia con Max-Age=0', () => {
    const token = createSessionToken(1, 3600);
    const loginRes = NextResponse.json({ success: true });
    attachSessionCookie(loginRes, token);

    const attached = loginRes.cookies.get(SESSION_COOKIE_NAME);
    expect(attached?.value).toBe(token);
    expect(attached?.httpOnly).toBe(true);
    expect(attached?.sameSite).toBe('lax');
    expect(attached?.secure).toBe(false);
    expect(attached?.path).toBe('/');
    expect(attached?.maxAge).toBeGreaterThan(0);

    const setCookie = loginRes.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie.toLowerCase()).toContain('samesite=lax');

    const logoutRes = NextResponse.json({ success: true });
    clearSessionCookie(logoutRes);

    const cleared = logoutRes.cookies.get(SESSION_COOKIE_NAME);
    expect(cleared?.value).toBe('');
    expect(cleared?.maxAge).toBe(0);
    expect(cleared?.httpOnly).toBe(true);
    expect(cleared?.sameSite).toBe('lax');
    expect((logoutRes.headers.get('set-cookie') ?? '').toLowerCase()).toContain('max-age=0');
  });
});

describe('RBAC y permisos (src/lib/permissions.ts)', () => {
  const adminUser: Usuario = {
    id: 1,
    username: 'admin',
    nombre_completo: 'Administrador del Sistema',
    rol_id: 1,
    rol_nombre: 'ADMINISTRADOR',
    permisos: [...ALL_PERMISSIONS],
    activo: true,
  };

  const cajeroUser: Usuario = {
    id: 2,
    username: 'cajero',
    nombre_completo: 'Cajero Principal',
    rol_id: 3,
    rol_nombre: 'CAJERO',
    permisos: ['pos', 'price_list', 'orders', 'rates'],
    activo: true,
  };

  const supervisorSinRentabilidad: Usuario = {
    id: 3,
    username: 'supervisor',
    nombre_completo: 'Supervisor Ventas',
    rol_id: 2,
    rol_nombre: 'SUPERVISOR',
    permisos: ['pos', 'orders', 'reports'],
    activo: true,
  };

  it('define las 15 claves canónicas en ALL_PERMISSIONS incluyendo pagos y bancos', () => {
    expect(ALL_PERMISSIONS).toHaveLength(15);
    expect(ALL_PERMISSIONS).toContain('pagos');
    expect(ALL_PERMISSIONS).toContain('bancos');
    expect(ALL_PERMISSIONS).toContain('reports_profit');
    expect(ALL_PERMISSIONS).toContain('maintenance');
    expect(ALL_PERMISSIONS).toContain('users');
  });

  it('identifica administradores por rol_id === 1 o rol_nombre ADMINISTRADOR', () => {
    expect(isAdminUser(null)).toBe(false);
    expect(isAdminUser(undefined)).toBe(false);
    expect(isAdminUser({ rol_id: 1, rol_nombre: 'CUSTOM' })).toBe(true);
    expect(isAdminUser({ rol_id: 9, rol_nombre: 'administrador' })).toBe(true);
    expect(isAdminUser(cajeroUser)).toBe(false);
  });

  it('parsea permisos desde array o JSON string filtrando claves desconocidas', () => {
    expect(parsePermisos(['pos', 'pagos', 'clave_falsa', 'pos', 123])).toEqual(['pos', 'pagos']);
    expect(parsePermisos('["bancos", "reports_profit", "inventado"]')).toEqual([
      'bancos',
      'reports_profit',
    ]);
    expect(parsePermisos('{invalido')).toEqual([]);
    expect(parsePermisos(null)).toEqual([]);
    expect(parsePermisos('')).toEqual([]);
  });

  it('aplica fail-closed en hasAnyPermission y hasTabPermission para null/undefined', () => {
    expect(hasAnyPermission(null, ['pos'])).toBe(false);
    expect(hasAnyPermission(undefined, [])).toBe(false);
    expect(hasTabPermission(null, 'menu')).toBe(false);
    expect(hasTabPermission(undefined, 'pos')).toBe(false);
    expect(hasTabPermission(undefined, 'reports', 'rentabilidad')).toBe(false);
  });

  it('concede acceso total al rol ADMINISTRADOR y restringe correctamente a CAJERO', () => {
    expect(hasTabPermission(adminUser, 'maintenance')).toBe(true);
    expect(hasTabPermission(adminUser, 'db_config')).toBe(true);
    expect(hasTabPermission(adminUser, 'users')).toBe(true);
    expect(hasTabPermission(adminUser, 'reports', 'rentabilidad')).toBe(true);

    // CAJERO permitido
    expect(hasTabPermission(cajeroUser, 'pos')).toBe(true);
    expect(hasTabPermission(cajeroUser, 'orders')).toBe(true);
    expect(hasTabPermission(cajeroUser, 'rates')).toBe(true);
    expect(hasTabPermission(cajeroUser, 'price_list')).toBe(true);

    // CAJERO denegado
    expect(hasTabPermission(cajeroUser, 'maintenance')).toBe(false);
    expect(hasTabPermission(cajeroUser, 'db_config')).toBe(false);
    expect(hasTabPermission(cajeroUser, 'users')).toBe(false);
    expect(hasTabPermission(cajeroUser, 'bancos')).toBe(false);
    expect(hasTabPermission(cajeroUser, 'pagos')).toBe(false);
    expect(hasTabPermission(cajeroUser, 'reports')).toBe(false);
    expect(hasTabPermission(cajeroUser, 'reports', 'rentabilidad')).toBe(false);
    expect(hasAnyPermission(cajeroUser, ['reports_profit'])).toBe(false);
  });

  it('controla subTab rentabilidad en reports según reports_profit', () => {
    expect(hasTabPermission(supervisorSinRentabilidad, 'reports')).toBe(true);
    expect(hasTabPermission(supervisorSinRentabilidad, 'reports', 'ventas')).toBe(true);
    expect(hasTabPermission(supervisorSinRentabilidad, 'reports', 'rentabilidad')).toBe(false);

    const soloRentabilidad: Usuario = {
      ...supervisorSinRentabilidad,
      permisos: ['reports_profit'],
    };
    expect(hasTabPermission(soloRentabilidad, 'reports')).toBe(true);
    expect(hasTabPermission(soloRentabilidad, 'reports', 'rentabilidad')).toBe(true);
  });
});

describe('Next.js 16 proxy de sesión (src/proxy.ts)', () => {
  it('permite /api/auth/login y /api/auth/logout sin cookie pos_session', () => {
    const loginRes = proxy(new NextRequest('http://localhost:3000/api/auth/login', { method: 'POST' }));
    const logoutRes = proxy(new NextRequest('http://localhost:3000/api/auth/logout', { method: 'POST' }));

    expect(loginRes.status).toBe(200);
    expect(loginRes.body).toBeNull();
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body).toBeNull();
  });

  it('bloquea con 401 rutas protegidas sin cookie o con cookie malformada', async () => {
    const unauthenticatedPaths = ['/api/productos', '/api/mantenimiento', '/api/respaldo'];

    for (const routePath of unauthenticatedPaths) {
      const noCookieRes = proxy(new NextRequest(`http://localhost:3000${routePath}`));
      expect(noCookieRes.status).toBe(401);
      const noCookieJson = (await noCookieRes.json()) as { success: boolean };
      expect(noCookieJson.success).toBe(false);

      for (const badToken of ['sinpunto', 'solo.', '.firma', 'a.b.c']) {
        const badCookieRes = proxy(
          new NextRequest(`http://localhost:3000${routePath}`, {
            headers: { cookie: `${SESSION_COOKIE_NAME}=${badToken}` },
          })
        );
        expect(badCookieRes.status).toBe(401);
      }
    }
  });

  it('permite el paso cuando la cookie pos_session tiene formato a.b', () => {
    const res = proxy(
      new NextRequest('http://localhost:3000/api/productos', {
        headers: { cookie: `${SESSION_COOKIE_NAME}=headerPart.signaturePart` },
      })
    );

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });
});
