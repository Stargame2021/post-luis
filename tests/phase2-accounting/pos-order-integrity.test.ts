import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModuloPermiso } from '@/types';

const {
  mockQuery,
  mockEnsureAuthTables,
  mockGetPool,
  mockClientQuery,
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

import { POST as pedidosPOST } from '@/app/api/pedidos/route';
import { ALL_PERMISSIONS } from '@/lib/permissions';
import { SESSION_COOKIE_NAME, createSessionToken } from '@/lib/session';

const ADMIN_USER = {
  id: 1,
  username: 'admin',
  nombre_completo: 'Administrador del Sistema',
  email: 'admin@tiendaexpress.com',
  rol_id: 1,
  rol_nombre: 'ADMINISTRADOR',
  permisos: [...ALL_PERMISSIONS] as ModuloPermiso[],
  activo: true,
  rol_activo: true,
};

let prevSecret: string | undefined;

function buildPostRequest(body: unknown): Request {
  const token = createSessionToken(ADMIN_USER.id, 3600);
  return new Request('http://localhost/api/pedidos', {
    method: 'POST',
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function setupAdminAuth(): void {
  mockQuery.mockImplementation(async (sql) => {
    if (sql.includes('FROM m_usuario u') && sql.includes('JOIN m_rol r')) {
      return [ADMIN_USER as unknown as Record<string, unknown>];
    }
    return [];
  });
}

beforeAll(() => {
  prevSecret = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = 'vitest-pos-order-integrity-secret';
});

afterAll(() => {
  if (prevSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = prevSecret;
});

beforeEach(() => {
  vi.clearAllMocks();
  setupAdminAuth();
});

describe('Task 2 · Integridad transaccional de POST /api/pedidos', () => {
  it('P0-6: ordena los ítems por producto_id antes de ejecutar FOR UPDATE OF p', async () => {
    const lockedIds: number[] = [];

    mockClientQuery.mockImplementation(async (sql, params) => {
      if (sql.includes('FROM m_tercero WHERE id = $1')) {
        return { rows: [{ razon_social_nombre: 'Cliente Test' }] };
      }
      if (sql.includes('FROM m_producto p') && sql.includes('FOR UPDATE OF p')) {
        const id = Number(params?.[0]);
        lockedIds.push(id);
        return {
          rows: [
            {
              id,
              nombre: `Prod ${id}`,
              precio_usd: 10,
              stock_actual: 50,
              impuesto_id: 2,
              activo: true,
              unidad_base: 'Unidad',
              impuesto_porcentaje: 0,
            },
          ],
        };
      }
      if (sql.includes('FROM m_tipopago WHERE id = $1')) {
        return { rows: [{ id: 1, nombre: 'Efectivo $', moneda: 'USD', requiere_referencia: false }] };
      }
      if (sql.includes('INSERT INTO t_pedido')) {
        return { rows: [{ id: 500, total_usd: 30 }] };
      }
      if (sql.includes('INSERT INTO t_pago (')) {
        return { rows: [{ id: 600 }] };
      }
      return { rows: [] };
    });

    const res = await pedidosPOST(
      buildPostRequest({
        tercero_id: 1,
        tasa_cambio_aplicada: 50,
        condicion_pago: 'CONTADO',
        tipo_pago_id: 1,
        registrar_pago: true,
        items: [
          { producto_id: 30, cantidad: 1 },
          { producto_id: 5, cantidad: 1 },
          { producto_id: 12, cantidad: 1 },
        ],
      })
    );

    expect(res.status).toBe(200);
    expect(lockedIds).toEqual([5, 12, 30]);
  });

  it('P0-6: rechaza productos inactivos (activo = false)', async () => {
    mockClientQuery.mockImplementation(async (sql) => {
      if (sql.includes('FROM m_tercero WHERE id = $1')) {
        return { rows: [{ razon_social_nombre: 'Cliente Test' }] };
      }
      if (sql.includes('FROM m_producto p')) {
        return {
          rows: [
            {
              id: 7,
              nombre: 'Producto Descontinuado',
              precio_usd: 5,
              stock_actual: 10,
              impuesto_id: 1,
              activo: false,
              unidad_base: 'Unidad',
              impuesto_porcentaje: 16,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const res = await pedidosPOST(
      buildPostRequest({
        tercero_id: 1,
        tasa_cambio_aplicada: 50,
        condicion_pago: 'CONTADO',
        tipo_pago_id: 1,
        registrar_pago: true,
        items: [{ producto_id: 7, cantidad: 1 }],
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toContain('inactivo');
  });

  it('P0-6: guarda tipo_pago_id = null en crédito sin abono inicial y no inserta t_pago', async () => {
    mockClientQuery.mockImplementation(async (sql) => {
      if (sql.includes('FROM m_tercero WHERE id = $1')) {
        return { rows: [{ razon_social_nombre: 'Cliente Crédito' }] };
      }
      if (sql.includes('FROM m_producto p')) {
        return {
          rows: [
            {
              id: 1,
              nombre: 'Café',
              precio_usd: 10,
              stock_actual: 10,
              impuesto_id: 2,
              activo: true,
              unidad_base: 'Unidad',
              impuesto_porcentaje: 0,
            },
          ],
        };
      }
      if (sql.includes('INSERT INTO t_pedido')) {
        return { rows: [{ id: 501, total_usd: 10 }] };
      }
      return { rows: [] };
    });

    const res = await pedidosPOST(
      buildPostRequest({
        tercero_id: 1,
        tasa_cambio_aplicada: 50,
        condicion_pago: 'CREDITO_15',
        tipo_pago_id: null,
        registrar_pago: false,
        items: [{ producto_id: 1, cantidad: 1 }],
      })
    );

    expect(res.status).toBe(200);
    const insertPedido = mockClientQuery.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO t_pedido')
    );
    // Parámetro 9 (índice 8) es tipo_pago_id
    expect(insertPedido?.[1]?.[8]).toBeNull();
    const insertPago = mockClientQuery.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO t_pago (')
    );
    expect(insertPago).toBeUndefined();
  });

  it('P0-2: rechaza crédito con registrar_pago=true si monto_pago es 0/null o >= total', async () => {
    const setupProduct = () => {
      mockClientQuery.mockImplementation(async (sql) => {
        if (sql.includes('FROM m_tercero WHERE id = $1')) {
          return { rows: [{ razon_social_nombre: 'Cliente Crédito' }] };
        }
        if (sql.includes('FROM m_producto p')) {
          return {
            rows: [
              {
                id: 1,
                nombre: 'Café',
                precio_usd: 10,
                stock_actual: 10,
                impuesto_id: 2,
                activo: true,
                unidad_base: 'Unidad',
                impuesto_porcentaje: 0,
              },
            ],
          };
        }
        if (sql.includes('FROM m_tipopago WHERE id = $1')) {
          return { rows: [{ id: 1, nombre: 'Efectivo $', moneda: 'USD', requiere_referencia: false }] };
        }
        return { rows: [] };
      });
    };

    setupProduct();
    const resZero = await pedidosPOST(
      buildPostRequest({
        tercero_id: 1,
        tasa_cambio_aplicada: 50,
        condicion_pago: 'CREDITO_15',
        tipo_pago_id: 1,
        registrar_pago: true,
        monto_pago: null,
        items: [{ producto_id: 1, cantidad: 1 }],
      })
    );
    expect(resZero.status).toBe(400);

    setupProduct();
    const resFull = await pedidosPOST(
      buildPostRequest({
        tercero_id: 1,
        tasa_cambio_aplicada: 50,
        condicion_pago: 'CREDITO_15',
        tipo_pago_id: 1,
        registrar_pago: true,
        monto_pago: 10,
        items: [{ producto_id: 1, cantidad: 1 }],
      })
    );
    expect(resFull.status).toBe(400);
  });

  it('P0-6: rechaza pago sin referencia cuando el método tiene requiere_referencia = true', async () => {
    mockClientQuery.mockImplementation(async (sql) => {
      if (sql.includes('FROM m_tercero WHERE id = $1')) {
        return { rows: [{ razon_social_nombre: 'Cliente Pago Móvil' }] };
      }
      if (sql.includes('FROM m_producto p')) {
        return {
          rows: [
            {
              id: 1,
              nombre: 'Café',
              precio_usd: 10,
              stock_actual: 10,
              impuesto_id: 2,
              activo: true,
              unidad_base: 'Unidad',
              impuesto_porcentaje: 0,
            },
          ],
        };
      }
      if (sql.includes('FROM m_tipopago WHERE id = $1')) {
        return { rows: [{ id: 3, nombre: 'Pago Móvil (Bs)', moneda: 'VES', requiere_referencia: true }] };
      }
      return { rows: [] };
    });

    const res = await pedidosPOST(
      buildPostRequest({
        tercero_id: 1,
        tasa_cambio_aplicada: 50,
        condicion_pago: 'CONTADO',
        tipo_pago_id: 3,
        referencia_pago: '   ',
        registrar_pago: true,
        items: [{ producto_id: 1, cantidad: 1 }],
      })
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.message).toContain('referencia');
  });
});
