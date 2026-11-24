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
  AccountingError,
  calculateWeightedAverageCost,
  getPaymentBalanceDelta,
  resolveServerUnitPrice,
  validateCurrencyMatch,
} from '@/lib/accounting';
import { POST as comprasPOST, PATCH as comprasPATCH } from '@/app/api/compras/route';
import { POST as pedidosPOST, PATCH as pedidosPATCH } from '@/app/api/pedidos/route';
import { POST as pagosPOST, PATCH as pagosPATCH } from '@/app/api/pagos/route';
import { GET as pendientesGET } from '@/app/api/pagos/pendientes/route';
import { POST as mantenimientoPOST } from '@/app/api/mantenimiento/route';
import { ALL_PERMISSIONS } from '@/lib/permissions';
import { SESSION_COOKIE_NAME, createSessionToken } from '@/lib/session';

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

let prevSecret: string | undefined;

function buildRequest(url: string, options: { method?: string; body?: unknown } = {}): Request {
  const token = createSessionToken(ADMIN_USER.id, 3600);
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

function setupAdminAuth(extraQueryHandler?: (sql: string, params?: unknown[]) => Record<string, unknown>[]): void {
  mockQuery.mockImplementation(async (sql, params) => {
    if (sql.includes('FROM m_usuario u') && sql.includes('JOIN m_rol r')) {
      return [ADMIN_USER as unknown as Record<string, unknown>];
    }
    if (extraQueryHandler) {
      return extraQueryHandler(sql, params);
    }
    return [];
  });
}

beforeAll(() => {
  prevSecret = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = 'vitest-phase2-accounting-secret';
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

describe('1. Helpers puros de contabilidad (src/lib/accounting.ts)', () => {
  it('calculateWeightedAverageCost calcula el costo promedio ponderado por factor de presentación', () => {
    // 10 unidades a $2.00 + 1 caja de 10 unidades a $30.00 ($3.00 c/u base) => (20 + 30) / 20 = 2.5000
    const avg = calculateWeightedAverageCost({
      stockAnterior: 10,
      costoAnterior: 2,
      cantidadBaseComprada: 10,
      costoUnitarioPresentacion: 30,
      factorConversion: 10,
    });
    expect(avg).toBe(2.5);

    // Con stock previo 0 o negativo, usa el costo unitario base de la nueva compra
    const initial = calculateWeightedAverageCost({
      stockAnterior: 0,
      costoAnterior: 1.5,
      cantidadBaseComprada: 12,
      costoUnitarioPresentacion: 24,
      factorConversion: 12,
    });
    expect(initial).toBe(2);
  });

  it('getPaymentBalanceDelta, resolveServerUnitPrice y validateCurrencyMatch aplican reglas estrictas', () => {
    expect(getPaymentBalanceDelta('COBRO_VENTA', 25)).toBe(25);
    expect(getPaymentBalanceDelta('ABONO_VENTA', 10)).toBe(10);
    expect(getPaymentBalanceDelta('PAGO_COMPRA', 40)).toBe(-40);
    expect(getPaymentBalanceDelta('ABONO_COMPRA', 15)).toBe(-15);

    expect(resolveServerUnitPrice(4.5, null)).toBe(4.5);
    expect(resolveServerUnitPrice(4.5, { precio_usd: 48 })).toBe(48);
    expect(() => resolveServerUnitPrice(-1, null)).toThrow(AccountingError);

    expect(() => validateCurrencyMatch('USD', 'VES', 'La cuenta bancaria seleccionada')).toThrow(
      AccountingError
    );
  });
});

describe('2. Compras: t_pago_documento, costo promedio y reversión al anular', () => {
  it('POST /api/compras CONTADO inserta t_pago_documento vinculado y actualiza cuenta bancaria', async () => {
    setupAdminAuth();
    mockClientQuery.mockImplementation(async (sql) => {
      if (sql.includes('FROM m_tercero WHERE id = $1')) {
        return { rows: [{ id: 2, tipo: 'PROVEEDOR', razon_social_nombre: 'Proveedor Uno' }] };
      }
      if (sql.includes('FROM m_impuesto')) {
        return { rows: [{ id: 1, porcentaje: 16 }] };
      }
      if (sql.includes("SELECT COALESCE(unidad_base, 'Unidad')")) {
        return { rows: [{ u: 'Unidad' }] };
      }
      if (sql.includes('INSERT INTO t_compra')) {
        return { rows: [{ id: 101 }] };
      }
      if (sql.includes('FROM m_tipopago WHERE id = $1')) {
        return { rows: [{ id: 1, moneda: 'USD' }] };
      }
      if (sql.includes('FROM m_cuentabancaria WHERE id = $1 FOR UPDATE')) {
        return { rows: [{ id: 3, moneda: 'USD', saldo_actual: 500 }] };
      }
      if (sql.includes('INSERT INTO t_pago (')) {
        return { rows: [{ id: 801 }] };
      }
      if (sql.includes('FROM m_producto WHERE id = $1 FOR UPDATE')) {
        return { rows: [{ id: 10, stock_actual: 10, costo_promedio_usd: 2 }] };
      }
      return { rows: [] };
    });

    const res = await comprasPOST(
      buildRequest('http://localhost/api/compras', {
        method: 'POST',
        body: {
          numero_factura: 'FC-001',
          tercero_id: 2,
          tasa_cambio_aplicada: 50,
          condicion_pago: 'CONTADO',
          tipo_pago_id: 1,
          cuenta_bancaria_id: 3,
          registrar_pago: true,
          estado: 'COMPLETADO',
          items: [{ producto_id: 10, cantidad: 5, costo_unitario_usd: 4, impuesto_id: 1 }],
        },
      })
    );

    expect(res.status).toBe(200);
    expect(mockClientRelease).toHaveBeenCalled();
    const pagoDocCall = mockClientQuery.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO t_pago_documento')
    );
    expect(pagoDocCall).toBeDefined();
    expect(pagoDocCall?.[1]).toEqual([801, 101, 23.2, 23.2]);

    const bankUpdateCall = mockClientQuery.mock.calls.find(([sql]) =>
      sql.includes('UPDATE m_cuentabancaria SET saldo_actual = saldo_actual - $1')
    );
    expect(bankUpdateCall?.[1]).toEqual([23.2, 3]);
  });

  it('POST /api/compras rechaza 400 si la cuenta bancaria tiene moneda distinta al método de pago', async () => {
    setupAdminAuth();
    mockClientQuery.mockImplementation(async (sql) => {
      if (sql.includes('FROM m_tercero WHERE id = $1')) {
        return { rows: [{ id: 2, tipo: 'PROVEEDOR', razon_social_nombre: 'Proveedor Uno' }] };
      }
      if (sql.includes('FROM m_impuesto')) {
        return { rows: [{ id: 1, porcentaje: 0 }] };
      }
      if (sql.includes("SELECT COALESCE(unidad_base, 'Unidad')")) {
        return { rows: [{ u: 'Unidad' }] };
      }
      if (sql.includes('INSERT INTO t_compra')) {
        return { rows: [{ id: 102 }] };
      }
      if (sql.includes('FROM m_tipopago WHERE id = $1')) {
        return { rows: [{ id: 2, moneda: 'VES' }] };
      }
      if (sql.includes('FROM m_cuentabancaria WHERE id = $1 FOR UPDATE')) {
        return { rows: [{ id: 3, moneda: 'USD', saldo_actual: 500 }] };
      }
      return { rows: [] };
    });

    const res = await comprasPOST(
      buildRequest('http://localhost/api/compras', {
        method: 'POST',
        body: {
          numero_factura: 'FC-002',
          tercero_id: 2,
          tasa_cambio_aplicada: 50,
          condicion_pago: 'CONTADO',
          tipo_pago_id: 2,
          cuenta_bancaria_id: 3,
          registrar_pago: true,
          estado: 'COMPLETADO',
          items: [{ producto_id: 10, cantidad: 2, costo_unitario_usd: 5, impuesto_id: 1 }],
        },
      })
    );

    expect(res.status).toBe(400);
    expect(mockClientQuery.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(true);
  });

  it('PATCH /api/compras recalcula costo_promedio_usd al pasar PROCESO -> COMPLETADO', async () => {
    setupAdminAuth();
    mockClientQuery.mockImplementation(async (sql) => {
      if (sql.includes('FROM t_compra WHERE id = $1 FOR UPDATE')) {
        return { rows: [{ id: 10, estado: 'PROCESO' }] };
      }
      if (sql.includes('FROM t_compralinea WHERE compra_id = $1')) {
        return {
          rows: [{ producto_id: 5, cantidad: 10, costo_unitario_usd: 30, factor_conversion: 10 }],
        };
      }
      if (sql.includes('FROM m_producto WHERE id = $1 FOR UPDATE')) {
        return { rows: [{ id: 5, stock_actual: 10, costo_promedio_usd: 2 }] };
      }
      return { rows: [] };
    });

    const res = await comprasPATCH(
      buildRequest('http://localhost/api/compras', {
        method: 'PATCH',
        body: { id: 10, estado: 'COMPLETADO' },
      })
    );

    expect(res.status).toBe(200);
    const updProd = mockClientQuery.mock.calls.find(([sql]) =>
      sql.includes('costo_promedio_usd = $2')
    );
    expect(updProd).toBeDefined();
    expect(updProd?.[1]).toEqual([10, 2.5, 5]);
  });

  it('PATCH /api/compras COMPLETADO -> ANULADO revierte stock, anula pago y devuelve dinero al banco', async () => {
    setupAdminAuth();
    mockClientQuery.mockImplementation(async (sql) => {
      if (sql.includes('FROM t_compra WHERE id = $1 FOR UPDATE')) {
        return { rows: [{ id: 11, estado: 'COMPLETADO' }] };
      }
      if (sql.includes('FROM t_compralinea WHERE compra_id = $1')) {
        return {
          rows: [{ producto_id: 5, cantidad: 4, costo_unitario_usd: 3, factor_conversion: 1 }],
        };
      }
      if (sql.includes('FROM t_pago') && sql.includes("estado = 'APROBADO'") && sql.includes('FOR UPDATE')) {
        return {
          rows: [{ id: 91, tipo_operacion: 'PAGO_COMPRA', cuenta_bancaria_id: 4, monto_original: 50 }],
        };
      }
      return { rows: [] };
    });

    const res = await comprasPATCH(
      buildRequest('http://localhost/api/compras', {
        method: 'PATCH',
        body: { id: 11, estado: 'ANULADO' },
      })
    );

    expect(res.status).toBe(200);
    const voidPago = mockClientQuery.mock.calls.find(([sql]) =>
      sql.includes("UPDATE t_pago") && sql.includes("SET estado = 'ANULADO'")
    );
    expect(voidPago?.[1]).toEqual([ADMIN_USER.id, 91]);

    const bankReversal = mockClientQuery.mock.calls.find(([sql]) =>
      sql.includes('UPDATE m_cuentabancaria SET saldo_actual = saldo_actual + $1')
    );
    expect(bankReversal?.[1]).toEqual([50, 4]);
  });

  it('PATCH /api/compras bloquea con 409 anular si el pago es compartido, devolver a PROCESO con pago o reactivar ANULADO (400)', async () => {
    setupAdminAuth();
    // 1. Shared payment -> 409
    mockClientQuery.mockImplementation(async (sql) => {
      if (sql.includes('FROM t_compra WHERE id = $1 FOR UPDATE')) {
        return { rows: [{ id: 12, estado: 'COMPLETADO' }] };
      }
      if (sql.includes('FROM t_compralinea WHERE compra_id = $1')) {
        return { rows: [] };
      }
      if (sql.includes('FROM t_pago') && sql.includes('FOR UPDATE')) {
        return { rows: [{ id: 99, tipo_operacion: 'PAGO_COMPRA', cuenta_bancaria_id: 4, monto_original: 80 }] };
      }
      if (sql.includes('FROM t_pago_documento WHERE pago_id = $1')) {
        return { rows: [{ id: 500 }] };
      }
      return { rows: [] };
    });
    const resShared = await comprasPATCH(
      buildRequest('http://localhost/api/compras', {
        method: 'PATCH',
        body: { id: 12, estado: 'ANULADO' },
      })
    );
    expect(resShared.status).toBe(409);

    // 2. COMPLETADO -> PROCESO with approved payment -> 409
    mockClientQuery.mockImplementation(async (sql) => {
      if (sql.includes('FROM t_compra WHERE id = $1 FOR UPDATE')) {
        return { rows: [{ id: 12, estado: 'COMPLETADO' }] };
      }
      if (sql.includes('FROM t_pago') && sql.includes('LIMIT 1')) {
        return { rows: [{ id: 99 }] };
      }
      return { rows: [] };
    });
    const resBackToProceso = await comprasPATCH(
      buildRequest('http://localhost/api/compras', {
        method: 'PATCH',
        body: { id: 12, estado: 'PROCESO' },
      })
    );
    expect(resBackToProceso.status).toBe(409);

    // 3. ANULADO -> COMPLETADO -> 400
    mockClientQuery.mockImplementation(async (sql) => {
      if (sql.includes('FROM t_compra WHERE id = $1 FOR UPDATE')) {
        return { rows: [{ id: 12, estado: 'ANULADO' }] };
      }
      return { rows: [] };
    });
    const resReactivate = await comprasPATCH(
      buildRequest('http://localhost/api/compras', {
        method: 'PATCH',
        body: { id: 12, estado: 'COMPLETADO' },
      })
    );
    expect(resReactivate.status).toBe(400);
  });
});

describe('3. Pedidos: precio autoritativo en servidor, validación de moneda y reversión al anular', () => {
  it('POST /api/pedidos ignora precio_unitario_usd manipulado del cliente y usa el precio oficial de BD', async () => {
    setupAdminAuth();
    mockClientQuery.mockImplementation(async (sql) => {
      if (sql.includes('FROM m_tercero WHERE id = $1')) {
        return { rows: [{ razon_social_nombre: 'Cliente Normal' }] };
      }
      if (sql.includes('FROM m_producto p')) {
        return {
          rows: [
            {
              id: 20,
              nombre: 'Refresco',
              precio_usd: 2.5,
              stock_actual: 100,
              impuesto_id: 1,
              unidad_base: 'Unidad',
              impuesto_porcentaje: 16,
            },
          ],
        };
      }
      if (sql.includes('FROM m_producto_presentacion WHERE id = $1')) {
        return { rows: [{ nombre: 'Caja x12', factor: 12, precio_usd: 25 }] };
      }
      if (sql.includes('INSERT INTO t_pedido')) {
        return { rows: [{ id: 301, total_usd: 58 }] };
      }
      if (sql.includes('FROM m_tipopago WHERE id = $1')) {
        return { rows: [{ id: 1, moneda: 'USD' }] };
      }
      if (sql.includes('FROM m_cuentabancaria WHERE id = $1 FOR UPDATE')) {
        return { rows: [{ id: 2, moneda: 'USD', saldo_actual: 100 }] };
      }
      if (sql.includes('INSERT INTO t_pago (')) {
        return { rows: [{ id: 401 }] };
      }
      return { rows: [] };
    });

    const res = await pedidosPOST(
      buildRequest('http://localhost/api/pedidos', {
        method: 'POST',
        body: {
          tercero_id: 1,
          tasa_cambio_aplicada: 50,
          condicion_pago: 'CONTADO',
          tipo_pago_id: 1,
          cuenta_bancaria_id: 2,
          registrar_pago: true,
          items: [
            {
              producto_id: 20,
              cantidad: 2,
              presentacion_id: 7,
              precio_unitario_usd: 0.01,
            },
          ],
        },
      })
    );

    expect(res.status).toBe(200);
    const insertPedidoCall = mockClientQuery.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO t_pedido')
    );
    // 2 cajas * $25 = $50 base + 16% ($8) = $58 total (ignora el 0.01 enviado)
    expect(insertPedidoCall?.[1]?.[3]).toBe(50);
    expect(insertPedidoCall?.[1]?.[4]).toBe(8);
    expect(insertPedidoCall?.[1]?.[5]).toBe(58);

    const insertLineCall = mockClientQuery.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO t_pedidolinea')
    );
    expect(insertLineCall?.[1]?.[3]).toBe(25);
  });

  it('PATCH /api/pedidos anula pago y revierte saldo bancario al anular venta; bloquea reactivación (400)', async () => {
    setupAdminAuth();
    mockClientQuery.mockImplementation(async (sql) => {
      if (sql.includes('FROM t_pedido WHERE id = $1 FOR UPDATE')) {
        return { rows: [{ id: 301, estado: 'COMPLETADO' }] };
      }
      if (sql.includes('FROM t_pedidolinea WHERE pedido_id = $1')) {
        return { rows: [{ producto_id: 20, cantidad: 24 }] };
      }
      if (sql.includes('FROM t_pago') && sql.includes('FOR UPDATE')) {
        return {
          rows: [{ id: 401, tipo_operacion: 'COBRO_VENTA', cuenta_bancaria_id: 2, monto_original: 58 }],
        };
      }
      return { rows: [] };
    });

    const resVoid = await pedidosPATCH(
      buildRequest('http://localhost/api/pedidos', {
        method: 'PATCH',
        body: { id: 301, estado: 'ANULADO' },
      })
    );
    expect(resVoid.status).toBe(200);

    const bankReversal = mockClientQuery.mock.calls.find(([sql]) =>
      sql.includes('UPDATE m_cuentabancaria SET saldo_actual = saldo_actual + $1')
    );
    expect(bankReversal?.[1]).toEqual([-58, 2]);

    // Intentar reactivar pedido anulado -> 400
    mockClientQuery.mockImplementation(async (sql) => {
      if (sql.includes('FROM t_pedido WHERE id = $1 FOR UPDATE')) {
        return { rows: [{ id: 301, estado: 'ANULADO' }] };
      }
      return { rows: [] };
    });

    const resReactivate = await pedidosPATCH(
      buildRequest('http://localhost/api/pedidos', {
        method: 'PATCH',
        body: { id: 301, estado: 'COMPLETADO' },
      })
    );
    expect(resReactivate.status).toBe(400);
  });
});

describe('4. Pagos pendientes, registro y anulación directa (/api/pagos*)', () => {
  it('GET /api/pagos/pendientes filtra pagos por estado APROBADO tanto en VENTAS como en COMPRAS', async () => {
    setupAdminAuth();
    const res = await pendientesGET(buildRequest('http://localhost/api/pagos/pendientes'));
    expect(res.status).toBe(200);

    const sqlCalls = mockQuery.mock.calls
      .map(([sql]) => sql)
      .filter((sql) => sql.includes('FROM t_pedido') || sql.includes('FROM t_compra'));

    expect(sqlCalls).toHaveLength(2);
    for (const sql of sqlCalls) {
      expect(sql).toContain("LEFT JOIN t_pago pg ON pg.id = pd.pago_id AND pg.estado = 'APROBADO'");
      expect(sql).toContain('CASE WHEN pg.id IS NOT NULL THEN pd.monto_imputado_usd ELSE 0 END');
    }
  });

  it('POST /api/pagos rechaza desajuste de moneda y PATCH /api/pagos revierte saldo al anular', async () => {
    setupAdminAuth();
    // Currency mismatch -> 400
    mockClientQuery.mockImplementation(async (sql) => {
      if (sql.includes('FROM m_tipopago WHERE id = $1')) {
        return { rows: [{ id: 1, moneda: 'USD' }] };
      }
      return { rows: [] };
    });

    const resMismatch = await pagosPOST(
      buildRequest('http://localhost/api/pagos', {
        method: 'POST',
        body: {
          tipo_operacion: 'COBRO_VENTA',
          tipo_pago_id: 1,
          moneda: 'VES',
          monto_original: 1000,
          tasa_cambio: 50,
        },
      })
    );
    expect(resMismatch.status).toBe(400);

    // PATCH void PAGO_COMPRA -> adds +monto_original back to bank account
    mockClientQuery.mockImplementation(async (sql) => {
      if (sql.includes('SELECT * FROM t_pago WHERE id = $1 FOR UPDATE')) {
        return {
          rows: [
            {
              id: 77,
              estado: 'APROBADO',
              tipo_operacion: 'PAGO_COMPRA',
              cuenta_bancaria_id: 6,
              monto_original: 120,
            },
          ],
        };
      }
      if (sql.includes('UPDATE t_pago')) {
        return { rows: [{ id: 77, estado: 'ANULADO' }] };
      }
      return { rows: [] };
    });

    const resVoidPago = await pagosPATCH(
      buildRequest('http://localhost/api/pagos', {
        method: 'PATCH',
        body: { id: 77, estado: 'ANULADO' },
      })
    );
    expect(resVoidPago.status).toBe(200);

    const bankReversal = mockClientQuery.mock.calls.find(([sql]) =>
      sql.includes('UPDATE m_cuentabancaria SET saldo_actual = saldo_actual + $1')
    );
    expect(bankReversal?.[1]).toEqual([120, 6]);
  });
});

describe('5. Mantenimiento: protección de cascada y reinicio explícito de saldos', () => {
  it('POST /api/mantenimiento bloquea reset parcial si borraría pagos de compras en cascada (409)', async () => {
    setupAdminAuth();
    mockClientQuery.mockImplementation(async (sql) => {
      if (sql.includes('FROM t_pago') && sql.includes('compra_id IS NOT NULL')) {
        return { rows: [{ cnt: 2 }] };
      }
      return { rows: [] };
    });

    const res = await mantenimientoPOST(
      buildRequest('http://localhost/api/mantenimiento', {
        method: 'POST',
        body: {
          action: 'reset_ventas',
          confirmPhrase: 'REINICIAR',
        },
      })
    );

    expect(res.status).toBe(409);
  });

  it('POST /api/mantenimiento exige resetBalances=true si hay pagos vinculados a bancos y aplica saldo nuevo al habilitarlo', async () => {
    setupAdminAuth();
    mockClientQuery.mockImplementation(async (sql) => {
      if (sql.includes('cuenta_bancaria_id IS NOT NULL')) {
        return { rows: [{ cnt: 3 }] };
      }
      return { rows: [] };
    });

    const resConflict = await mantenimientoPOST(
      buildRequest('http://localhost/api/mantenimiento', {
        method: 'POST',
        body: {
          action: 'reset_ambos',
          resetBalances: false,
          confirmPhrase: 'REINICIAR',
        },
      })
    );
    expect(resConflict.status).toBe(409);

    const resAllowed = await mantenimientoPOST(
      buildRequest('http://localhost/api/mantenimiento', {
        method: 'POST',
        body: {
          action: 'reset_ambos',
          resetBalances: true,
          newBalanceValue: 0,
          confirmPhrase: 'REINICIAR',
        },
      })
    );
    expect(resAllowed.status).toBe(200);

    const resetBankCall = mockClientQuery.mock.calls.find(([sql]) =>
      sql.includes('UPDATE m_cuentabancaria SET saldo_actual = $1')
    );
    expect(resetBankCall?.[1]).toEqual([0]);
  });
});
