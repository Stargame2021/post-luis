import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Producto } from '@/types';
import { getOpcionUnidad } from '@/lib/unidades';
import { calculateOrderTotals, round3, type PosOrderTotals } from '@/lib/pos-calculations';

export interface CartItem {
  id: string; // `${producto.id}-${presentacion_id ?? 'base'}`
  producto: Producto;
  presentacion_id: number | null;
  presentacion_nombre: string;
  factor: number;
  precio_unitario_usd: number;
  cantidad: number;
}

export type CartTotals = PosOrderTotals;

export interface CartNotification {
  type: 'success' | 'error';
  text: string;
}

export interface CartTransitionResult {
  nextCart: CartItem[];
  notification: CartNotification | null;
}

/**
 * Genera el identificador único de línea en el carrito para un producto y presentación.
 */
export function makeCartLineId(productId: number, presId: number | null): string {
  return `${productId}-${presId ?? 'base'}`;
}

/**
 * Calcula las unidades base acumuladas en el carrito para un producto,
 * permitiendo excluir uno o más `lineId`.
 */
export function getBaseUnitsInCart(
  cart: readonly CartItem[],
  productId: number,
  excludeLineIds?: string | readonly string[]
): number {
  const excluded =
    typeof excludeLineIds === 'string'
      ? new Set([excludeLineIds])
      : Array.isArray(excludeLineIds)
      ? new Set(excludeLineIds)
      : null;

  return round3(
    cart
      .filter((c) => c.producto.id === productId && (!excluded || !excluded.has(c.id)))
      .reduce((sum, c) => sum + c.cantidad * c.factor, 0)
  );
}

/**
 * Calcula bases exenta/gravada, IVA y totales en USD y VES usando la aritmética compartida con backend.
 */
export function calculateCartTotals(cart: readonly CartItem[], rateValue: number): CartTotals {
  const lines = cart.map((item) => {
    const rawTax = item.producto.impuesto_porcentaje;
    const taxPercent = rawTax !== undefined && rawTax !== null ? Number(rawTax) : 16.0;
    return {
      precioUnitarioUsd: item.precio_unitario_usd,
      cantidad: item.cantidad,
      porcentajeImpuesto: taxPercent,
    };
  });

  return calculateOrderTotals(lines, rateValue);
}

/**
 * Transición pura: agrega `qty` unidades de un producto/presentación validando stock disponible.
 */
export function applyAddToCart(
  prev: readonly CartItem[],
  product: Producto,
  presId: number | null,
  permitirStockNegativo: boolean,
  qty = 1
): CartTransitionResult {
  const safeQty = Math.max(1, Math.floor(qty));
  const opcion = getOpcionUnidad(product, presId);
  const lineId = makeCartLineId(product.id, opcion.id);

  const stockTotal = Number(product.stock_actual) || 0;
  const currentBaseUnits = getBaseUnitsInCart(prev, product.id);
  const neededBaseUnits = round3(opcion.factor * safeQty);

  if (!permitirStockNegativo && round3(currentBaseUnits + neededBaseUnits) > stockTotal) {
    const disponible = Math.max(0, round3(stockTotal - currentBaseUnits));
    return {
      nextCart: [...prev],
      notification: {
        type: 'error',
        text: `Stock insuficiente para "${product.nombre}". Disponible: ${disponible} ${product.unidad_base || 'unidades'} base.`,
      },
    };
  }

  const idx = prev.findIndex((item) => item.id === lineId);
  if (idx !== -1) {
    const copy = [...prev];
    copy[idx] = {
      ...copy[idx],
      producto: product,
      presentacion_nombre: opcion.nombre,
      factor: opcion.factor,
      precio_unitario_usd: opcion.precio_usd,
      cantidad: copy[idx].cantidad + safeQty,
    };
    return { nextCart: copy, notification: null };
  }

  return {
    nextCart: [
      ...prev,
      {
        id: lineId,
        producto: product,
        presentacion_id: opcion.id,
        presentacion_nombre: opcion.nombre,
        factor: opcion.factor,
        precio_unitario_usd: opcion.precio_usd,
        cantidad: safeQty,
      },
    ],
    notification: null,
  };
}

/**
 * Transición pura: incrementa o decrementa la cantidad de una línea existente validando stock.
 */
export function applyUpdateQuantity(
  prev: readonly CartItem[],
  lineId: string,
  delta: number,
  permitirStockNegativo: boolean
): CartTransitionResult {
  const item = prev.find((c) => c.id === lineId);
  if (!item) return { nextCart: [...prev], notification: null };

  if (delta > 0 && !permitirStockNegativo) {
    const stockTotal = Number(item.producto.stock_actual) || 0;
    const currentBaseOther = getBaseUnitsInCart(prev, item.producto.id, lineId);
    const newTotalBase = round3(currentBaseOther + (item.cantidad + delta) * item.factor);
    if (newTotalBase > stockTotal) {
      return {
        nextCart: [...prev],
        notification: {
          type: 'error',
          text: `No hay más stock disponible para "${item.producto.nombre}" en ${item.presentacion_nombre}.`,
        },
      };
    }
  }

  const nextCart = prev
    .map((c) => {
      if (c.id === lineId) {
        const nextQty = c.cantidad + delta;
        return nextQty > 0 ? { ...c, cantidad: nextQty } : null;
      }
      return c;
    })
    .filter(Boolean) as CartItem[];

  return { nextCart, notification: null };
}

/**
 * Transición pura: establece directamente la cantidad de una línea existente.
 */
export function applySetDirectQuantity(
  prev: readonly CartItem[],
  lineId: string,
  rawQty: number,
  permitirStockNegativo: boolean
): CartTransitionResult {
  const item = prev.find((c) => c.id === lineId);
  if (!item) return { nextCart: [...prev], notification: null };

  let targetQty = Math.max(0, Math.floor(rawQty));
  let notification: CartNotification | null = null;

  if (!permitirStockNegativo && targetQty > 0) {
    const stockTotal = Number(item.producto.stock_actual) || 0;
    const currentBaseOther = getBaseUnitsInCart(prev, item.producto.id, lineId);
    const maxQty = Math.floor(Math.max(0, round3(stockTotal - currentBaseOther)) / item.factor);
    if (targetQty > maxQty) {
      targetQty = maxQty;
      notification = {
        type: 'error',
        text: `Máximo disponible para "${item.producto.nombre}" (${item.presentacion_nombre}): ${maxQty}.`,
      };
    }
  }

  if (targetQty <= 0) {
    return { nextCart: prev.filter((c) => c.id !== lineId), notification };
  }

  return {
    nextCart: prev.map((c) => (c.id === lineId ? { ...c, cantidad: targetQty } : c)),
    notification,
  };
}

/**
 * Transición pura: establece la cantidad exacta de un producto/presentación (creando o eliminando la línea).
 */
export function applySetProductLineQuantity(
  prev: readonly CartItem[],
  product: Producto,
  presId: number | null,
  rawQty: number,
  permitirStockNegativo: boolean
): CartTransitionResult {
  const opcion = getOpcionUnidad(product, presId);
  const lineId = makeCartLineId(product.id, opcion.id);
  let targetQty = Math.max(0, Math.floor(rawQty));
  let notification: CartNotification | null = null;

  if (!permitirStockNegativo && targetQty > 0) {
    const stockTotal = Number(product.stock_actual) || 0;
    const otherBase = getBaseUnitsInCart(prev, product.id, lineId);
    const maxQty = Math.floor(Math.max(0, round3(stockTotal - otherBase)) / opcion.factor);
    if (targetQty > maxQty) {
      targetQty = maxQty;
      notification = {
        type: 'error',
        text: `Máximo disponible para "${product.nombre}" (${opcion.nombre}): ${maxQty}.`,
      };
    }
  }

  if (targetQty <= 0) {
    return { nextCart: prev.filter((c) => c.id !== lineId), notification };
  }

  const exists = prev.some((c) => c.id === lineId);
  if (exists) {
    return {
      nextCart: prev.map((c) =>
        c.id === lineId
          ? {
              ...c,
              producto: product,
              presentacion_nombre: opcion.nombre,
              factor: opcion.factor,
              precio_unitario_usd: opcion.precio_usd,
              cantidad: targetQty,
            }
          : c
      ),
      notification,
    };
  }

  return {
    nextCart: [
      ...prev,
      {
        id: lineId,
        producto: product,
        presentacion_id: opcion.id,
        presentacion_nombre: opcion.nombre,
        factor: opcion.factor,
        precio_unitario_usd: opcion.precio_usd,
        cantidad: targetQty,
      },
    ],
    notification,
  };
}

/**
 * Transición pura: cambia la presentación de una línea sin doble conteo de stock al fusionar
 * y preservando la posición original de la línea en el carrito.
 */
export function applyChangeItemPresentation(
  prev: readonly CartItem[],
  lineId: string,
  newPresId: number | null,
  permitirStockNegativo: boolean
): CartTransitionResult {
  const itemIdx = prev.findIndex((c) => c.id === lineId);
  if (itemIdx === -1) return { nextCart: [...prev], notification: null };

  const item = prev[itemIdx];
  const nuevaOpcion = getOpcionUnidad(item.producto, newPresId);
  const newLineId = makeCartLineId(item.producto.id, nuevaOpcion.id);

  if (newLineId === lineId) {
    return { nextCart: [...prev], notification: null };
  }

  const existing = prev.find((c) => c.id === newLineId && c.id !== lineId);
  const mergedQty = (existing ? existing.cantidad : 0) + item.cantidad;

  if (!permitirStockNegativo) {
    const stockTotal = Number(item.producto.stock_actual) || 0;
    // Excluir tanto `lineId` como `newLineId` evita duplicar las unidades de `existing`
    const otherBase = getBaseUnitsInCart(prev, item.producto.id, [lineId, newLineId]);
    const neededBase = round3(mergedQty * nuevaOpcion.factor);
    if (round3(otherBase + neededBase) > stockTotal) {
      return {
        nextCart: [...prev],
        notification: {
          type: 'error',
          text: `Stock insuficiente para cambiar a ${nuevaOpcion.nombre}.`,
        },
      };
    }
  }

  const updatedItem: CartItem = {
    id: newLineId,
    producto: item.producto,
    presentacion_id: nuevaOpcion.id,
    presentacion_nombre: nuevaOpcion.nombre,
    factor: nuevaOpcion.factor,
    precio_unitario_usd: nuevaOpcion.precio_usd,
    cantidad: mergedQty,
  };

  // Preservar la posición original de la línea editada y eliminar la línea fusionada si existía aparte
  const nextCart: CartItem[] = [];
  for (let i = 0; i < prev.length; i++) {
    const current = prev[i];
    if (i === itemIdx) {
      nextCart.push(updatedItem);
    } else if (current.id !== newLineId) {
      nextCart.push(current);
    }
  }

  return { nextCart, notification: null };
}

/**
 * Sincroniza las líneas del carrito con el catálogo fresco de productos (precio, stock, IVA y presentaciones).
 */
export function syncCartWithProducts(
  prev: readonly CartItem[],
  products: readonly Producto[]
): CartItem[] {
  if (prev.length === 0 || products.length === 0) return prev as CartItem[];

  const productMap = new Map<number, Producto>();
  for (const p of products) {
    productMap.set(p.id, p);
  }

  let changed = false;
  const nextCart = prev.map((item) => {
    const fresh = productMap.get(item.producto.id);
    if (!fresh) return item;

    const opcion = getOpcionUnidad(fresh, item.presentacion_id);
    const sameRef =
      item.producto === fresh &&
      item.precio_unitario_usd === opcion.precio_usd &&
      item.factor === opcion.factor &&
      item.presentacion_nombre === opcion.nombre;

    if (sameRef) return item;

    changed = true;
    return {
      ...item,
      producto: fresh,
      presentacion_nombre: opcion.nombre,
      factor: opcion.factor,
      precio_unitario_usd: opcion.precio_usd,
    };
  });

  return changed ? nextCart : (prev as CartItem[]);
}

const ACTIVE_CART_STORAGE_KEY = 'pos_active_cart_v1';

function loadStoredActiveCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch {
    return [];
  }
}

function saveStoredActiveCart(items: readonly CartItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (items.length === 0) {
      window.sessionStorage.removeItem(ACTIVE_CART_STORAGE_KEY);
    } else {
      window.sessionStorage.setItem(ACTIVE_CART_STORAGE_KEY, JSON.stringify(items));
    }
  } catch {
    // ignore storage quota errors
  }
}

export function usePosCart(params: {
  permitirStockNegativo: boolean;
  rateValue: number;
  products?: readonly Producto[];
  onNotify: (notification: CartNotification) => void;
}) {
  const { permitirStockNegativo, rateValue, products, onNotify } = params;
  const [cart, setCart] = useState<CartItem[]>(() => loadStoredActiveCart());
  const cartRef = useRef<CartItem[]>(cart);

  // Persistir el carrito temporal en sessionStorage para no perderlo al cambiar de pestaña (P1-7)
  useEffect(() => {
    saveStoredActiveCart(cart);
  }, [cart]);

  // Mantener la referencia síncrona actualizada y reconciliar cambios del catálogo
  useEffect(() => {
    if (!products || products.length === 0) return;
    const synced = syncCartWithProducts(cartRef.current, products);
    if (synced !== cartRef.current) {
      cartRef.current = synced;
      setCart(synced);
    }
  }, [products]);

  const commitTransition = useCallback(
    (result: CartTransitionResult) => {
      cartRef.current = result.nextCart;
      setCart(result.nextCart);
      if (result.notification) {
        onNotify(result.notification);
      }
    },
    [onNotify]
  );

  const getCartBaseUnits = useCallback(
    (productId: number, excludeLineId?: string): number => {
      return getBaseUnitsInCart(cart, productId, excludeLineId);
    },
    [cart]
  );

  const addToCart = useCallback(
    (product: Producto, presId: number | null, qty = 1) => {
      const result = applyAddToCart(cartRef.current, product, presId, permitirStockNegativo, qty);
      commitTransition(result);
    },
    [commitTransition, permitirStockNegativo]
  );

  const updateQuantity = useCallback(
    (lineId: string, delta: number) => {
      const result = applyUpdateQuantity(cartRef.current, lineId, delta, permitirStockNegativo);
      commitTransition(result);
    },
    [commitTransition, permitirStockNegativo]
  );

  const setDirectQuantity = useCallback(
    (lineId: string, rawQty: number) => {
      const result = applySetDirectQuantity(cartRef.current, lineId, rawQty, permitirStockNegativo);
      commitTransition(result);
    },
    [commitTransition, permitirStockNegativo]
  );

  const setProductLineQuantity = useCallback(
    (product: Producto, presId: number | null, rawQty: number) => {
      const result = applySetProductLineQuantity(
        cartRef.current,
        product,
        presId,
        rawQty,
        permitirStockNegativo
      );
      commitTransition(result);
    },
    [commitTransition, permitirStockNegativo]
  );

  const changeItemPresentation = useCallback(
    (lineId: string, newPresId: number | null) => {
      const result = applyChangeItemPresentation(
        cartRef.current,
        lineId,
        newPresId,
        permitirStockNegativo
      );
      commitTransition(result);
    },
    [commitTransition, permitirStockNegativo]
  );

  const removeFromCart = useCallback((lineId: string) => {
    const nextCart = cartRef.current.filter((item) => item.id !== lineId);
    cartRef.current = nextCart;
    setCart(nextCart);
  }, []);

  const clearCart = useCallback(() => {
    cartRef.current = [];
    setCart([]);
  }, []);

  const replaceCart = useCallback((nextCart: CartItem[]) => {
    cartRef.current = nextCart;
    setCart(nextCart);
  }, []);

  const totals = useMemo(() => calculateCartTotals(cart, rateValue), [cart, rateValue]);

  return {
    cart,
    totals,
    makeLineId: makeCartLineId,
    getCartBaseUnits,
    addToCart,
    updateQuantity,
    setDirectQuantity,
    setProductLineQuantity,
    changeItemPresentation,
    removeFromCart,
    clearCart,
    replaceCart,
  };
}
