import { describe, expect, it } from 'vitest';
import {
  calculateDualChange,
  calculateLineAmounts,
  calculateOrderTotals,
  round2,
  round3,
} from '@/lib/pos-calculations';
import {
  applyAddToCart,
  applyChangeItemPresentation,
  calculateCartTotals,
  syncCartWithProducts,
  type CartItem,
} from '@/hooks/usePosCart';
import type { Producto } from '@/types';

const PRODUCTO_CON_CAJA: Producto = {
  id: 10,
  nombre: 'Refresco 2L',
  unidad_base: 'Botella',
  precio_usd: 1.33,
  stock_actual: 12,
  costo_promedio_usd: 0.9,
  impuesto_id: 1,
  impuesto_porcentaje: 16,
  activo: true,
  presentaciones: [
    { id: 101, nombre: 'Pack x6', factor: 6, precio_usd: 7.5 },
  ],
};

const PRODUCTO_EXENTO: Producto = {
  id: 11,
  nombre: 'Harina 1kg',
  unidad_base: 'Paquete',
  precio_usd: 1.17,
  stock_actual: 20,
  costo_promedio_usd: 0.8,
  impuesto_id: 2,
  impuesto_porcentaje: 0,
  activo: true,
  presentaciones: [],
};

describe('Task 1 · Cálculos compartidos POS (pos-calculations.ts)', () => {
  it('round2 y round3 redondean de forma estable y evitan -0', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(-0)).toBe(0);
    expect(round2(Number.NaN)).toBe(0);
    expect(round3(1.2345)).toBe(1.235);
  });

  it('calculateCartTotals (front) y calculateOrderTotals (back) coinciden al centavo en decimales complejos', () => {
    const cart: CartItem[] = [
      {
        id: '10-base',
        producto: PRODUCTO_CON_CAJA,
        presentacion_id: null,
        presentacion_nombre: 'Botella',
        factor: 1,
        precio_unitario_usd: 1.33,
        cantidad: 3,
      },
      {
        id: '11-base',
        producto: PRODUCTO_EXENTO,
        presentacion_id: null,
        presentacion_nombre: 'Paquete',
        factor: 1,
        precio_unitario_usd: 1.17,
        cantidad: 3,
      },
    ];

    const rate = 53.7845;
    const frontTotals = calculateCartTotals(cart, rate);
    const backTotals = calculateOrderTotals(
      [
        { precioUnitarioUsd: 1.33, cantidad: 3, porcentajeImpuesto: 16 },
        { precioUnitarioUsd: 1.17, cantidad: 3, porcentajeImpuesto: 0 },
      ],
      rate
    );

    const line1 = calculateLineAmounts(1.33, 3, 16);
    expect(line1.subtotalUsd).toBe(3.99);
    expect(line1.montoImpuestoUsd).toBe(0.64);
    expect(frontTotals).toEqual(backTotals);
    expect(frontTotals.baseGravadaUsd).toBe(3.99);
    expect(frontTotals.baseExentaUsd).toBe(3.51);
    expect(frontTotals.baseImponibleUsd).toBe(7.5);
    expect(frontTotals.montoImpuestoUsd).toBe(0.64);
    expect(frontTotals.totalUsd).toBe(8.14);
    expect(frontTotals.totalLocal).toBe(round2(8.14 * rate));
  });

  it('calculateDualChange calcula vuelto y faltante simultáneo en USD y Bs.', () => {
    const paidUsd = calculateDualChange({
      totalUsd: 10,
      totalLocal: 500,
      rateValue: 50,
      receivedAmount: 20,
      currency: 'USD',
    });
    expect(paidUsd.isShort).toBe(false);
    expect(paidUsd.changeUsd).toBe(10);
    expect(paidUsd.changeLocal).toBe(500);

    const shortVes = calculateDualChange({
      totalUsd: 10,
      totalLocal: 500,
      rateValue: 50,
      receivedAmount: 400,
      currency: 'VES',
    });
    expect(shortVes.isShort).toBe(true);
    expect(shortVes.shortLocal).toBe(100);
    expect(shortVes.shortUsd).toBe(2);
  });
});

describe('Task 1 · Integridad del carrito (usePosCart.ts)', () => {
  it('P0-4 & P2-8: changeItemPresentation fusiona sin doble conteo de stock y preserva la posición original', () => {
    // Stock = 12 botellas. Carrito: [Pack x6 (1 = 6u), Harina (1), Botella (1 = 1u)]
    // Al cambiar Botella (índice 2) -> Pack x6, el total fusionado es 2 Pack x6 = 12u (EXACTAMENTE el stock).
    // Con el bug antiguo (doble conteo) sumaba 6 + 12 = 18 > 12 y fallaba erróneamente.
    let state: CartItem[] = [];
    state = applyAddToCart(state, PRODUCTO_CON_CAJA, 101, false, 1).nextCart;
    state = applyAddToCart(state, PRODUCTO_EXENTO, null, false, 1).nextCart;
    state = applyAddToCart(state, PRODUCTO_CON_CAJA, null, false, 1).nextCart;

    const merged = applyChangeItemPresentation(state, '10-base', 101, false);
    expect(merged.notification).toBeNull();
    expect(merged.nextCart).toHaveLength(2);
    // La línea editada estaba al final (después de Harina); conserva su posición relativa
    expect(merged.nextCart[0].id).toBe('11-base');
    expect(merged.nextCart[1].id).toBe('10-101');
    expect(merged.nextCart[1].cantidad).toBe(2);
  });

  it('P0-4: múltiples escaneos secuenciales en el mismo tick respetan el stock límite', () => {
    const limited: Producto = { ...PRODUCTO_EXENTO, stock_actual: 2 };
    let state: CartItem[] = [];

    const r1 = applyAddToCart(state, limited, null, false, 1);
    state = r1.nextCart;
    const r2 = applyAddToCart(state, limited, null, false, 1);
    state = r2.nextCart;
    const r3 = applyAddToCart(state, limited, null, false, 1);
    state = r3.nextCart;

    expect(r1.notification).toBeNull();
    expect(r2.notification).toBeNull();
    expect(r3.notification?.type).toBe('error');
    expect(state[0].cantidad).toBe(2);
  });

  it('syncCartWithProducts actualiza precio y stock frescos sin perder cantidades', () => {
    const initial = applyAddToCart([], PRODUCTO_EXENTO, null, false, 3).nextCart;
    const updatedCatalog: Producto[] = [
      { ...PRODUCTO_EXENTO, precio_usd: 1.5, stock_actual: 8 },
    ];

    const synced = syncCartWithProducts(initial, updatedCatalog);
    expect(synced[0].cantidad).toBe(3);
    expect(synced[0].precio_unitario_usd).toBe(1.5);
    expect(synced[0].producto.stock_actual).toBe(8);
  });
});
