import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';
import { AccountingError } from '@/lib/accounting';

export async function GET(req: Request) {
  const auth = await requireAuth(req, { adminOnly: true, permissions: ['maintenance'] });
  if (!auth.ok) return auth.response;

  const pool = getPool();
  try {
    const statsQuery = `
      SELECT 
        (SELECT COUNT(*) FROM t_pedido) as pedidos_count,
        (SELECT COUNT(*) FROM t_pedidolinea) as pedidolineas_count,
        (SELECT COUNT(*) FROM t_compra) as compras_count,
        (SELECT COUNT(*) FROM t_compralinea) as compralineas_count,
        (SELECT COUNT(*) FROM m_producto) as productos_count,
        (SELECT COUNT(*) FROM m_tercero) as terceros_count,
        (SELECT COUNT(*) FROM t_pago) as pagos_count,
        (SELECT COUNT(*) FROM m_cuentabancaria WHERE saldo_actual <> 0) as cuentas_con_saldo_count
    `;
    const res = await pool.query(statsQuery);
    const row = res.rows[0] || {};
    return NextResponse.json({
      success: true,
      stats: {
        pedidos: Number(row.pedidos_count || 0),
        pedidolineas: Number(row.pedidolineas_count || 0),
        compras: Number(row.compras_count || 0),
        compralineas: Number(row.compralineas_count || 0),
        productos: Number(row.productos_count || 0),
        terceros: Number(row.terceros_count || 0),
        pagos: Number(row.pagos_count || 0),
        cuentasConSaldo: Number(row.cuentas_con_saldo_count || 0),
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Error al obtener estadísticas del sistema',
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const auth = await requireAuth(req, { adminOnly: true, permissions: ['maintenance'] });
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, message: 'Cuerpo de solicitud inválido.' },
      { status: 400 }
    );
  }

  const {
    action,
    resetStock,
    newStockValue,
    resetBalances = false,
    newBalanceValue = 0,
    confirmPhrase,
  } = body ?? {};

  if (String(confirmPhrase || '').trim().toUpperCase() !== 'REINICIAR') {
    return NextResponse.json(
      { success: false, message: 'Frase de confirmación inválida. Escribe REINICIAR para continuar.' },
      { status: 400 }
    );
  }

  // action can be: 'reset_ventas' | 'reset_compras' | 'reset_ambos' | 'reset_all'
  if (
    typeof action !== 'string' ||
    !['reset_ventas', 'reset_compras', 'reset_ambos', 'reset_all'].includes(action)
  ) {
    return NextResponse.json(
      { success: false, message: 'Acción no válida solicitada.' },
      { status: 400 }
    );
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (action === 'reset_ventas') {
      const compraPagosRes = await client.query(
        `SELECT COUNT(*)::int AS cnt
         FROM t_pago
         WHERE compra_id IS NOT NULL
            OR id IN (SELECT pago_id FROM t_pago_documento WHERE compra_id IS NOT NULL)`
      );
      if (Number(compraPagosRes.rows[0]?.cnt ?? 0) > 0) {
        throw new AccountingError(
          409,
          'No se puede vaciar solo ventas porque existen pagos de compras que se borrarían en cascada. Usa "Vaciar Ventas y Compras" o limpia las compras primero.'
        );
      }
    }

    if (action === 'reset_compras') {
      const ventaPagosRes = await client.query(
        `SELECT COUNT(*)::int AS cnt
         FROM t_pago
         WHERE pedido_id IS NOT NULL
            OR id IN (SELECT pago_id FROM t_pago_documento WHERE pedido_id IS NOT NULL)`
      );
      if (Number(ventaPagosRes.rows[0]?.cnt ?? 0) > 0) {
        throw new AccountingError(
          409,
          'No se puede vaciar solo compras porque existen pagos de ventas que se borrarían en cascada. Usa "Vaciar Ventas y Compras" o limpia las ventas primero.'
        );
      }
    }

    const bankPaymentsRes = await client.query(
      `SELECT COUNT(*)::int AS cnt
       FROM t_pago
       WHERE estado = 'APROBADO' AND cuenta_bancaria_id IS NOT NULL`
    );
    if (Number(bankPaymentsRes.rows[0]?.cnt ?? 0) > 0 && !resetBalances) {
      throw new AccountingError(
        409,
        'Existen pagos aprobados vinculados a cuentas bancarias. Activa "Reestablecer saldos bancarios" para evitar descuadres en m_cuentabancaria.'
      );
    }

    const executedActions: string[] = [];

    // 1. Borrar Ventas y reiniciar secuencias
    if (action === 'reset_ventas' || action === 'reset_ambos' || action === 'reset_all') {
      await client.query('TRUNCATE TABLE t_pedidolinea, t_pedido RESTART IDENTITY CASCADE');
      executedActions.push('Se eliminaron todos los pedidos de venta y sus renglones. Secuencia t_pedido_id_seq reiniciada a 1.');
    }

    // 2. Borrar Compras y reiniciar secuencias
    if (action === 'reset_compras' || action === 'reset_ambos' || action === 'reset_all') {
      await client.query('TRUNCATE TABLE t_compralinea, t_compra RESTART IDENTITY CASCADE');
      executedActions.push('Se eliminaron todas las facturas de compra y sus renglones. Secuencia t_compra_id_seq reiniciada a 1.');
    }

    // 3. Opcional: Reestablecer stock de productos
    if (resetStock) {
      const stockVal =
        typeof newStockValue === 'number' && !isNaN(newStockValue) ? newStockValue : 0;
      await client.query('UPDATE m_producto SET stock_actual = $1', [stockVal]);
      executedActions.push(`Se actualizó el stock actual de todos los productos a ${stockVal}.`);
    }

    // 4. Opcional: Reestablecer saldos de cuentas bancarias y cajas
    if (resetBalances) {
      const balanceVal =
        typeof newBalanceValue === 'number' && Number.isFinite(newBalanceValue)
          ? newBalanceValue
          : 0;
      await client.query('UPDATE m_cuentabancaria SET saldo_actual = $1', [balanceVal]);
      executedActions.push(
        `Se actualizó el saldo de todas las cuentas bancarias y cajas a ${balanceVal}.`
      );
    }

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      message: 'Operación de mantenimiento completada exitosamente.',
      executedActions,
    });
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    if (error instanceof AccountingError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }
    console.error('Error en mantenimiento de base de datos:', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Error al ejecutar el mantenimiento en la base de datos',
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

