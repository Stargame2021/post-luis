import type { PoolClient } from 'pg';

export const VALID_PAYMENT_OPERATIONS = [
  'COBRO_VENTA',
  'PAGO_COMPRA',
  'ABONO_VENTA',
  'ABONO_COMPRA',
] as const;

export type PaymentOperation = (typeof VALID_PAYMENT_OPERATIONS)[number];

export const VALID_CURRENCIES = ['USD', 'VES'] as const;
export type SupportedCurrency = (typeof VALID_CURRENCIES)[number];

export class AccountingError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AccountingError';
    this.status = status;
  }
}

export function calculateWeightedAverageCost(params: {
  stockAnterior: number;
  costoAnterior: number;
  cantidadBaseComprada: number;
  costoUnitarioPresentacion: number;
  factorConversion: number;
}): number {
  const stockPrev = Math.max(0, Number(params.stockAnterior) || 0);
  const costoPrev = Number(params.costoAnterior) || 0;
  const factor = Number(params.factorConversion) > 0 ? Number(params.factorConversion) : 1;
  const cantComprada = Number(params.cantidadBaseComprada);
  const costoCompraBase = Number(params.costoUnitarioPresentacion) / factor;
  const nuevoStockTotal = stockPrev + cantComprada;

  if (stockPrev > 0 && nuevoStockTotal > 0) {
    return Number(
      ((stockPrev * costoPrev + cantComprada * costoCompraBase) / nuevoStockTotal).toFixed(4)
    );
  }

  return Number(costoCompraBase.toFixed(4));
}

export function getPaymentBalanceDelta(tipoOperacion: string, montoOriginal: number): number {
  const amount = Number(montoOriginal);
  if (tipoOperacion.startsWith('COBRO') || tipoOperacion.startsWith('ABONO_VENTA')) {
    return amount;
  }
  return -amount;
}

export function resolveServerUnitPrice(
  productoPrecioUsd: unknown,
  presentacion?: { precio_usd: unknown } | null
): number {
  const rawPrice = presentacion ? presentacion.precio_usd : productoPrecioUsd;
  const price = Number(rawPrice);
  if (!Number.isFinite(price) || price < 0) {
    throw new AccountingError(400, 'El precio configurado para el producto no es válido.');
  }
  return price;
}

export function validateCurrencyMatch(
  expectedCurrency: string,
  actualCurrency: string,
  label: string
): void {
  const expected = String(expectedCurrency || '').trim().toUpperCase();
  const actual = String(actualCurrency || '').trim().toUpperCase();
  if (!expected || !actual || expected !== actual) {
    throw new AccountingError(
      400,
      `${label} está en moneda ${actual || 'desconocida'} y no coincide con la moneda del pago (${expected || 'desconocida'}).`
    );
  }
}

export async function validateBankAccountCurrency(
  client: PoolClient,
  cuentaBancariaId: number,
  expectedCurrency: string
): Promise<{ id: number; moneda: string; saldo_actual: number }> {
  const accountRes = await client.query(
    'SELECT id, moneda, saldo_actual FROM m_cuentabancaria WHERE id = $1 FOR UPDATE',
    [cuentaBancariaId]
  );

  if (accountRes.rows.length === 0) {
    throw new AccountingError(400, 'La cuenta bancaria o caja seleccionada no existe.');
  }

  const row = accountRes.rows[0];
  const accountCurrency = String(row.moneda);
  validateCurrencyMatch(
    expectedCurrency,
    accountCurrency,
    'La cuenta bancaria seleccionada'
  );

  return {
    id: Number(row.id),
    moneda: accountCurrency,
    saldo_actual: Number(row.saldo_actual),
  };
}

export async function voidLinkedDocumentPayments(
  client: PoolClient,
  params: { tipo: 'VENTA' | 'COMPRA'; docId: number; userId: number }
): Promise<{
  voidedCount: number;
  revertedMovements: Array<{ pagoId: number; cuentaBancariaId: number; delta: number }>;
}> {
  const selectSql =
    params.tipo === 'VENTA'
      ? `SELECT id, tipo_operacion, cuenta_bancaria_id, monto_original
         FROM t_pago
         WHERE estado = 'APROBADO'
           AND (pedido_id = $1 OR id IN (SELECT pago_id FROM t_pago_documento WHERE pedido_id = $1))
         FOR UPDATE`
      : `SELECT id, tipo_operacion, cuenta_bancaria_id, monto_original
         FROM t_pago
         WHERE estado = 'APROBADO'
           AND (compra_id = $1 OR id IN (SELECT pago_id FROM t_pago_documento WHERE compra_id = $1))
         FOR UPDATE`;

  const pagosRes = await client.query(selectSql, [params.docId]);
  const otherDocCondition =
    params.tipo === 'VENTA'
      ? `(tipo_documento <> 'VENTA' OR pedido_id IS DISTINCT FROM $2)`
      : `(tipo_documento <> 'COMPRA' OR compra_id IS DISTINCT FROM $2)`;

  const revertedMovements: Array<{ pagoId: number; cuentaBancariaId: number; delta: number }> = [];

  for (const pago of pagosRes.rows) {
    const pagoId = Number(pago.id);
    const sharedCheck = await client.query(
      `SELECT id FROM t_pago_documento WHERE pago_id = $1 AND ${otherDocCondition} LIMIT 1`,
      [pagoId, params.docId]
    );

    if (sharedCheck.rows.length > 0) {
      throw new AccountingError(
        409,
        `Este documento forma parte de un pago compartido (#${pagoId}). Anule primero el pago desde el módulo de Pagos.`
      );
    }

    await client.query(
      `UPDATE t_pago
       SET estado = 'ANULADO', actualizado_en = CURRENT_TIMESTAMP, actualizado_por = $1
       WHERE id = $2`,
      [params.userId, pagoId]
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
      revertedMovements.push({
        pagoId,
        cuentaBancariaId: cuentaId,
        delta: reversalDelta,
      });
    }
  }

  return {
    voidedCount: pagosRes.rows.length,
    revertedMovements,
  };
}
