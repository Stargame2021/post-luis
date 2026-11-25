'use client';

import { memo, useEffect, useRef, useState } from 'react';
import type { CondicionPago } from '@/types';
import type { CartItem, CartTotals } from '@/hooks/usePosCart';
import { getOpcionesUnidad } from '@/lib/unidades';
import { round2 } from '@/lib/pos-calculations';
import {
  Clock,
  CreditCard,
  Minus,
  Plus,
  ShoppingCart,
  Trash2,
} from 'lucide-react';

/**
 * Parsea el borrador de texto de cantidad en carrito al confirmar (`Enter` o `blur`).
 * Devuelve `null` si está vacío o no es un entero válido >= 0 para permitir restaurar el valor previo.
 */
export function parseCartQuantityDraft(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return null;
  const num = Number(trimmed);
  return Number.isSafeInteger(num) && num >= 0 ? num : null;
}

interface CartQuantityInputProps {
  lineId: string;
  quantity: number;
  onCommit: (lineId: string, nextQty: number) => void;
  isDarkMode: boolean;
}

function CartQuantityInput({
  lineId,
  quantity,
  onCommit,
  isDarkMode,
}: CartQuantityInputProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(quantity));

  const commitDraft = () => {
    const parsed = parseCartQuantityDraft(draft);
    setEditing(false);
    if (parsed !== null && parsed !== quantity) {
      onCommit(lineId, parsed);
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label="Cantidad del artículo"
      value={editing ? draft : String(quantity)}
      onFocus={(e) => {
        setEditing(true);
        setDraft(String(quantity));
        e.currentTarget.select();
      }}
      onChange={(e) => {
        const cleaned = e.target.value.replace(/[^\d]/g, '');
        setDraft(cleaned);
      }}
      onBlur={commitDraft}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitDraft();
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setEditing(false);
          setDraft(String(quantity));
          e.currentTarget.blur();
        }
      }}
      className={`w-11 h-7 text-center font-mono text-xs font-bold tabular-nums rounded-md border focus:outline-none focus:ring-2 focus:ring-[#0284C7] ${
        isDarkMode
          ? 'bg-slate-900 border-slate-700 text-white'
          : 'bg-white border-slate-300 text-slate-900'
      }`}
    />
  );
}

interface PosCartPanelProps {
  cart: readonly CartItem[];
  totals: CartTotals;
  rateValue: number;
  condicionPago: CondicionPago;
  activePaymentLabel: string;
  parkedCount: number;
  isActiveZone: boolean;
  onFocusZone: () => void;
  onUpdateQuantity: (lineId: string, delta: number) => void;
  onSetDirectQuantity: (lineId: string, qty: number) => void;
  onChangePresentation: (lineId: string, presId: number | null) => void;
  onRemoveItem: (lineId: string) => void;
  onRequestClearCart: () => void;
  onOpenParkedOrders: () => void;
  onParkCurrentSale: () => void;
  onOpenCheckout: () => void;
  isDarkMode?: boolean;
}

const PosCartPanel = memo(function PosCartPanel({
  cart,
  totals,
  rateValue,
  condicionPago,
  activePaymentLabel,
  parkedCount,
  isActiveZone,
  onFocusZone,
  onUpdateQuantity,
  onSetDirectQuantity,
  onChangePresentation,
  onRemoveItem,
  onRequestClearCart,
  onOpenParkedOrders,
  onParkCurrentSale,
  onOpenCheckout,
  isDarkMode = false,
}: PosCartPanelProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const safeSelectedIdx = cart.length === 0 ? 0 : Math.min(selectedIdx, cart.length - 1);

  useEffect(() => {
    if (isActiveZone && cart.length > 0) {
      panelRef.current?.focus();
    }
  }, [isActiveZone, cart.length]);

  const totalUnits = cart.reduce((sum, item) => sum + item.cantidad, 0);
  const canCheckout = cart.length > 0 && rateValue > 0;
  const checkoutDisabledReason =
    cart.length === 0
      ? 'Agrega al menos un producto para cobrar'
      : rateValue <= 0
      ? 'Configura la tasa BCV para cobrar'
      : '';

  const handlePanelKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const tag = (e.target as HTMLElement)?.tagName?.toUpperCase();
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (cart.length === 0) return;

    const activeItem = cart[safeSelectedIdx];
    if (!activeItem) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(cart.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(0, i - 1));
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      onUpdateQuantity(activeItem.id, 1);
    } else if (e.key === '-') {
      e.preventDefault();
      onUpdateQuantity(activeItem.id, -1);
    } else if (e.key === 'Delete' && !e.shiftKey) {
      e.preventDefault();
      onRemoveItem(activeItem.id);
    }
  };

  return (
    <div
      ref={panelRef}
      tabIndex={0}
      onFocus={onFocusZone}
      onClick={onFocusZone}
      onKeyDown={handlePanelKeyDown}
      className={`rounded-2xl border flex flex-col h-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-[#0284C7] transition-colors ${
        isActiveZone
          ? isDarkMode
            ? 'bg-slate-900 border-sky-500/70'
            : 'bg-white border-[#0284C7]'
          : isDarkMode
          ? 'bg-slate-900 border-slate-800'
          : 'bg-white border-slate-200'
      }`}
    >
      {/* Cabecera del Ticket */}
      <div
        className={`px-3.5 py-2.5 border-b flex items-center justify-between gap-2 shrink-0 ${
          isDarkMode ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <ShoppingCart className="w-4 h-4 text-[#0369A1] dark:text-sky-400 shrink-0" />
          <span className="font-bold text-xs truncate">
            Ticket ({cart.length} {cart.length === 1 ? 'línea' : 'líneas'} · {totalUnits} u)
          </span>
          <kbd
            className={`hidden sm:inline px-1.5 py-0.5 rounded text-[10px] font-mono ${
              isDarkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-200/80 text-slate-600'
            }`}
          >
            F6
          </kbd>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {cart.length > 0 && (
            <button
              type="button"
              onClick={onParkCurrentSale}
              title="Aparcar esta venta en espera"
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition ${
                isDarkMode
                  ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Clock className="w-3 h-3" />
              <span>Aparcar</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenParkedOrders}
            title="Ver y recuperar ventas en espera (F9)"
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition ${
              parkedCount > 0
                ? 'bg-[#FEF3C7] border-[#F59E0B] text-[#92400E]'
                : isDarkMode
                ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span>Espera</span>
            <span className="font-mono font-bold tabular-nums">({parkedCount})</span>
            <kbd className="text-[10px] font-mono opacity-75">F9</kbd>
          </button>

          {cart.length > 0 && (
            <button
              type="button"
              onClick={onRequestClearCart}
              title="Vaciar carrito (Shift+Supr)"
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-semibold transition ${
                isDarkMode
                  ? 'border-rose-800 text-rose-300 hover:bg-rose-950/60'
                  : 'border-rose-200 text-[#B91C1C] hover:bg-[#FEF2F2]'
              }`}
            >
              <Trash2 className="w-3 h-3" />
              <span className="hidden sm:inline">Vaciar</span>
            </button>
          )}
        </div>
      </div>

      {/* Lista de líneas desplazable */}
      <div
        className={`flex-1 min-h-0 overflow-y-auto divide-y ${
          isDarkMode ? 'divide-slate-800/70' : 'divide-slate-100'
        }`}
      >
        {cart.length === 0 ? (
          <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center p-6 text-slate-400">
            <ShoppingCart className="w-10 h-10 mb-2 opacity-25" />
            <p className="text-sm font-semibold">El ticket está vacío</p>
            <p className="text-xs mt-1">
              Escanea un código con <kbd className="font-mono font-bold">F2</kbd> o haz clic en un producto
            </p>
          </div>
        ) : (
          cart.map((item, idx) => {
            const lineSubtotal = round2(item.precio_unitario_usd * item.cantidad);
            const rawTax = item.producto.impuesto_porcentaje;
            const taxPct = rawTax !== undefined && rawTax !== null ? Number(rawTax) : 16.0;
            const opciones = getOpcionesUnidad(item.producto);
            const isSelected = isActiveZone && idx === safeSelectedIdx;

            return (
              <div
                key={item.id}
                onClick={() => setSelectedIdx(idx)}
                className={`px-3.5 py-2.5 flex flex-col gap-1.5 transition ${
                  isSelected
                    ? isDarkMode
                      ? 'bg-sky-950/40'
                      : 'bg-[#E0F2FE]/70'
                    : isDarkMode
                    ? 'hover:bg-slate-800/40'
                    : 'hover:bg-slate-50/80'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold leading-snug truncate">{item.producto.nombre}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="font-mono tabular-nums">
                        ${item.precio_unitario_usd.toFixed(2)} / {item.presentacion_nombre}
                      </span>
                      {taxPct === 0 ? (
                        <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                          Exento
                        </span>
                      ) : (
                        <span className="text-[10px]">+{taxPct}% IVA</span>
                      )}
                    </div>
                  </div>

                  <span className="font-mono font-extrabold text-sm tabular-nums text-[#15803D] dark:text-emerald-400 shrink-0">
                    ${lineSubtotal.toFixed(2)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  {/* Controles de cantidad sin rebote */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(item.id, -1)}
                      aria-label="Restar 1"
                      className={`w-7 h-7 rounded-md border flex items-center justify-center transition ${
                        isDarkMode
                          ? 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200'
                          : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>

                    <CartQuantityInput
                      lineId={item.id}
                      quantity={item.cantidad}
                      onCommit={onSetDirectQuantity}
                      isDarkMode={isDarkMode}
                    />

                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(item.id, 1)}
                      aria-label="Sumar 1"
                      className={`w-7 h-7 rounded-md border flex items-center justify-center transition ${
                        isDarkMode
                          ? 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200'
                          : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Selector de presentación inline (si aplica) + Quitar */}
                  <div className="flex items-center gap-1.5">
                    {opciones.length > 1 && (
                      <select
                        aria-label="Presentación"
                        value={item.presentacion_id ?? ''}
                        onChange={(e) =>
                          onChangePresentation(
                            item.id,
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                        className={`text-[11px] font-semibold rounded-md border px-1.5 py-1 focus:outline-none focus:ring-2 focus:ring-[#0284C7] ${
                          isDarkMode
                            ? 'bg-slate-800 border-slate-700 text-slate-200'
                            : 'bg-slate-50 border-slate-300 text-slate-700'
                        }`}
                      >
                        {opciones.map((opt) => (
                          <option key={opt.id ?? 'base'} value={opt.id ?? ''}>
                            {opt.nombre} (×{opt.factor})
                          </option>
                        ))}
                      </select>
                    )}

                    <button
                      type="button"
                      onClick={() => onRemoveItem(item.id)}
                      aria-label={`Quitar ${item.producto.nombre}`}
                      className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-[#B91C1C] hover:bg-rose-50 dark:hover:bg-rose-950/50 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Fijo: Desglose + Banda Hero Bimoneda USD/Bs + Pill Pago + CTA Cobrar */}
      <div
        className={`border-t p-3 space-y-2.5 shrink-0 ${
          isDarkMode ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50/90 border-slate-200'
        }`}
      >
        {/* Desglose compacto */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
          <span>Base: ${totals.baseImponibleUsd.toFixed(2)}</span>
          {totals.baseExentaUsd > 0 && <span>Exento: ${totals.baseExentaUsd.toFixed(2)}</span>}
          <span>IVA: ${totals.montoImpuestoUsd.toFixed(2)}</span>
        </div>

        {/* Banda Hero Apilada Bimoneda (WebOpenPOS Invariant) */}
        <div
          className={`rounded-xl border overflow-hidden ${
            isDarkMode ? 'border-slate-700' : 'border-slate-300'
          }`}
        >
          {/* USD en verde */}
          <div
            className={`px-3.5 py-2 flex items-baseline justify-between ${
              isDarkMode ? 'bg-emerald-950/50 text-emerald-300' : 'bg-[#F0FDF4] text-[#15803D]'
            }`}
          >
            <span className="text-[11px] font-bold uppercase tracking-wide">Total USD</span>
            <span className="font-mono font-extrabold text-2xl tabular-nums leading-none">
              ${totals.totalUsd.toFixed(2)}
            </span>
          </div>
          {/* Bs. en azul */}
          <div
            className={`px-3.5 py-1.5 border-t flex items-baseline justify-between ${
              isDarkMode
                ? 'bg-sky-950/50 border-slate-700 text-sky-300'
                : 'bg-[#F0F9FF] border-[#BAE6FD] text-[#0369A1]'
            }`}
          >
            <span className="text-[11px] font-bold uppercase tracking-wide">Total Bs.</span>
            <span className="font-mono font-extrabold text-lg tabular-nums leading-none">
              {totals.totalLocal.toLocaleString('es-VE', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{' '}
              Bs
            </span>
          </div>
        </div>

        {/* Pill Condición / Método activo [F4] */}
        <button
          type="button"
          onClick={onOpenCheckout}
          disabled={!canCheckout}
          className={`w-full px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center justify-between transition disabled:opacity-50 ${
            isDarkMode
              ? 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
              : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
          }`}
        >
          <span className="inline-flex items-center gap-1.5 truncate">
            <CreditCard className="w-3.5 h-3.5 text-[#0369A1] dark:text-sky-400 shrink-0" />
            <span className="truncate">
              {condicionPago === 'CONTADO' ? 'Contado' : condicionPago.replace('_', ' ')} ·{' '}
              {activePaymentLabel}
            </span>
          </span>
          <kbd className="text-[10px] font-mono opacity-70 shrink-0">F4</kbd>
        </button>

        {/* CTA Principal Cobrar [F8] */}
        <button
          type="button"
          disabled={!canCheckout}
          onClick={onOpenCheckout}
          title={checkoutDisabledReason || 'Abrir ventana de cobro (F8)'}
          className="w-full h-11 rounded-xl bg-[#15803D] hover:bg-[#166534] active:bg-[#14532D] text-white font-extrabold text-sm flex items-center justify-center gap-2 transition disabled:opacity-45 disabled:cursor-not-allowed shadow-sm"
        >
          <span>{canCheckout ? 'Cobrar Venta' : checkoutDisabledReason}</span>
          {canCheckout && (
            <kbd className="px-1.5 py-0.5 rounded bg-white/20 font-mono text-xs font-bold">F8</kbd>
          )}
        </button>
      </div>
    </div>
  );
});

export default PosCartPanel;
