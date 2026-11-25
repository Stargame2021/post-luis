/**
 * Módulo puro de cálculos aritméticos para el Punto de Ventas (POS).
 * Compartido entre frontend (`usePosCart.ts`) y backend (`POST /api/pedidos`)
 * para garantizar redondeo idéntico al centavo en USD y moneda local (Bs.).
 */

export interface PosTaxableLine {
  precioUnitarioUsd: number;
  cantidad: number;
  porcentajeImpuesto: number;
}

export interface PosLineAmounts {
  subtotalUsd: number;
  montoImpuestoUsd: number;
  totalLineaUsd: number;
}

export interface PosOrderTotals {
  baseImponibleUsd: number;
  baseExentaUsd: number;
  baseGravadaUsd: number;
  montoImpuestoUsd: number;
  totalUsd: number;
  totalLocal: number;
}

export interface DualChangeInput {
  totalUsd: number;
  totalLocal: number;
  rateValue: number;
  receivedAmount: number;
  currency: 'USD' | 'VES';
}

export interface DualChangeResult {
  requiredAmount: number;
  receivedAmount: number;
  difference: number;
  isShort: boolean;
  changeUsd: number;
  changeLocal: number;
  shortUsd: number;
  shortLocal: number;
}

/**
 * Redondea un número a 2 decimales de forma estable evitando `-0`.
 */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Redondea un número a 3 decimales (para cantidades en unidad base).
 */
export function round3(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round((value + Number.EPSILON) * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Calcula subtotal, impuesto y total en USD para una línea individual con redondeo a 2 decimales.
 */
export function calculateLineAmounts(
  precioUnitarioUsd: number,
  cantidad: number,
  porcentajeImpuesto: number
): PosLineAmounts {
  const safePrice = Number.isFinite(precioUnitarioUsd) ? precioUnitarioUsd : 0;
  const safeQty = Number.isFinite(cantidad) ? cantidad : 0;
  const safeTax = Number.isFinite(porcentajeImpuesto) ? porcentajeImpuesto : 0;

  const subtotalUsd = round2(safePrice * safeQty);
  const montoImpuestoUsd = round2((subtotalUsd * safeTax) / 100);
  const totalLineaUsd = round2(subtotalUsd + montoImpuestoUsd);

  return {
    subtotalUsd,
    montoImpuestoUsd,
    totalLineaUsd,
  };
}

/**
 * Calcula bases exenta/gravada, IVA y totales en USD y moneda local aplicando redondeo por línea.
 */
export function calculateOrderTotals(
  lines: readonly PosTaxableLine[],
  rateValue: number
): PosOrderTotals {
  let baseImponibleUsd = 0;
  let baseExentaUsd = 0;
  let baseGravadaUsd = 0;
  let montoImpuestoUsd = 0;

  for (const line of lines) {
    const safeTax = Number.isFinite(line.porcentajeImpuesto) ? line.porcentajeImpuesto : 0;
    const { subtotalUsd, montoImpuestoUsd: lineTax } = calculateLineAmounts(
      line.precioUnitarioUsd,
      line.cantidad,
      safeTax
    );

    baseImponibleUsd += subtotalUsd;
    if (safeTax === 0) {
      baseExentaUsd += subtotalUsd;
    } else {
      baseGravadaUsd += subtotalUsd;
    }
    montoImpuestoUsd += lineTax;
  }

  baseImponibleUsd = round2(baseImponibleUsd);
  baseExentaUsd = round2(baseExentaUsd);
  baseGravadaUsd = round2(baseGravadaUsd);
  montoImpuestoUsd = round2(montoImpuestoUsd);

  const totalUsd = round2(baseImponibleUsd + montoImpuestoUsd);
  const safeRate = Number.isFinite(rateValue) && rateValue > 0 ? rateValue : 0;
  const totalLocal = safeRate > 0 ? round2(totalUsd * safeRate) : 0;

  return {
    baseImponibleUsd,
    baseExentaUsd,
    baseGravadaUsd,
    montoImpuestoUsd,
    totalUsd,
    totalLocal,
  };
}

/**
 * Calcula el vuelto o faltante simultáneo en USD y Bs. según la moneda en que paga el cliente.
 */
export function calculateDualChange(input: DualChangeInput): DualChangeResult {
  const safeRate = Number.isFinite(input.rateValue) && input.rateValue > 0 ? input.rateValue : 0;
  const requiredAmount = input.currency === 'VES' ? round2(input.totalLocal) : round2(input.totalUsd);
  const receivedAmount = Number.isFinite(input.receivedAmount) && input.receivedAmount > 0
    ? round2(input.receivedAmount)
    : 0;
  const difference = round2(receivedAmount - requiredAmount);
  const isShort = difference < -0.005;

  if (isShort) {
    const missing = round2(Math.abs(difference));
    const shortUsd = input.currency === 'USD' ? missing : (safeRate > 0 ? round2(missing / safeRate) : 0);
    const shortLocal = input.currency === 'VES' ? missing : (safeRate > 0 ? round2(missing * safeRate) : 0);

    return {
      requiredAmount,
      receivedAmount,
      difference,
      isShort: true,
      changeUsd: 0,
      changeLocal: 0,
      shortUsd,
      shortLocal,
    };
  }

  const surplus = Math.max(0, difference);
  const changeUsd = input.currency === 'USD' ? round2(surplus) : (safeRate > 0 ? round2(surplus / safeRate) : 0);
  const changeLocal = input.currency === 'VES' ? round2(surplus) : (safeRate > 0 ? round2(surplus * safeRate) : 0);

  return {
    requiredAmount,
    receivedAmount,
    difference,
    isShort: false,
    changeUsd,
    changeLocal,
    shortUsd: 0,
    shortLocal: 0,
  };
}
