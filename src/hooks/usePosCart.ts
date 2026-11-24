import { useCallback, useMemo, useState } from 'react';
import { Producto } from '@/types';
import { getOpcionUnidad } from '@/lib/unidades';

export interface CartItem {
  id: string; // `${producto.id}-${presentacion_id ?? 'base'}`
  producto: Producto;
  presentacion_id: number | null;
  presentacion_nombre: string;
  factor: number;
  precio_unitario_usd: number;
  cantidad: number;
}

export interface CartTotals {
  baseImponibleUsd: number;
  baseExentaUsd: number;
  baseGravadaUsd: number;
  montoImpuestoUsd: number;
  totalUsd: number;
  totalLocal: number;
}

/**
 * Calcula bases exenta/gravada, IVA y totales en USD y VES para las líneas del carrito.
 */
export function calculateCartTotals(cart: CartItem[], rateValue: number): CartTotals {
  let baseImponibleUsd = 0;
  let baseExentaUsd = 0;
  let baseGravadaUsd = 0;
  let montoImpuestoUsd = 0;

  for (const item of cart) {
    const itemSubtotal = item.precio_unitario_usd * item.cantidad;
    const rawTax = item.producto.impuesto_porcentaje;
    const taxPercent = rawTax !== undefined && rawTax !== null ? Number(rawTax) : 16.0;
    const itemTax = (itemSubtotal * taxPercent) / 100;

    baseImponibleUsd += itemSubtotal;
    if (taxPercent === 0) {
      baseExentaUsd += itemSubtotal;
    } else {
      baseGravadaUsd += itemSubtotal;
    }
    montoImpuestoUsd += itemTax;
  }

  const totalUsd = baseImponibleUsd + montoImpuestoUsd;
  const totalLocal = rateValue > 0 ? totalUsd * rateValue : 0;

  return {
    baseImponibleUsd,
    baseExentaUsd,
    baseGravadaUsd,
    montoImpuestoUsd,
    totalUsd,
    totalLocal,
  };
}

export function makeCartLineId(productId: number, presId: number | null): string {
  return `${productId}-${presId ?? 'base'}`;
}

export function usePosCart(params: {
  permitirStockNegativo: boolean;
  rateValue: number;
  onNotify: (notification: { type: 'success' | 'error'; text: string }) => void;
}) {
  const { permitirStockNegativo, rateValue, onNotify } = params;
  const [cart, setCart] = useState<CartItem[]>([]);

  const getCartBaseUnits = useCallback(
    (productId: number, excludeLineId?: string): number => {
      return cart
        .filter((c) => c.producto.id === productId && c.id !== excludeLineId)
        .reduce((sum, c) => sum + c.cantidad * c.factor, 0);
    },
    [cart]
  );

  const addToCart = useCallback(
    (product: Producto, presId: number | null) => {
      const opcion = getOpcionUnidad(product, presId);
      const lineId = makeCartLineId(product.id, opcion.id);

      const stockTotal = Number(product.stock_actual) || 0;
      const currentBaseUnits = getCartBaseUnits(product.id);
      const neededBaseUnits = opcion.factor;

      if (!permitirStockNegativo && currentBaseUnits + neededBaseUnits > stockTotal) {
        const disponible = Math.max(0, stockTotal - currentBaseUnits);
        onNotify({
          type: 'error',
          text: `Stock insuficiente para "${product.nombre}". Disponible: ${disponible} ${product.unidad_base || 'unidades'} base.`,
        });
        return;
      }

      setCart((prev) => {
        const idx = prev.findIndex((item) => item.id === lineId);
        if (idx !== -1) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], cantidad: copy[idx].cantidad + 1 };
          return copy;
        }
        return [
          ...prev,
          {
            id: lineId,
            producto: product,
            presentacion_id: opcion.id,
            presentacion_nombre: opcion.nombre,
            factor: opcion.factor,
            precio_unitario_usd: opcion.precio_usd,
            cantidad: 1,
          },
        ];
      });
    },
    [getCartBaseUnits, onNotify, permitirStockNegativo]
  );

  const updateQuantity = useCallback(
    (lineId: string, delta: number) => {
      const item = cart.find((c) => c.id === lineId);
      if (!item) return;

      if (delta > 0 && !permitirStockNegativo) {
        const stockTotal = Number(item.producto.stock_actual) || 0;
        const currentBaseOther = getCartBaseUnits(item.producto.id, lineId);
        const newTotalBase = currentBaseOther + (item.cantidad + delta) * item.factor;
        if (newTotalBase > stockTotal) {
          onNotify({
            type: 'error',
            text: `No hay más stock disponible para "${item.producto.nombre}" en ${item.presentacion_nombre}.`,
          });
          return;
        }
      }

      setCart((prev) =>
        prev
          .map((c) => {
            if (c.id === lineId) {
              const nextQty = c.cantidad + delta;
              return nextQty > 0 ? { ...c, cantidad: nextQty } : null;
            }
            return c;
          })
          .filter(Boolean) as CartItem[]
      );
    },
    [cart, getCartBaseUnits, onNotify, permitirStockNegativo]
  );

  const setDirectQuantity = useCallback(
    (lineId: string, rawQty: number) => {
      const item = cart.find((c) => c.id === lineId);
      if (!item) return;

      let targetQty = Math.max(0, Math.floor(rawQty));

      if (!permitirStockNegativo) {
        const stockTotal = Number(item.producto.stock_actual) || 0;
        const currentBaseOther = getCartBaseUnits(item.producto.id, lineId);
        const maxQty = Math.floor(Math.max(0, stockTotal - currentBaseOther) / item.factor);
        if (targetQty > maxQty) {
          targetQty = maxQty;
          onNotify({
            type: 'error',
            text: `Máximo disponible para "${item.producto.nombre}" (${item.presentacion_nombre}): ${maxQty}.`,
          });
        }
      }

      setCart((prev) => {
        if (targetQty <= 0) {
          return prev.filter((c) => c.id !== lineId);
        }
        return prev.map((c) => (c.id === lineId ? { ...c, cantidad: targetQty } : c));
      });
    },
    [cart, getCartBaseUnits, onNotify, permitirStockNegativo]
  );

  const setProductLineQuantity = useCallback(
    (product: Producto, presId: number | null, rawQty: number) => {
      const opcion = getOpcionUnidad(product, presId);
      const lineId = makeCartLineId(product.id, opcion.id);
      let targetQty = Math.max(0, Math.floor(rawQty));

      if (!permitirStockNegativo && targetQty > 0) {
        const stockTotal = Number(product.stock_actual) || 0;
        const otherBase = getCartBaseUnits(product.id, lineId);
        const maxQty = Math.floor(Math.max(0, stockTotal - otherBase) / opcion.factor);
        if (targetQty > maxQty) {
          targetQty = maxQty;
          onNotify({
            type: 'error',
            text: `Máximo disponible para "${product.nombre}" (${opcion.nombre}): ${maxQty}.`,
          });
        }
      }

      setCart((prev) => {
        if (targetQty <= 0) {
          return prev.filter((c) => c.id !== lineId);
        }
        const exists = prev.some((c) => c.id === lineId);
        if (exists) {
          return prev.map((c) => (c.id === lineId ? { ...c, cantidad: targetQty } : c));
        }
        return [
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
        ];
      });
    },
    [getCartBaseUnits, onNotify, permitirStockNegativo]
  );

  const changeItemPresentation = useCallback(
    (lineId: string, newPresId: number | null) => {
      const item = cart.find((c) => c.id === lineId);
      if (!item) return;

      const nuevaOpcion = getOpcionUnidad(item.producto, newPresId);
      const newLineId = makeCartLineId(item.producto.id, nuevaOpcion.id);

      const existing = cart.find((c) => c.id === newLineId && c.id !== lineId);
      const mergedQty = (existing ? existing.cantidad : 0) + item.cantidad;

      if (!permitirStockNegativo) {
        const stockTotal = Number(item.producto.stock_actual) || 0;
        const otherBase = getCartBaseUnits(item.producto.id, lineId);
        const neededBase = mergedQty * nuevaOpcion.factor;
        if (otherBase + neededBase > stockTotal) {
          onNotify({
            type: 'error',
            text: `Stock insuficiente para cambiar a ${nuevaOpcion.nombre}.`,
          });
          return;
        }
      }

      setCart((prev) => {
        const filtered = prev.filter((c) => c.id !== lineId && c.id !== newLineId);
        return [
          ...filtered,
          {
            id: newLineId,
            producto: item.producto,
            presentacion_id: nuevaOpcion.id,
            presentacion_nombre: nuevaOpcion.nombre,
            factor: nuevaOpcion.factor,
            precio_unitario_usd: nuevaOpcion.precio_usd,
            cantidad: mergedQty,
          },
        ];
      });
    },
    [cart, getCartBaseUnits, onNotify, permitirStockNegativo]
  );

  const removeFromCart = useCallback((lineId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== lineId));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
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
  };
}
