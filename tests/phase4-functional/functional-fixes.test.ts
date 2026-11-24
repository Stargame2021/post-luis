import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModuloPermiso } from '@/types';

const {
  mockQuery,
  mockEnsureAuthTables,
  mockGetPool,
  mockClientQuery,
  mockClientRelease,
} = vi.hoisted(() => {
  const mockClientQuery = vi.fn<
    (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
  >(async () => ({ rows: [] }));
  const mockClientRelease = vi.fn<() => void>();
  const mockPoolConnect = vi.fn(async () => ({
    query: mockClientQuery,
    release: mockClientRelease,
  }));
  const mockGetPool = vi.fn(() => ({
    query: vi.fn(async () => ({ rows: [] })),
    connect: mockPoolConnect,
    end: vi.fn(async () => undefined),
  }));
  const mockQuery = vi.fn<
    (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>
  >(async () => []);
  const mockEnsureAuthTables = vi.fn<() => Promise<void>>(async () => undefined);

  return {
    mockQuery,
    mockEnsureAuthTables,
    mockGetPool,
    mockClientQuery,
    mockClientRelease,
  };
});

vi.mock('@/lib/db', () => ({
  query: mockQuery,
  getPool: mockGetPool,
  ensureAuthTables: mockEnsureAuthTables,
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));

import {
  calculateBaseFromFinalPrice,
  groupImportRows,
  parseExcelImportRows,
} from '@/lib/excel-import';
import { getCaracasDayRangeIso, parseBcvDateFromHtml } from '@/lib/bcv';
import { PUT as productosPUT } from '@/app/api/productos/route';
import { POST as productosImportPOST } from '@/app/api/productos/import/route';
import { GET as reportesGET } from '@/app/api/reportes/route';
import { GET as dashboardGET } from '@/app/api/dashboard/route';
import { GET as empresaGET, PUT as empresaPUT } from '@/app/api/empresa/route';
import { ALL_PERMISSIONS } from '@/lib/permissions';
import { SESSION_COOKIE_NAME, createSessionToken } from '@/lib/session';

const ROOT_DIR = process.cwd();

interface MockUser {
  id: number;
  username: string;
  nombre_completo: string;
  email: string | null;
  rol_id: number;
  rol_nombre: string;
  permisos: ModuloPermiso[];
  activo: boolean;
  rol_activo: boolean;
}

const ADMIN_USER: MockUser = {
  id: 1,
  username: 'admin',
  nombre_completo: 'Administrador del Sistema',
  email: 'admin@tiendaexpress.com',
  rol_id: 1,
  rol_nombre: 'ADMINISTRADOR',
  permisos: [...ALL_PERMISSIONS],
  activo: true,
  rol_activo: true,
};

const CAJERO_USER: MockUser = {
  id: 2,
  username: 'cajero',
  nombre_completo: 'Cajero Principal',
  email: 'cajero@tiendaexpress.com',
  rol_id: 3,
  rol_nombre: 'CAJERO',
  permisos: ['pos', 'price_list', 'orders', 'rates'],
  activo: true,
  rol_activo: true,
};

let prevSecret: string | undefined;

function buildRequest(
  url: string,
  options: { method?: string; userId?: number; body?: unknown } = {}
): Request {
  const token = createSessionToken(options.userId ?? ADMIN_USER.id, 3600);
  const headers: Record<string, string> = {
    cookie: `${SESSION_COOKIE_NAME}=${token}`,
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  return new Request(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

function setupUser(
  user: MockUser,
  extraHandler?: (sql: string, params?: unknown[]) => Record<string, unknown>[]
): void {
  mockQuery.mockImplementation(async (sql, params) => {
    if (sql.includes('FROM m_usuario u') && sql.includes('JOIN m_rol r')) {
      return [user as unknown as Record<string, unknown>];
    }
    if (extraHandler) return extraHandler(sql, params);
    return [];
  });
}

beforeAll(() => {
  prevSecret = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = 'vitest-phase4-functional-secret';
});

afterAll(() => {
  if (prevSecret === undefined) {
    delete process.env.AUTH_SECRET;
  } else {
    process.env.AUTH_SECRET = prevSecret;
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockResolvedValue([]);
  mockClientQuery.mockResolvedValue({ rows: [] });
});

describe('1. Importador Excel y cálculo sin saltos de redondeo PVP/IVA', () => {
  it('parseExcelImportRows NO convierte "Botella 500ml" ni "Harina 1kg" en factor 500', () => {
    const rows = parseExcelImportRows([
      {
        Producto: 'Agua Mineral',
        Presentacion: 'Botella 500ml',
        Factor: '',
        'Precio USD': 0.75,
        'Costo USD': 0.4,
        'Impuesto ID': 2,
        Existencia: 30,
      },
      {
        Producto: 'Agua Mineral',
        Presentacion: 'Fardo 24',
        Factor: 24,
        'Precio USD': 15,
        Existencia: '',
      },
      {
        Producto: 'Cerveza',
        Presentacion: 'Sixpack',
        Factor: '',
        'Precio USD': 5.5,
      },
      {
        Producto: 'Producto Malo',
        Presentacion: 'Unidad',
        Factor: 1,
        'Precio USD': -5,
      },
    ]);

    expect(rows[0].factor).toBe(1);
    expect(rows[0].costo).toBe(0.4);
    expect(rows[0].impuestoId).toBe(2);
    expect(rows[0].isValid).toBe(true);
    expect(rows[1].factor).toBe(24);
    expect(rows[2].factor).toBe(6);
    expect(rows[3].isValid).toBe(false);

    const grouped = groupImportRows(rows);
    expect(grouped[0].costo_promedio_usd).toBe(0.4);
    expect(grouped[0].impuesto_id).toBe(2);
    expect(grouped[0].presentaciones[0].factor).toBe(24);
  });

  it('calculateBaseFromFinalPrice conserva 4 decimales evitando saltos en 0.11 y 0.18 con 16% IVA', () => {
    for (const pvp of [0.11, 0.18, 1.0, 2.35, 19.99]) {
      const base = calculateBaseFromFinalPrice(pvp, 16);
      const recomputedPvp = Number((base * 1.16).toFixed(2));
      expect(recomputedPvp).toBe(pvp);
    }
  });
});

describe('2. Zona horaria America/Caracas y parseo BCV', () => {
  it('getCaracasDayRangeIso genera rango -04:00 y parseBcvDateFromHtml extrae content / texto español', () => {
    const range = getCaracasDayRangeIso('2026-11-24', '2026-11-24');
    expect(range.startIso).toBe('2026-11-24T00:00:00.000-04:00');
    expect(range.endIso).toBe('2026-11-24T23:59:59.999-04:00');

    const htmlAttr = cheerio.load(
      '<span class="date-display-single" content="2026-11-25T00:00:00-04:00">Miércoles, 25 Noviembre 2026</span>'
    );
    expect(parseBcvDateFromHtml(htmlAttr)).toBe('2026-11-25');

    const htmlText = cheerio.load(
      '<div class="diname-round"><span class="date-display-single">Lunes, 7 Diciembre 2026</span></div>'
    );
    expect(parseBcvDateFromHtml(htmlText)).toBe('2026-12-07');
  });
});

describe('3. Productos PUT, Import API, Reportes FIFO y Dashboard VET', () => {
  it('PUT /api/productos preserva stock_actual y costo_promedio_usd con COALESCE cuando se omiten', async () => {
    setupUser(ADMIN_USER);
    mockClientQuery.mockImplementation(async (sql) => {
      if (sql.includes('UPDATE m_producto')) {
        return { rows: [{ id: 15 }] };
      }
      return { rows: [] };
    });
    mockQuery.mockImplementation(async (sql) => {
      if (sql.includes('FROM m_usuario u') && sql.includes('JOIN m_rol r')) {
        return [ADMIN_USER as unknown as Record<string, unknown>];
      }
      return [{ id: 15, nombre: 'Arroz' }];
    });

    const res = await productosPUT(
      buildRequest('http://localhost/api/productos', {
        method: 'PUT',
        body: { id: 15, nombre: 'Arroz', precio_usd: 1.8 },
      })
    );
    expect(res.status).toBe(200);
    const updCall = mockClientQuery.mock.calls.find(([sql]) =>
      sql.includes('UPDATE m_producto')
    );
    expect(updCall?.[0]).toContain('COALESCE($3, stock_actual)');
    expect(updCall?.[0]).toContain('COALESCE($4, costo_promedio_usd)');
    expect(updCall?.[1]?.[2]).toBeNull();
    expect(updCall?.[1]?.[3]).toBeNull();
    expect(mockClientRelease).toHaveBeenCalled();
  });

  it('POST /api/productos/import valida impuesto_id explícito y persiste costo_promedio_usd', async () => {
    setupUser(ADMIN_USER);
    mockClientQuery.mockImplementation(async (sql) => {
      if (sql.includes('FROM m_impuesto')) {
        return { rows: [{ id: 1, porcentaje: 16 }, { id: 2, porcentaje: 0 }] };
      }
      if (sql.includes('FROM m_producto WHERE LOWER')) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO m_producto')) {
        return { rows: [{ id: 88 }] };
      }
      return { rows: [] };
    });

    const resInvalidTax = await productosImportPOST(
      buildRequest('http://localhost/api/productos/import', {
        method: 'POST',
        body: {
          items: [{ nombre: 'Test', precio_usd: 2, stock_actual: 5, impuesto_id: 999 }],
        },
      })
    );
    expect(resInvalidTax.status).toBe(400);

    const resOk = await productosImportPOST(
      buildRequest('http://localhost/api/productos/import', {
        method: 'POST',
        body: {
          items: [
            {
              nombre: 'Botella Agua',
              precio_usd: 1.5,
              stock_actual: 20,
              costo_promedio_usd: 0.9,
              impuesto_id: 2,
            },
          ],
        },
      })
    );
    expect(resOk.status).toBe(200);
    const insCall = mockClientQuery.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO m_producto')
    );
    expect(insCall?.[1]?.[3]).toBe(0.9);
    expect(insCall?.[1]?.[5]).toBe(2);
  });

  it('GET /api/reportes y GET /api/dashboard usan America/Caracas, FIFO solo COMPLETADO y cantidad_base', async () => {
    setupUser(ADMIN_USER);
    const resRep = await reportesGET(
      buildRequest('http://localhost/api/reportes?desde=2026-11-01&hasta=2026-11-24')
    );
    expect(resRep.status).toBe(200);

    const salesCall = mockQuery.mock.calls.find(([sql]) =>
      sql.includes('FROM t_pedido p') && sql.includes('LEFT JOIN t_pedidolinea')
    );
    expect(salesCall?.[1]).toEqual([
      '2026-11-01T00:00:00.000-04:00',
      '2026-11-24T23:59:59.999-04:00',
    ]);

    const fifoBatchCall = mockQuery.mock.calls.find(([sql]) =>
      sql.includes('FROM t_compra c') && sql.includes('t_compralinea')
    );
    expect(fifoBatchCall?.[0]).toContain("COALESCE(c.estado, 'COMPLETADO') = 'COMPLETADO'");

    const resDash = await dashboardGET(buildRequest('http://localhost/api/dashboard'));
    expect(resDash.status).toBe(200);
    const topCall = mockQuery.mock.calls.find(([sql]) => sql.includes('LIMIT 5'));
    expect(topCall?.[0]).toContain('COALESCE(l.cantidad_base, l.cantidad)');
    const todayCall = mockQuery.mock.calls.find(([sql]) => sql.includes('pedidos_hoy'));
    expect(todayCall?.[0]).toContain("AT TIME ZONE 'America/Caracas'");
  });
});

describe('4. Identidad de tienda configurable (/api/empresa) y fixes UI estáticos', () => {
  it('GET /api/empresa devuelve configuración y PUT exige rol ADMIN', async () => {
    setupUser(CAJERO_USER);
    const resForbidden = await empresaPUT(
      buildRequest('http://localhost/api/empresa', {
        method: 'PUT',
        userId: CAJERO_USER.id,
        body: { nombre_comercial: 'Mi Tienda' },
      })
    );
    expect(resForbidden.status).toBe(403);

    setupUser(ADMIN_USER, (sql) => {
      if (sql.includes('INSERT INTO m_empresa')) {
        return [{ id: 1, nombre_comercial: 'Abasto El Sol', rif: 'J-123456', direccion: 'Centro', telefono: '0414', moneda_local: 'Bs.' }];
      }
      return [];
    });
    const resOk = await empresaPUT(
      buildRequest('http://localhost/api/empresa', {
        method: 'PUT',
        userId: ADMIN_USER.id,
        body: { nombre_comercial: 'Abasto El Sol', rif: 'J-123456' },
      })
    );
    expect(resOk.status).toBe(200);
    const jsonPut = (await resOk.json()) as { success: boolean; empresa: { nombre_comercial: string } };
    expect(jsonPut.empresa.nombre_comercial).toBe('Abasto El Sol');

    const resGet = await empresaGET();
    expect(resGet.status).toBe(200);
  });

  it('QrModal y ReportesView mantienen sus correcciones clave', () => {
    const qrSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'components', 'QrModal.tsx'), 'utf-8');
    expect(qrSrc).not.toContain('192.168.1.7');
    expect(qrSrc).toContain("execCommand('copy')");

    const repExportSrc = fs.readFileSync(
      path.join(ROOT_DIR, 'src', 'lib', 'export-reportes.ts'),
      'utf-8'
    );
    expect(repExportSrc).toContain('res.cantidadPedidos');
    expect(repExportSrc).toContain('rFifo.totalIngresosUsd');
    expect(repExportSrc).toContain('invSum.valorTotalCostoUsd');
    expect(repExportSrc).toContain('new Blob(');
    expect(repExportSrc).not.toContain("encodeURI('data:text/csv");
  });
});
