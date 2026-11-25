import { describe, expect, it } from 'vitest';
import {
  filterPosProducts,
  getAvailablePresentationQty,
  parseScannerQuery,
  resolveExactProductMatch,
} from '@/lib/pos-search';
import type { Producto } from '@/types';

const PRODUCTS: (Producto & { codigo_barras?: string; sku?: string })[] = [
  {
    id: 1,
    nombre: 'Azúcar Refinada 1kg',
    unidad_base: 'Kg',
    precio_usd: 1.5,
    stock_actual: 20,
    costo_promedio_usd: 1,
    impuesto_id: 2,
    impuesto_porcentaje: 0,
    activo: true,
    codigo_barras: '7591234567890',
  },
  {
    id: 2,
    nombre: 'Café Molido Gourmet 500g',
    unidad_base: 'Paquete',
    precio_usd: 5.5,
    stock_actual: 10,
    costo_promedio_usd: 3.8,
    impuesto_id: 1,
    impuesto_porcentaje: 16,
    activo: true,
    sku: 'CAF-500',
  },
  {
    id: 3,
    nombre: 'Producto Inactivo',
    unidad_base: 'Unidad',
    precio_usd: 2,
    stock_actual: 5,
    costo_promedio_usd: 1,
    impuesto_id: 1,
    impuesto_porcentaje: 16,
    activo: false,
  },
];

describe('Task 5 · Búsqueda POS, escáner N*código y stock real (pos-search.ts)', () => {
  it('parseScannerQuery interpreta multiplicadores N*término y deja intactas búsquedas normales', () => {
    expect(parseScannerQuery('5*azucar')).toEqual({
      quantity: 5,
      term: 'azucar',
      hasMultiplier: true,
    });
    expect(parseScannerQuery('12*7591234567890')).toEqual({
      quantity: 12,
      term: '7591234567890',
      hasMultiplier: true,
    });
    expect(parseScannerQuery('0*azucar')).toEqual({
      quantity: 1,
      term: '0*azucar',
      hasMultiplier: false,
    });
    expect(parseScannerQuery('cafe molido')).toEqual({
      quantity: 1,
      term: 'cafe molido',
      hasMultiplier: false,
    });
  });

  it('filterPosProducts busca sin acentos, por ID, código de barras/SKU, excluye inactivos y filtra favoritos', () => {
    expect(filterPosProducts(PRODUCTS, 'azucar').map((p) => p.id)).toEqual([1]);
    expect(filterPosProducts(PRODUCTS, 'cafe').map((p) => p.id)).toEqual([2]);
    expect(filterPosProducts(PRODUCTS, '7591234567890').map((p) => p.id)).toEqual([1]);
    expect(filterPosProducts(PRODUCTS, 'caf-500').map((p) => p.id)).toEqual([2]);
    expect(filterPosProducts(PRODUCTS, 'inactivo')).toEqual([]); // inactivo excluido
    expect(
      filterPosProducts(PRODUCTS, '', { onlyFavorites: true, favoriteIds: new Set([2]) }).map(
        (p) => p.id
      )
    ).toEqual([2]);
  });

  it('resolveExactProductMatch prioriza código de barras/SKU, ID exacto, nombre exacto o único resultado', () => {
    const active = filterPosProducts(PRODUCTS, '');
    expect(resolveExactProductMatch(active, '5*7591234567890')?.id).toBe(1);
    expect(resolveExactProductMatch(active, '2')?.id).toBe(2);
    expect(resolveExactProductMatch(active, 'azucar refinada 1kg')?.id).toBe(1);
  });

  it('getAvailablePresentationQty descuenta unidades base ya reservadas en el carrito', () => {
    // 25 unidades en stock, 12 ya reservadas en carrito -> quedan 13 base -> 2 packs de 6
    const res = getAvailablePresentationQty({
      stockActual: 25,
      cartBaseUnits: 12,
      presentationFactor: 6,
      permitirStockNegativo: false,
    });
    expect(res.remainingBase).toBe(13);
    expect(res.availablePresQty).toBe(2);
    expect(res.canAdd).toBe(true);

    // Si quedan 4 base y la presentación es factor 6 -> no alcanza (0 disponibles)
    const insufficient = getAvailablePresentationQty({
      stockActual: 10,
      cartBaseUnits: 6,
      presentationFactor: 6,
      permitirStockNegativo: false,
    });
    expect(insufficient.availablePresQty).toBe(0);
    expect(insufficient.canAdd).toBe(false);

    // Con permitirStockNegativo=true sí permite agregar
    const negAllowed = getAvailablePresentationQty({
      stockActual: 0,
      cartBaseUnits: 0,
      presentationFactor: 6,
      permitirStockNegativo: true,
    });
    expect(negAllowed.canAdd).toBe(true);
  });
});
