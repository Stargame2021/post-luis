import type { Producto } from '@/types';
import { round3 } from '@/lib/pos-calculations';

export interface ParsedScannerQuery {
  quantity: number;
  term: string;
  hasMultiplier: boolean;
}

type ProductWithOptionalCodes = Producto & {
  codigo_barras?: string | null;
  sku?: string | null;
};

/**
 * Normaliza texto eliminando diacríticos y espacios laterales para búsqueda rápida en caja.
 */
export function normalizePosText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Parsea entradas del buscador/escáner soportando multiplicador `N*término` (ej. `5*arroz`, `3*10`).
 * Si el formato no corresponde a un multiplicador positivo válido, devuelve `quantity = 1` y el término íntegro.
 */
export function parseScannerQuery(raw: string): ParsedScannerQuery {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d{1,4})\*(.*)$/);
  if (!match) {
    return { quantity: 1, term: trimmed, hasMultiplier: false };
  }

  const parsedQty = Number(match[1]);
  if (!Number.isInteger(parsedQty) || parsedQty <= 0) {
    return { quantity: 1, term: trimmed, hasMultiplier: false };
  }

  return {
    quantity: parsedQty,
    term: match[2].trim(),
    hasMultiplier: true,
  };
}

/**
 * Filtra productos activos por nombre (sin acentos), ID, o campos opcionales `codigo_barras`/`sku`,
 * y opcionalmente restringe a favoritos.
 */
export function filterPosProducts(
  products: readonly Producto[],
  rawTerm: string,
  options?: { onlyFavorites?: boolean; favoriteIds?: ReadonlySet<number> }
): Producto[] {
  const { term } = parseScannerQuery(rawTerm);
  const norm = normalizePosText(term);

  return products.filter((p) => {
    if (!p.activo) return false;
    if (options?.onlyFavorites && options.favoriteIds && !options.favoriteIds.has(p.id)) {
      return false;
    }
    if (!norm) return true;

    const ext = p as ProductWithOptionalCodes;
    const idStr = String(p.id);
    const nameNorm = normalizePosText(p.nombre || '');
    const barcodeNorm = ext.codigo_barras ? normalizePosText(ext.codigo_barras) : '';
    const skuNorm = ext.sku ? normalizePosText(ext.sku) : '';

    return (
      idStr === norm ||
      idStr.includes(norm) ||
      nameNorm.includes(norm) ||
      (barcodeNorm !== '' && barcodeNorm.includes(norm)) ||
      (skuNorm !== '' && skuNorm.includes(norm))
    );
  });
}

/**
 * Resuelve una coincidencia exacta para escáner USB o Enter rápido:
 * 1) `codigo_barras` o `sku` exacto
 * 2) `id` exacto
 * 3) `nombre` exacto (sin acentos)
 * 4) Único resultado filtrado
 */
export function resolveExactProductMatch(
  filteredProducts: readonly Producto[],
  rawTerm: string
): Producto | null {
  const { term } = parseScannerQuery(rawTerm);
  const norm = normalizePosText(term);
  if (!norm) return null;

  for (const p of filteredProducts) {
    const ext = p as ProductWithOptionalCodes;
    if (ext.codigo_barras && normalizePosText(ext.codigo_barras) === norm) return p;
    if (ext.sku && normalizePosText(ext.sku) === norm) return p;
  }

  const byId = filteredProducts.find((p) => String(p.id) === norm);
  if (byId) return byId;

  const byName = filteredProducts.find((p) => normalizePosText(p.nombre || '') === norm);
  if (byName) return byName;

  if (filteredProducts.length === 1) return filteredProducts[0];
  return null;
}

/**
 * Calcula las unidades disponibles reales de una presentación descontando las unidades base ya en carrito.
 */
export function getAvailablePresentationQty(params: {
  stockActual: number;
  cartBaseUnits: number;
  presentationFactor: number;
  permitirStockNegativo: boolean;
}): { remainingBase: number; availablePresQty: number; canAdd: boolean } {
  const safeStock = Number(params.stockActual) || 0;
  const safeCart = Number(params.cartBaseUnits) || 0;
  const safeFactor = params.presentationFactor > 0 ? params.presentationFactor : 1;
  const remainingBase = Math.max(0, round3(safeStock - safeCart));
  const availablePresQty = Math.floor(remainingBase / safeFactor);
  const canAdd = params.permitirStockNegativo || availablePresQty >= 1;

  return { remainingBase, availablePresQty, canAdd };
}
