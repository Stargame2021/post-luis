import crypto from 'crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModuloPermiso } from '@/types';

const {
  mockQuery,
  mockEnsureAuthTables,
  mockGetStoredDbConfig,
  mockSaveStoredDbConfig,
  mockParseEnvFile,
  mockResetPool,
  mockPoolQuery,
  mockPoolConnect,
  mockPoolEnd,
  mockGetPool,
  mockClientQuery,
  mockClientRelease,
  mockCookieGet,
  mockCookies,
} = vi.hoisted(() => {
  const mockClientQuery = vi.fn<
    (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
  >(async () => ({ rows: [] }));
  const mockClientRelease = vi.fn<() => void>();
  const mockPoolQuery = vi.fn<
    (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
  >(async () => ({ rows: [] }));
  const mockPoolEnd = vi.fn<() => Promise<void>>(async () => undefined);
  const mockPoolConnect = vi.fn(async () => ({
    query: mockClientQuery,
    release: mockClientRelease,
  }));
  const mockGetPool = vi.fn(() => ({
    query: mockPoolQuery,
    connect: mockPoolConnect,
    end: mockPoolEnd,
  }));
  const mockQuery = vi.fn<
    (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>
  >(async () => []);
  const mockEnsureAuthTables = vi.fn<() => Promise<void>>(async () => undefined);
  const mockGetStoredDbConfig = vi.fn(() => ({
    host: 'localhost',
    port: 5432,
    user: 'adempiere',
    password: 'db-secret-password',
    database: 'luis',
    ssl: false,
  }));
  const mockSaveStoredDbConfig = vi.fn();
  const mockParseEnvFile = vi.fn<() => Record<string, string>>(() => ({}));
  const mockResetPool = vi.fn();
  const mockCookieGet = vi.fn<(name: string) => { value: string } | undefined>(() => undefined);
  const mockCookies = vi.fn(async () => ({
    get: mockCookieGet,
  }));

  return {
    mockQuery,
    mockEnsureAuthTables,
    mockGetStoredDbConfig,
    mockSaveStoredDbConfig,
    mockParseEnvFile,
    mockResetPool,
    mockPoolQuery,
    mockPoolConnect,
    mockPoolEnd,
    mockGetPool,
    mockClientQuery,
    mockClientRelease,
    mockCookieGet,
    mockCookies,
  };
});

vi.mock('@/lib/db', () => ({
  query: mockQuery,
  getPool: mockGetPool,
  ensureAuthTables: mockEnsureAuthTables,
  getStoredDbConfig: mockGetStoredDbConfig,
  saveStoredDbConfig: mockSaveStoredDbConfig,
  resetPool: mockResetPool,
  parseEnvFile: mockParseEnvFile,
}));

vi.mock('next/headers', () => ({
  cookies: mockCookies,
}));

import { GET as meGET } from '@/app/api/auth/me/route';
import { POST as loginPOST } from '@/app/api/auth/login/route';
import { POST as logoutPOST } from '@/app/api/auth/logout/route';
import { POST as changePasswordPOST } from '@/app/api/auth/change-password/route';
import { GET as mantenimientoGET, POST as mantenimientoPOST } from '@/app/api/mantenimiento/route';
import { GET as respaldoGET } from '@/app/api/respaldo/route';
import { GET as configGET, POST as configPOST } from '@/app/api/config/route';
import {
  GET as usuariosGET,
  POST as usuariosPOST,
  PUT as usuariosPUT,
  DELETE as usuariosDELETE,
} from '@/app/api/usuarios/route';
import { GET as rolesGET, POST as rolesPOST, PUT as rolesPUT } from '@/app/api/roles/route';
import { GET as reportesGET } from '@/app/api/reportes/route';
import { GET as pedidosGET, POST as pedidosPOST, PATCH as pedidosPATCH } from '@/app/api/pedidos/route';
import { GET as comprasGET, POST as comprasPOST, PATCH as comprasPATCH } from '@/app/api/compras/route';
import { GET as pagosGET, POST as pagosPOST } from '@/app/api/pagos/route';
import { GET as dashboardGET } from '@/app/api/dashboard/route';
import { POST as bancosPOST } from '@/app/api/bancos/route';
import { POST as productosPOST } from '@/app/api/productos/route';
import { DEFAULT_SEED_PASSWORD, hashPassword, verifyPassword } from '@/lib/auth';
import { ALL_PERMISSIONS } from '@/lib/permissions';
import { SESSION_COOKIE_NAME, createSessionToken, verifySessionToken } from '@/lib/session';

interface MockLiveUser {
  id: number;
  username: string;
  nombre_completo: string;
  email: string | null;
  rol_id: number;
  rol_nombre: string;
  permisos: ModuloPermiso[];
  activo: boolean;
  rol_activo: boolean;
  ultimo_acceso: string | null;
  creado_en: string | null;
}

const ADMIN_USER: MockLiveUser = {
  id: 1,
  username: 'admin',
  nombre_completo: 'Administrador del Sistema',
  email: 'admin@tiendaexpress.com',
  rol_id: 1,
  rol_nombre: 'ADMINISTRADOR',
  permisos: [...ALL_PERMISSIONS],
  activo: true,
  rol_activo: true,
  ultimo_acceso: null,
  creado_en: null,
};

const SUPERVISOR_USER: MockLiveUser = {
  id: 66,
  username: 'supervisor',
  nombre_completo: 'Supervisor Ventas',
  email: 'supervisor@tiendaexpress.com',
  rol_id: 2,
  rol_nombre: 'SUPERVISOR',
  permisos: ['pos', 'orders', 'pagos', 'reports'],
  activo: true,
  rol_activo: true,
  ultimo_acceso: null,
  creado_en: null,
};

const CAJERO_USER: MockLiveUser = {
  id: 77,
  username: 'cajero',
  nombre_completo: 'Cajero Principal',
  email: 'cajero@tiendaexpress.com',
  rol_id: 3,
  rol_nombre: 'CAJERO',
  permisos: ['pos', 'price_list', 'orders', 'rates'],
  activo: true,
  rol_activo: true,
  ultimo_acceso: null,
  creado_en: null,
};

const ALMACEN_USER: MockLiveUser = {
  id: 88,
  username: 'almacen',
  nombre_completo: 'Encargado Almacén',
  email: 'almacen@tiendaexpress.com',
  rol_id: 4,
  rol_nombre: 'ALMACEN',
  permisos: ['products', 'import_excel', 'compras', 'terceros'],
  activo: true,
  rol_activo: true,
  ultimo_acceso: null,
  creado_en: null,
};

let previousAuthSecret: string | undefined;
let previousSecureCookie: string | undefined;

function buildRequest(
  url: string,
  options: { method?: string; userId?: number; cookieValue?: string; body?: unknown } = {}
): Request {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.cookieValue !== undefined) {
    headers.cookie = `${SESSION_COOKIE_NAME}=${options.cookieValue}`;
  } else if (options.userId !== undefined) {
    const token = createSessionToken(options.userId, 3600);
    headers.cookie = `${SESSION_COOKIE_NAME}=${token}`;
  }

  return new Request(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

function setupLiveUserQuery(
  user: MockLiveUser | null,
  extraHandler?: (sql: string, params?: unknown[]) => Record<string, unknown>[]
): void {
  mockQuery.mockImplementation(async (sql, params) => {
    if (sql.includes('FROM m_usuario u') && sql.includes('JOIN m_rol r')) {
      return user ? [user as unknown as Record<string, unknown>] : [];
    }
    if (extraHandler) {
      return extraHandler(sql, params);
    }
    return [];
  });
}

beforeAll(() => {
  previousAuthSecret = process.env.AUTH_SECRET;
  previousSecureCookie = process.env.SESSION_COOKIE_SECURE;
  process.env.AUTH_SECRET = 'vitest-api-security-rbac-secret';
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

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockResolvedValue([]);
  mockPoolQuery.mockResolvedValue({ rows: [] });
  mockClientQuery.mockResolvedValue({ rows: [] });
  mockCookieGet.mockReturnValue(undefined);
  mockParseEnvFile.mockReturnValue({});
  mockEnsureAuthTables.mockResolvedValue(undefined);
  mockGetPool.mockReturnValue({
    query: mockPoolQuery,
    connect: mockPoolConnect,
    end: mockPoolEnd,
  });
  mockPoolConnect.mockResolvedValue({
    query: mockClientQuery,
    release: mockClientRelease,
  });
  mockCookies.mockResolvedValue({
    get: mockCookieGet,
  });
});

describe('1. Protección 401 sin sesión en todos los endpoints críticos', () => {
  it('rechaza con 401 todas las rutas protegidas sin cookie pos_session', async () => {
    const cases: { name: string; run: () => Promise<Response> }[] = [
      { name: 'GET /api/mantenimiento', run: () => mantenimientoGET(buildRequest('http://localhost/api/mantenimiento')) },
      { name: 'POST /api/mantenimiento', run: () => mantenimientoPOST(buildRequest('http://localhost/api/mantenimiento', { method: 'POST', body: {} })) },
      { name: 'GET /api/respaldo', run: () => respaldoGET(buildRequest('http://localhost/api/respaldo')) },
      { name: 'GET /api/config', run: () => configGET(buildRequest('http://localhost/api/config')) },
      { name: 'POST /api/config', run: () => configPOST(buildRequest('http://localhost/api/config', { method: 'POST', body: {} })) },
      { name: 'GET /api/usuarios', run: () => usuariosGET(buildRequest('http://localhost/api/usuarios')) },
      { name: 'POST /api/usuarios', run: () => usuariosPOST(buildRequest('http://localhost/api/usuarios', { method: 'POST', body: {} })) },
      { name: 'PUT /api/usuarios', run: () => usuariosPUT(buildRequest('http://localhost/api/usuarios', { method: 'PUT', body: {} })) },
      { name: 'DELETE /api/usuarios', run: () => usuariosDELETE(buildRequest('http://localhost/api/usuarios?id=2', { method: 'DELETE' })) },
      { name: 'GET /api/roles', run: () => rolesGET(buildRequest('http://localhost/api/roles')) },
      { name: 'POST /api/roles', run: () => rolesPOST(buildRequest('http://localhost/api/roles', { method: 'POST', body: {} })) },
      { name: 'PUT /api/roles', run: () => rolesPUT(buildRequest('http://localhost/api/roles', { method: 'PUT', body: {} })) },
      { name: 'GET /api/reportes', run: () => reportesGET(buildRequest('http://localhost/api/reportes')) },
      { name: 'GET /api/pedidos', run: () => pedidosGET(buildRequest('http://localhost/api/pedidos')) },
      { name: 'POST /api/pedidos', run: () => pedidosPOST(buildRequest('http://localhost/api/pedidos', { method: 'POST', body: {} })) },
      { name: 'PATCH /api/pedidos', run: () => pedidosPATCH(buildRequest('http://localhost/api/pedidos', { method: 'PATCH', body: {} })) },
      { name: 'GET /api/compras', run: () => comprasGET(buildRequest('http://localhost/api/compras')) },
      { name: 'POST /api/compras', run: () => comprasPOST(buildRequest('http://localhost/api/compras', { method: 'POST', body: {} })) },
      { name: 'PATCH /api/compras', run: () => comprasPATCH(buildRequest('http://localhost/api/compras', { method: 'PATCH', body: {} })) },
      { name: 'GET /api/pagos', run: () => pagosGET(buildRequest('http://localhost/api/pagos')) },
      { name: 'POST /api/pagos', run: () => pagosPOST(buildRequest('http://localhost/api/pagos', { method: 'POST', body: {} })) },
      { name: 'GET /api/dashboard', run: () => dashboardGET(buildRequest('http://localhost/api/dashboard')) },
      { name: 'GET /api/auth/me', run: () => meGET(buildRequest('http://localhost/api/auth/me')) },
      {
        name: 'POST /api/auth/change-password',
        run: () =>
          changePasswordPOST(
            buildRequest('http://localhost/api/auth/change-password', {
              method: 'POST',
              body: { currentPassword: 'a', newPassword: 'NuevaClave123' },
            })
          ),
      },
    ];

    for (const testCase of cases) {
      const res = await testCase.run();
      expect(res.status, testCase.name).toBe(401);
      const json = (await res.json()) as { success: boolean };
      expect(json.success, testCase.name).toBe(false);
    }

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rechaza con 401 token manipulado o expirado y limpia cookie', async () => {
    const expired = createSessionToken(1, -5);
    const resExpired = await dashboardGET(
      buildRequest('http://localhost/api/dashboard', { cookieValue: expired })
    );
    expect(resExpired.status).toBe(401);
    expect((resExpired.headers.get('set-cookie') ?? '').toLowerCase()).toContain('max-age=0');

    const resTampered = await meGET(
      buildRequest('http://localhost/api/auth/me', { cookieValue: 'invalido.firma' })
    );
    expect(resTampered.status).toBe(401);
  });

  it('rechaza con 401 en requireAuth si usuario o rol fue desactivado en vivo', async () => {
    setupLiveUserQuery({ ...CAJERO_USER, activo: false });
    const res = await dashboardGET(
      buildRequest('http://localhost/api/dashboard', { userId: CAJERO_USER.id })
    );
    expect(res.status).toBe(401);
  });
});

describe('2. Control de acceso RBAC (403) y visibilidad de rentabilidad', () => {
  it('bloquea con 403 a CAJERO en rutas restringidas', async () => {
    setupLiveUserQuery(CAJERO_USER);

    const forbiddenForCajero: { name: string; run: () => Promise<Response> }[] = [
      {
        name: 'GET /api/mantenimiento',
        run: () => mantenimientoGET(buildRequest('http://localhost/api/mantenimiento', { userId: CAJERO_USER.id })),
      },
      {
        name: 'GET /api/respaldo',
        run: () => respaldoGET(buildRequest('http://localhost/api/respaldo', { userId: CAJERO_USER.id })),
      },
      {
        name: 'GET /api/config',
        run: () => configGET(buildRequest('http://localhost/api/config', { userId: CAJERO_USER.id })),
      },
      {
        name: 'GET /api/usuarios',
        run: () => usuariosGET(buildRequest('http://localhost/api/usuarios', { userId: CAJERO_USER.id })),
      },
      {
        name: 'GET /api/roles',
        run: () => rolesGET(buildRequest('http://localhost/api/roles', { userId: CAJERO_USER.id })),
      },
      {
        name: 'GET /api/reportes?tipo=rentabilidad',
        run: () =>
          reportesGET(
            buildRequest('http://localhost/api/reportes?tipo=rentabilidad', { userId: CAJERO_USER.id })
          ),
      },
      {
        name: 'POST /api/bancos',
        run: () =>
          bancosPOST(
            buildRequest('http://localhost/api/bancos', {
              method: 'POST',
              userId: CAJERO_USER.id,
              body: { nombre: 'Banco Test' },
            })
          ),
      },
      {
        name: 'POST /api/productos',
        run: () =>
          productosPOST(
            buildRequest('http://localhost/api/productos', {
              method: 'POST',
              userId: CAJERO_USER.id,
              body: { nombre: 'Prod Test', precio_usd: 5 },
            })
          ),
      },
      {
        name: 'POST /api/pagos',
        run: () =>
          pagosPOST(
            buildRequest('http://localhost/api/pagos', {
              method: 'POST',
              userId: CAJERO_USER.id,
              body: { tipo_operacion: 'COBRO_VENTA', tipo_pago_id: 1, moneda: 'USD', monto_original: 10 },
            })
          ),
      },
    ];

    for (const item of forbiddenForCajero) {
      const res = await item.run();
      expect(res.status, item.name).toBe(403);
    }
  });

  it('bloquea con 403 a ALMACEN al intentar POST /api/pedidos', async () => {
    setupLiveUserQuery(ALMACEN_USER);

    const res = await pedidosPOST(
      buildRequest('http://localhost/api/pedidos', {
        method: 'POST',
        userId: ALMACEN_USER.id,
        body: { tasa_cambio_aplicada: 50, items: [{ producto_id: 1, cantidad: 1, precio_unitario_usd: 10 }] },
      })
    );

    expect(res.status).toBe(403);
  });

  it('permite GET /api/reportes con reports sin reports_profit devolviendo rentabilidadFifo: null y bloquea tipo=rentabilidad', async () => {
    setupLiveUserQuery(SUPERVISOR_USER, () => []);

    const resForbiddenProfit = await reportesGET(
      buildRequest('http://localhost/api/reportes?tipo=rentabilidad', {
        userId: SUPERVISOR_USER.id,
      })
    );
    expect(resForbiddenProfit.status).toBe(403);

    const resResumen = await reportesGET(
      buildRequest('http://localhost/api/reportes?tipo=resumen&desde=2026-01-01&hasta=2026-01-31', {
        userId: SUPERVISOR_USER.id,
      })
    );
    expect(resResumen.status).toBe(200);
    const data = (await resResumen.json()) as {
      success: boolean;
      rentabilidadFifo: unknown;
    };
    expect(data.success).toBe(true);
    expect(data.rentabilidadFifo).toBeNull();

    const executedSqls = mockQuery.mock.calls.map(([sql]) => sql);
    expect(executedSqls.some((sql) => sql.includes('FROM t_compra'))).toBe(false);
  });
});

describe('3. Autenticación, login, upgrade SHA-256 -> scrypt, logout y cambio de contraseña', () => {
  it('POST /api/auth/login emite cookie HttpOnly y sesión válida con clave scrypt', async () => {
    const strongHash = hashPassword('ClaveSegura2026!');
    mockQuery.mockImplementation(async (sql) => {
      if (sql.includes('WHERE LOWER(u.username)')) {
        return [
          {
            ...ADMIN_USER,
            password_hash: strongHash,
          },
        ];
      }
      return [];
    });

    const res = await loginPOST(
      buildRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: { username: 'admin', password: 'ClaveSegura2026!' },
      })
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      mustChangePassword: boolean;
      user: { id: number; must_change_password: boolean };
    };
    expect(json.success).toBe(true);
    expect(json.mustChangePassword).toBe(false);
    expect(json.user.must_change_password).toBe(false);

    const sessionCookie = res.cookies.get(SESSION_COOKIE_NAME);
    expect(sessionCookie?.value).toBeTruthy();
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(sessionCookie?.sameSite).toBe('lax');
    expect(res.headers.get('set-cookie') ?? '').toMatch(/HttpOnly/i);
    expect(verifySessionToken(sessionCookie?.value)?.uid).toBe(1);
  });

  it('POST /api/auth/login migra hash SHA-256 legacy a scrypt$ en la BD', async () => {
    const legacySha256 = crypto.createHash('sha256').update('LegacyPass2026!').digest('hex');

    mockQuery.mockImplementation(async (sql) => {
      if (sql.includes('WHERE LOWER(u.username)')) {
        return [
          {
            ...SUPERVISOR_USER,
            password_hash: legacySha256,
          },
        ];
      }
      return [];
    });

    const res = await loginPOST(
      buildRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: { username: 'supervisor', password: 'LegacyPass2026!' },
      })
    );

    expect(res.status).toBe(200);
    const upgradeCall = mockQuery.mock.calls.find(([sql]) =>
      sql.includes('UPDATE m_usuario SET password_hash = $1')
    );
    expect(upgradeCall).toBeDefined();

    const upgradedHash = String(upgradeCall?.[1]?.[0] ?? '');
    expect(upgradedHash.startsWith('scrypt$')).toBe(true);
    expect(verifyPassword('LegacyPass2026!', upgradedHash)).toBe(true);
    expect(upgradeCall?.[1]?.[1]).toBe(SUPERVISOR_USER.id);
  });

  it('POST /api/auth/login marca mustChangePassword: true cuando la clave es admin123', async () => {
    const defaultHash = hashPassword(DEFAULT_SEED_PASSWORD);
    mockQuery.mockImplementation(async (sql) => {
      if (sql.includes('WHERE LOWER(u.username)')) {
        return [{ ...ADMIN_USER, password_hash: defaultHash }];
      }
      return [];
    });

    const res = await loginPOST(
      buildRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: { username: 'admin', password: DEFAULT_SEED_PASSWORD },
      })
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      mustChangePassword: boolean;
      user: { must_change_password: boolean };
    };
    expect(json.mustChangePassword).toBe(true);
    expect(json.user.must_change_password).toBe(true);
  });

  it('POST /api/auth/login responde 401 con clave inválida y 403 con usuario inactivo', async () => {
    const validHash = hashPassword('ClaveValida2026!');
    mockQuery.mockImplementation(async (sql) => {
      if (sql.includes('WHERE LOWER(u.username)')) {
        return [{ ...CAJERO_USER, password_hash: validHash, activo: false }];
      }
      return [];
    });

    const resBadPassword = await loginPOST(
      buildRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: { username: 'cajero', password: 'ClaveIncorrecta' },
      })
    );
    expect(resBadPassword.status).toBe(401);
    expect(resBadPassword.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();

    const resInactiveUser = await loginPOST(
      buildRequest('http://localhost/api/auth/login', {
        method: 'POST',
        body: { username: 'cajero', password: 'ClaveValida2026!' },
      })
    );
    expect(resInactiveUser.status).toBe(403);
    expect(resInactiveUser.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it('POST /api/auth/logout limpia la cookie pos_session con Max-Age=0', async () => {
    const res = await logoutPOST();

    expect(res.status).toBe(200);
    const cookie = res.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie?.value).toBe('');
    expect(cookie?.maxAge).toBe(0);
    expect((res.headers.get('set-cookie') ?? '').toLowerCase()).toContain('max-age=0');
  });

  it('GET /api/auth/me lee sesión desde cookies() de next/headers y reporta mustChangePassword', async () => {
    const token = createSessionToken(ADMIN_USER.id, 3600);
    mockCookieGet.mockReturnValue({ value: token });

    const defaultHash = hashPassword(DEFAULT_SEED_PASSWORD);
    setupLiveUserQuery(ADMIN_USER, (sql) => {
      if (sql.includes('SELECT password_hash FROM m_usuario')) {
        return [{ password_hash: defaultHash }];
      }
      return [];
    });

    const res = await meGET(buildRequest('http://localhost/api/auth/me'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      mustChangePassword: boolean;
      user: { id: number; must_change_password: boolean };
    };
    expect(json.success).toBe(true);
    expect(json.user.id).toBe(ADMIN_USER.id);
    expect(json.mustChangePassword).toBe(true);
    expect(json.user.must_change_password).toBe(true);
  });

  it('POST /api/auth/change-password valida clave actual, fuerza mínima y actualiza con scrypt', async () => {
    const currentHash = hashPassword(DEFAULT_SEED_PASSWORD);
    setupLiveUserQuery(ADMIN_USER, (sql) => {
      if (sql.includes('SELECT password_hash FROM m_usuario')) {
        return [{ password_hash: currentHash }];
      }
      return [];
    });

    const resWeak = await changePasswordPOST(
      buildRequest('http://localhost/api/auth/change-password', {
        method: 'POST',
        userId: ADMIN_USER.id,
        body: { currentPassword: DEFAULT_SEED_PASSWORD, newPassword: 'corta' },
      })
    );
    expect(resWeak.status).toBe(400);

    const resDefault = await changePasswordPOST(
      buildRequest('http://localhost/api/auth/change-password', {
        method: 'POST',
        userId: ADMIN_USER.id,
        body: { currentPassword: DEFAULT_SEED_PASSWORD, newPassword: DEFAULT_SEED_PASSWORD },
      })
    );
    expect(resDefault.status).toBe(400);

    const resWrongCurrent = await changePasswordPOST(
      buildRequest('http://localhost/api/auth/change-password', {
        method: 'POST',
        userId: ADMIN_USER.id,
        body: { currentPassword: 'ClaveEquivocada!', newPassword: 'NuevaClaveSegura2026!' },
      })
    );
    expect(resWrongCurrent.status).toBe(401);

    const resSuccess = await changePasswordPOST(
      buildRequest('http://localhost/api/auth/change-password', {
        method: 'POST',
        userId: ADMIN_USER.id,
        body: { currentPassword: DEFAULT_SEED_PASSWORD, newPassword: 'NuevaClaveSegura2026!' },
      })
    );
    expect(resSuccess.status).toBe(200);

    const updateCall = mockQuery.mock.calls.find(([sql]) =>
      sql.includes('UPDATE m_usuario SET password_hash = $1 WHERE id = $2')
    );
    expect(updateCall).toBeDefined();
    const nextHash = String(updateCall?.[1]?.[0] ?? '');
    expect(nextHash.startsWith('scrypt$')).toBe(true);
    expect(verifyPassword('NuevaClaveSegura2026!', nextHash)).toBe(true);
    expect(updateCall?.[1]?.[1]).toBe(ADMIN_USER.id);
  });
});

describe('4. Controles críticos: mantenimiento, respaldo redactado, protección rol/usuario 1 e integridad de autor', () => {
  it('POST /api/mantenimiento exige confirmPhrase === "REINICIAR"', async () => {
    setupLiveUserQuery(ADMIN_USER);

    const resMissingPhrase = await mantenimientoPOST(
      buildRequest('http://localhost/api/mantenimiento', {
        method: 'POST',
        userId: ADMIN_USER.id,
        body: { action: 'reset_ventas', confirmPhrase: 'CONFIRMAR' },
      })
    );
    expect(resMissingPhrase.status).toBe(400);
    expect(mockPoolConnect).not.toHaveBeenCalled();

    const resValid = await mantenimientoPOST(
      buildRequest('http://localhost/api/mantenimiento', {
        method: 'POST',
        userId: ADMIN_USER.id,
        body: { action: 'reset_ventas', confirmPhrase: 'REINICIAR' },
      })
    );
    expect(resValid.status).toBe(200);
    expect(mockClientRelease).toHaveBeenCalledTimes(1);
  });

  it('GET /api/respaldo redacta password_hash de m_usuario con __REDACTED_RESET_REQUIRED__', async () => {
    setupLiveUserQuery(ADMIN_USER);
    const sensitiveHash = 'scrypt$16384$8$1$secretSaltValueHex$superSecretDerivedHashHex987654';

    mockPoolQuery.mockImplementation(async (sql) => {
      if (sql.includes('information_schema.tables')) {
        return { rows: [{ table_name: 'm_rol' }, { table_name: 'm_usuario' }] };
      }
      if (sql.includes('FROM "m_rol"')) {
        return {
          rows: [{ id: 1, nombre: 'ADMINISTRADOR', permisos: ['users', 'maintenance'], activo: true }],
        };
      }
      if (sql.includes('FROM "m_usuario"')) {
        return {
          rows: [
            {
              id: 1,
              username: 'admin',
              password_hash: sensitiveHash,
              nombre_completo: 'Administrador del Sistema',
              rol_id: 1,
              activo: true,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const res = await respaldoGET(
      buildRequest('http://localhost/api/respaldo', { userId: ADMIN_USER.id })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toContain('application/sql');
    const sqlDump = await res.text();
    expect(sqlDump).not.toContain(sensitiveHash);
    expect(sqlDump).not.toContain('superSecretDerivedHashHex987654');
    expect(sqlDump).toContain("'__REDACTED_RESET_REQUIRED__'");
  });

  it('PUT /api/usuarios y PUT /api/roles impiden degradar al usuario 1 o quitar users/maintenance al rol 1', async () => {
    setupLiveUserQuery(ADMIN_USER);

    const resDemoteUser1 = await usuariosPUT(
      buildRequest('http://localhost/api/usuarios', {
        method: 'PUT',
        userId: ADMIN_USER.id,
        body: { id: 1, rol_id: 3 },
      })
    );
    expect(resDemoteUser1.status).toBe(400);

    const resDeactivateUser1 = await usuariosPUT(
      buildRequest('http://localhost/api/usuarios', {
        method: 'PUT',
        userId: ADMIN_USER.id,
        body: { id: 1, activo: false },
      })
    );
    expect(resDeactivateUser1.status).toBe(400);

    const resEmptyRole1 = await rolesPUT(
      buildRequest('http://localhost/api/roles', {
        method: 'PUT',
        userId: ADMIN_USER.id,
        body: { id: 1, permisos: [] },
      })
    );
    expect(resEmptyRole1.status).toBe(400);

    const resStripMaintenanceRole1 = await rolesPUT(
      buildRequest('http://localhost/api/roles', {
        method: 'PUT',
        userId: ADMIN_USER.id,
        body: { id: 1, permisos: ['pos', 'users'] },
      })
    );
    expect(resStripMaintenanceRole1.status).toBe(400);

    const resStripUsersRole1 = await rolesPUT(
      buildRequest('http://localhost/api/roles', {
        method: 'PUT',
        userId: ADMIN_USER.id,
        body: { id: 1, permisos: ['pos', 'maintenance'] },
      })
    );
    expect(resStripUsersRole1.status).toBe(400);

    const resDeactivateRole1 = await rolesPUT(
      buildRequest('http://localhost/api/roles', {
        method: 'PUT',
        userId: ADMIN_USER.id,
        body: { id: 1, activo: false },
      })
    );
    expect(resDeactivateRole1.status).toBe(400);

    const resDeleteUser1 = await usuariosDELETE(
      buildRequest('http://localhost/api/usuarios?id=1', {
        method: 'DELETE',
        userId: ADMIN_USER.id,
      })
    );
    expect(resDeleteUser1.status).toBe(400);
  });

  it('POST /api/pedidos usa session.user.id en t_pago aunque el body envíe otro usuario_id/creado_por', async () => {
    setupLiveUserQuery(CAJERO_USER);

    mockClientQuery.mockImplementation(async (sql) => {
      if (sql.includes('FROM m_tercero WHERE id = $1')) {
        return { rows: [{ razon_social_nombre: 'Cliente Genérico' }] };
      }
      if (sql.includes('FROM m_producto p')) {
        return {
          rows: [
            {
              id: 10,
              nombre: 'Harina',
              stock_actual: 50,
              impuesto_id: 1,
              unidad_base: 'Unidad',
              impuesto_porcentaje: 16,
            },
          ],
        };
      }
      if (sql.includes('INSERT INTO t_pedido')) {
        return { rows: [{ id: 501, total_usd: 11.6 }] };
      }
      if (sql.includes('FROM m_tipopago WHERE id = $1')) {
        return { rows: [{ moneda: 'USD' }] };
      }
      if (sql.includes('INSERT INTO t_pago (')) {
        return { rows: [{ id: 601 }] };
      }
      return { rows: [] };
    });

    const res = await pedidosPOST(
      buildRequest('http://localhost/api/pedidos', {
        method: 'POST',
        userId: CAJERO_USER.id,
        body: {
          tercero_id: 1,
          tasa_cambio_aplicada: 50,
          condicion_pago: 'CONTADO',
          tipo_pago_id: 1,
          registrar_pago: true,
          usuario_id: 999,
          creado_por: 888,
          items: [{ producto_id: 10, cantidad: 2, precio_unitario_usd: 5 }],
        },
      })
    );

    expect(res.status).toBe(200);
    const insertPagoCall = mockClientQuery.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO t_pago (')
    );
    expect(insertPagoCall).toBeDefined();
    const pagoParams = insertPagoCall?.[1] ?? [];
    expect(pagoParams[10]).toBe(CAJERO_USER.id);
    expect(pagoParams).not.toContain(999);
    expect(pagoParams).not.toContain(888);
  });

  it('POST /api/compras usa session.user.id en t_pago aunque el body envíe otro usuario_id/creado_por', async () => {
    setupLiveUserQuery(ALMACEN_USER);

    mockClientQuery.mockImplementation(async (sql) => {
      if (sql.includes('FROM m_tercero WHERE id = $1')) {
        return { rows: [{ id: 2, tipo: 'PROVEEDOR', razon_social_nombre: 'Distribuidora' }] };
      }
      if (sql.includes('FROM m_impuesto')) {
        return { rows: [{ id: 1, porcentaje: 16 }] };
      }
      if (sql.includes("SELECT COALESCE(unidad_base, 'Unidad')")) {
        return { rows: [{ u: 'Unidad' }] };
      }
      if (sql.includes('INSERT INTO t_compra')) {
        return { rows: [{ id: 701 }] };
      }
      if (sql.includes('FROM m_tipopago WHERE id = $1')) {
        return { rows: [{ moneda: 'USD' }] };
      }
      if (sql.includes('FROM m_producto WHERE id = $1 FOR UPDATE')) {
        return { rows: [{ id: 10, stock_actual: 10, costo_promedio_usd: 2 }] };
      }
      return { rows: [] };
    });

    const res = await comprasPOST(
      buildRequest('http://localhost/api/compras', {
        method: 'POST',
        userId: ALMACEN_USER.id,
        body: {
          numero_factura: 'FAC-1001',
          tercero_id: 2,
          tasa_cambio_aplicada: 50,
          condicion_pago: 'CONTADO',
          tipo_pago_id: 1,
          registrar_pago: true,
          estado: 'COMPLETADO',
          usuario_id: 999,
          creado_por: 777,
          items: [{ producto_id: 10, cantidad: 5, costo_unitario_usd: 3, impuesto_id: 1 }],
        },
      })
    );

    expect(res.status).toBe(200);
    const insertPagoCall = mockClientQuery.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO t_pago (')
    );
    expect(insertPagoCall).toBeDefined();
    const pagoParams = insertPagoCall?.[1] ?? [];
    expect(pagoParams[10]).toBe(ALMACEN_USER.id);
    expect(pagoParams).not.toContain(999);
    expect(pagoParams).not.toContain(777);
  });

  it('POST /api/pagos usa session.user.id en t_pago aunque el body envíe otro usuario_id/creado_por', async () => {
    setupLiveUserQuery(SUPERVISOR_USER);

    mockClientQuery.mockImplementation(async (sql) => {
      if (sql.includes('INSERT INTO t_pago (')) {
        return { rows: [{ id: 801, creado_por: SUPERVISOR_USER.id }] };
      }
      return { rows: [] };
    });

    const res = await pagosPOST(
      buildRequest('http://localhost/api/pagos', {
        method: 'POST',
        userId: SUPERVISOR_USER.id,
        body: {
          tipo_operacion: 'COBRO_VENTA',
          pedido_id: 501,
          tercero_id: 1,
          tipo_pago_id: 1,
          moneda: 'USD',
          monto_original: 25,
          tasa_cambio: 50,
          usuario_id: 999,
          creado_por: 555,
        },
      })
    );

    expect(res.status).toBe(200);
    const insertPagoCall = mockClientQuery.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO t_pago (')
    );
    expect(insertPagoCall).toBeDefined();
    const pagoParams = insertPagoCall?.[1] ?? [];
    expect(pagoParams[12]).toBe(SUPERVISOR_USER.id);
    expect(pagoParams).not.toContain(999);
    expect(pagoParams).not.toContain(555);
  });
});
