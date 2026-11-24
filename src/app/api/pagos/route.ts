import { NextResponse } from 'next/server';
import { getPool, query, ensureAuthTables } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';
import {
  AccountingError,
  VALID_CURRENCIES,
  VALID_PAYMENT_OPERATIONS,
  getPaymentBalanceDelta,
  validateBankAccountCurrency,
  validateCurrencyMatch,
} from '@/lib/accounting';

// GET: Consultar pagos (con filtros por pedido_id, compra_id o tercero_id)
export async function GET(req: Request) {
  const auth = await requireAuth(req, { permissions: ['pagos', 'orders', 'compras'] });
  if (!auth.ok) return auth.response;

  try {
    await ensureAuthTables();
    const { searchParams } = new URL(req.url);
    const pedidoId = searchParams.get('pedido_id');
    const compraId = searchParams.get('compra_id');
    const terceroId = searchParams.get('tercero_id');

    let sql = `
      SELECT p.id, p.tipo_operacion, p.pedido_id, p.compra_id, p.tercero_id,
             p.tipo_pago_id, p.cuenta_bancaria_id, p.fecha_pago,
             p.moneda, p.monto_original, p.tasa_cambio, p.monto_equivalente_usd,
             p.referencia, p.nota, p.estado, p.creado_en, p.creado_por,
             p.actualizado_en, p.actualizado_por,
             tp.nombre as tipo_pago_nombre,
             cb.nombre as cuenta_bancaria_nombre,
             b.nombre as banco_nombre,
             b.tipo as banco_tipo,
             u.nombre_completo as creado_por_nombre,
             t.razon_social_nombre as tercero_nombre,
             t.identificacion as tercero_identificacion
      FROM t_pago p
      JOIN m_tipopago tp ON tp.id = p.tipo_pago_id
      LEFT JOIN m_tercero t ON t.id = p.tercero_id
      LEFT JOIN m_cuentabancaria cb ON cb.id = p.cuenta_bancaria_id
      LEFT JOIN m_banco b ON b.id = cb.banco_id
      LEFT JOIN m_usuario u ON u.id = p.creado_por
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (pedidoId) {
      params.push(Number(pedidoId));
      sql += ` AND (p.pedido_id = $${params.length} OR p.id IN (SELECT pago_id FROM t_pago_documento WHERE pedido_id = $${params.length}))`;
    }
    if (compraId) {
      params.push(Number(compraId));
      sql += ` AND (p.compra_id = $${params.length} OR p.id IN (SELECT pago_id FROM t_pago_documento WHERE compra_id = $${params.length}))`;
    }
    if (terceroId) {
      params.push(Number(terceroId));
      sql += ` AND p.tercero_id = $${params.length}`;
    }

    sql += ' ORDER BY p.fecha_pago DESC, p.id DESC';

    const pagos = await query(sql, params);

    // Cargar los documentos imputados para cada pago
    if (pagos.length > 0) {
      const pagoIds = pagos.map((p) => Number(p.id));
      const docsRes = await query(
        `SELECT pd.id, pd.pago_id, pd.tipo_documento, pd.pedido_id, pd.compra_id,
                pd.monto_imputado_original, pd.monto_imputado_usd, pd.creado_en,
                COALESCE(c.numero_factura, CONCAT('PED-#', pd.pedido_id)) as numero_factura
         FROM t_pago_documento pd
         LEFT JOIN t_compra c ON c.id = pd.compra_id
         WHERE pd.pago_id = ANY($1::int[])`,
        [pagoIds]
      );

      const docsByPago = new Map<number, Record<string, unknown>[]>();
      for (const d of docsRes) {
        const key = Number(d.pago_id);
        if (!docsByPago.has(key)) docsByPago.set(key, []);
        docsByPago.get(key)!.push(d);
      }

      for (const p of pagos) {
        p.documentos = docsByPago.get(Number(p.id)) || [];
      }
    }

    return NextResponse.json({ success: true, pagos });
  } catch (error: unknown) {
    console.error('Error fetching pagos:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Error al consultar pagos',
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
}

// POST: Registrar un nuevo pago (abono o cobro independiente)
export async function POST(req: Request) {
  const auth = await requireAuth(req, { permissions: ['pagos'] });
  if (!auth.ok) return auth.response;

  try {
    await ensureAuthTables();
    const body = await req.json();
    const {
      tipo_operacion,
      pedido_id,
      compra_id,
      tercero_id,
      tipo_pago_id,
      cuenta_bancaria_id,
      moneda,
      monto_original,
      tasa_cambio,
      monto_equivalente_usd,
      referencia,
      nota,
      imputaciones, // Array<{ tipo_documento: 'VENTA' | 'COMPRA', pedido_id?: number, compra_id?: number, monto_imputado_original: number, monto_imputado_usd: number }>
    } = body;

    if (!tipo_operacion || !tipo_pago_id || !monto_original || !moneda) {
      return NextResponse.json(
        { success: false, message: 'Datos incompletos para registrar el pago' },
        { status: 400 }
      );
    }

    const opNormalized = String(tipo_operacion).trim();
    if (!VALID_PAYMENT_OPERATIONS.includes(opNormalized as (typeof VALID_PAYMENT_OPERATIONS)[number])) {
      return NextResponse.json(
        { success: false, message: 'Tipo de operación de pago no válido' },
        { status: 400 }
      );
    }

    const monedaNormalized = String(moneda).trim().toUpperCase();
    if (!VALID_CURRENCIES.includes(monedaNormalized as (typeof VALID_CURRENCIES)[number])) {
      return NextResponse.json(
        { success: false, message: 'Moneda no válida. Use USD o VES' },
        { status: 400 }
      );
    }

    const montoOrig = Number(monto_original);
    if (!Number.isFinite(montoOrig) || montoOrig <= 0) {
      return NextResponse.json(
        { success: false, message: 'El monto del pago debe ser mayor a 0' },
        { status: 400 }
      );
    }

    const rate = tasa_cambio === undefined || tasa_cambio === null ? 1 : Number(tasa_cambio);
    if (!Number.isFinite(rate) || rate <= 0) {
      return NextResponse.json(
        { success: false, message: 'La tasa de cambio debe ser mayor a 0' },
        { status: 400 }
      );
    }

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const tpRes = await client.query('SELECT id, moneda FROM m_tipopago WHERE id = $1', [
        Number(tipo_pago_id),
      ]);
      if (tpRes.rows.length === 0) {
        throw new AccountingError(400, 'El método de pago seleccionado no existe.');
      }
      validateCurrencyMatch(
        monedaNormalized,
        String(tpRes.rows[0].moneda),
        'El método de pago seleccionado'
      );

      if (cuenta_bancaria_id) {
        await validateBankAccountCurrency(client, Number(cuenta_bancaria_id), monedaNormalized);
      }

      const montoEqUsd =
        Number(monto_equivalente_usd) > 0
          ? Number(monto_equivalente_usd)
          : monedaNormalized === 'USD'
          ? montoOrig
          : Number((montoOrig / rate).toFixed(2));

      const insertRes = await client.query(
        `INSERT INTO t_pago (
          tipo_operacion, pedido_id, compra_id, tercero_id,
          tipo_pago_id, cuenta_bancaria_id, moneda,
          monto_original, tasa_cambio, monto_equivalente_usd,
          referencia, nota, estado, creado_por
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'APROBADO', $13)
        RETURNING *`,
        [
          opNormalized,
          pedido_id ? Number(pedido_id) : null,
          compra_id ? Number(compra_id) : null,
          tercero_id ? Number(tercero_id) : null,
          Number(tipo_pago_id),
          cuenta_bancaria_id ? Number(cuenta_bancaria_id) : null,
          monedaNormalized,
          montoOrig,
          rate,
          montoEqUsd,
          referencia ? String(referencia).trim() : null,
          nota ? String(nota).trim() : null,
          auth.session.user.id,
        ]
      );

      // Si tiene cuenta bancaria, actualizar saldo (suma si es cobro venta, resta si es pago compra)
      if (cuenta_bancaria_id) {
        const delta = getPaymentBalanceDelta(opNormalized, montoOrig);

        await client.query(
          'UPDATE m_cuentabancaria SET saldo_actual = saldo_actual + $1 WHERE id = $2',
          [delta, Number(cuenta_bancaria_id)]
        );
      }

      // Guardar imputaciones a documentos (facturas/pedidos)
      const pagoCreado = insertRes.rows[0];
      if (Array.isArray(imputaciones) && imputaciones.length > 0) {
        for (const imp of imputaciones) {
          const mOrig = Number(imp.monto_imputado_original);
          const mUsd =
            Number(imp.monto_imputado_usd) > 0
              ? Number(imp.monto_imputado_usd)
              : monedaNormalized === 'USD'
              ? mOrig
              : Number((mOrig / rate).toFixed(2));
          if (mOrig > 0) {
            await client.query(
              `INSERT INTO t_pago_documento (
                pago_id, tipo_documento, pedido_id, compra_id,
                monto_imputado_original, monto_imputado_usd
              ) VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                pagoCreado.id,
                imp.tipo_documento,
                imp.pedido_id ? Number(imp.pedido_id) : null,
                imp.compra_id ? Number(imp.compra_id) : null,
                mOrig,
                mUsd,
              ]
            );
          }
        }
      } else if (pedido_id || compra_id) {
        // Compatibilidad: si se envió directo pedido_id o compra_id
        await client.query(
          `INSERT INTO t_pago_documento (
            pago_id, tipo_documento, pedido_id, compra_id,
            monto_imputado_original, monto_imputado_usd
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            pagoCreado.id,
            compra_id ? 'COMPRA' : 'VENTA',
            pedido_id ? Number(pedido_id) : null,
            compra_id ? Number(compra_id) : null,
            montoOrig,
            montoEqUsd,
          ]
        );
      }

      await client.query('COMMIT');
      return NextResponse.json({ success: true, pago: pagoCreado });
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: unknown) {
    if (error instanceof AccountingError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }
    console.error('Error guardando pago:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Error al registrar el pago',
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
}

// PATCH: Anular un pago y revertir saldo de la cuenta bancaria asociada
export async function PATCH(req: Request) {
  const auth = await requireAuth(req, { permissions: ['pagos'] });
  if (!auth.ok) return auth.response;

  try {
    await ensureAuthTables();
    const body = (await req.json()) as { id?: unknown; estado?: unknown; nota?: unknown };
    const pagoId = Number(body?.id);
    const nuevoEstado = String(body?.estado ?? '').trim().toUpperCase();

    if (!Number.isInteger(pagoId) || pagoId <= 0 || nuevoEstado !== 'ANULADO') {
      return NextResponse.json(
        { success: false, message: 'ID válido y estado "ANULADO" son obligatorios.' },
        { status: 400 }
      );
    }

    const notaTexto =
      typeof body?.nota === 'string' && body.nota.trim().length > 0 ? body.nota.trim() : null;

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const pagoRes = await client.query('SELECT * FROM t_pago WHERE id = $1 FOR UPDATE', [pagoId]);
      if (pagoRes.rows.length === 0) {
        throw new AccountingError(404, 'Pago no encontrado.');
      }

      const pago = pagoRes.rows[0];
      if (String(pago.estado) === 'ANULADO') {
        await client.query('COMMIT');
        return NextResponse.json({
          success: true,
          pago,
          message: `El pago #${pagoId} ya se encontraba anulado.`,
        });
      }

      const updRes = await client.query(
        `UPDATE t_pago
         SET estado = 'ANULADO',
             nota = COALESCE($1, nota),
             actualizado_en = CURRENT_TIMESTAMP,
             actualizado_por = $2
         WHERE id = $3
         RETURNING *`,
        [notaTexto, auth.session.user.id, pagoId]
      );

      if (pago.cuenta_bancaria_id !== null && pago.cuenta_bancaria_id !== undefined) {
        const cuentaId = Number(pago.cuenta_bancaria_id);
        await client.query('SELECT id FROM m_cuentabancaria WHERE id = $1 FOR UPDATE', [cuentaId]);
        const reversalDelta = -getPaymentBalanceDelta(
          String(pago.tipo_operacion),
          Number(pago.monto_original)
        );
        await client.query(
          'UPDATE m_cuentabancaria SET saldo_actual = saldo_actual + $1 WHERE id = $2',
          [reversalDelta, cuentaId]
        );
      }

      await client.query('COMMIT');
      return NextResponse.json({
        success: true,
        pago: updRes.rows[0],
        message: `Pago #${pagoId} anulado y saldo bancario revertido con éxito.`,
      });
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: unknown) {
    if (error instanceof AccountingError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }
    console.error('Error anulando pago:', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Error al anular el pago',
      },
      { status: 500 }
    );
  }
}

