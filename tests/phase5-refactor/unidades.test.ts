import { describe, expect, it } from 'vitest';
import {
  formatStockDesglose,
  formatStockDesgloseCompleto,
  getOpcionUnidad,
  getOpcionesUnidad,
  getSegmentacionExistencias,
  type ProductoConPresentaciones,
} from '@/lib/unidades';

const CERVEZA_PRODUCT: ProductoConPresentaciones = {
  unidad_base: 'Unidad',
  precio_usd: 1.5,
  stock_actual: 293,
  presentaciones: [
    { id: 12, nombre: 'Caja x30', factor: 30, precio_usd: 25 },
    { id: 11, nombre: 'Combo x7', factor: 7, precio_usd: 7 },
    { id: 10, nombre: 'Botella Promo', factor: 1, precio_usd: 1.35 },
  ],
};

describe('Phase 5 · Unidades y presentaciones (src/lib/unidades.ts)', () => {
  it('getOpcionesUnidad ordena ascendente, incluye unidad base (null) y conserva presentaciones factor=1', () => {
    const opciones = getOpcionesUnidad(CERVEZA_PRODUCT);
    expect(opciones).toHaveLength(4);
    expect(opciones[0]).toEqual({
      id: null,
      nombre: 'Unidad',
      factor: 1,
      precio_usd: 1.5,
    });
    expect(opciones[1]).toEqual({
      id: 10,
      nombre: 'Botella Promo',
      factor: 1,
      precio_usd: 1.35,
    });
    expect(opciones[2].factor).toBe(7);
    expect(opciones[3].factor).toBe(30);

    expect(getOpcionUnidad(CERVEZA_PRODUCT, 11).nombre).toBe('Combo x7');
    expect(getOpcionUnidad(CERVEZA_PRODUCT, 999).id).toBeNull();
  });

  it('formatStockDesglose y formatStockDesgloseCompleto desglosan jerárquicamente y manejan stock 0', () => {
    // 293 = 9*30 + 3*7 + 2
    expect(formatStockDesglose(CERVEZA_PRODUCT)).toBe('9 Caja x30 + 23 Unidad');
    expect(formatStockDesgloseCompleto(CERVEZA_PRODUCT)).toBe(
      '9 Caja x30 + 3 Combo x7 + 2 Unidad'
    );
    expect(formatStockDesglose(CERVEZA_PRODUCT, 0)).toBe('0 Unidad');
    expect(formatStockDesgloseCompleto(CERVEZA_PRODUCT, 0)).toBe('0 Unidad');

    const decimalProd: ProductoConPresentaciones = {
      unidad_base: 'Kg',
      precio_usd: 4,
      stock_actual: 2.5,
      presentaciones: [],
    };
    expect(formatStockDesgloseCompleto(decimalProd)).toBe('2.5 Kg');
  });

  it('getSegmentacionExistencias calcula equivalencias y valor potencial por medida', () => {
    const segs = getSegmentacionExistencias(CERVEZA_PRODUCT, 65);
    const caja = segs.find((s) => s.id === 12);
    const base = segs.find((s) => s.id === null);
    const promo = segs.find((s) => s.id === 10);

    expect(caja).toEqual({
      id: 12,
      nombre: 'Caja x30',
      factor: 30,
      precio_usd: 25,
      precio_unitario_equivalente: Number((25 / 30).toFixed(4)),
      unidades_completas: 2,
      resto_unidades: 5,
      total_base: 65,
      valor_potencial_usd: Number((2 * 25 + 5 * 1.5).toFixed(2)),
    });

    expect(base?.unidades_completas).toBe(65);
    expect(base?.resto_unidades).toBe(0);
    expect(promo?.unidades_completas).toBe(65);
    expect(promo?.factor).toBe(1);
  });
});
