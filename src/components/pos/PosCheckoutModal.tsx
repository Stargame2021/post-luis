'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CondicionPago, CuentaBancaria, Tercero, TipoPago } from '@/types';
import type { CartItem, CartTotals } from '@/hooks/usePosCart';
import { calculateDualChange, round2 } from '@/lib/pos-calculations';
import Dialog from '@/components/ui/Dialog';
import PosNumberInput from '@/components/PosNumberInput';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Loader2,
  Receipt,
} from 'lucide-react';

export interface QuickTenderOption {
  label: string;
  amount: number;
}

/**
 * Genera botones rápidos (Quick Tender) adaptados a la moneda y al monto por cobrar.
 */
export function getQuickTenderOptions(
  currency: 'USD' | 'VES',
  requiredAmount: number
): QuickTenderOption[] {
  const safeReq = Math.max(0, round2(requiredAmount));
  if (safeReq <= 0) return [];

  const options: QuickTenderOption[] = [{ label: 'Exacto', amount: safeReq }];
  const seen = new Set<number>([safeReq]);

  if (currency === 'USD') {
    const bills = [5, 10, 20, 50, 100];
    for (const bill of bills) {
      if (bill > safeReq && !seen.has(bill)) {
        seen.add(bill);
        options.push({ label: `$${bill}`, amount: bill });
      }
    }
    const nextTen = Math.ceil(safeReq / 10) * 10;
    if (nextTen > safeReq && !seen.has(nextTen) && options.length < 5) {
      seen.add(nextTen);
      options.push({ label: `$${nextTen}`, amount: nextTen });
    }
  } else {
    const step = safeReq < 500 ? 100 : safeReq < 2000 ? 500 : 1000;
    const candidates = [
      Math.ceil(safeReq / step) * step,
      Math.ceil(safeReq / step) * step + step,
      Math.ceil(safeReq / (step * 2)) * (step * 2) + step * 2,
    ];
    for (const c of candidates) {
      const rounded = round2(c);
      if (rounded > safeReq && !seen.has(rounded)) {
        seen.add(rounded);
        options.push({
          label: `${rounded.toLocaleString('es-VE', { maximumFractionDigits: 0 })} Bs`,
          amount: rounded,
        });
      }
    }
  }

  return options.slice(0, 5);
}

const CONDICION_OPTIONS: { value: CondicionPago; label: string }[] = [
  { value: 'CONTADO', label: 'Contado' },
  { value: 'CREDITO_7', label: 'Créd. 7d' },
  { value: 'CREDITO_15', label: 'Créd. 15d' },
  { value: 'CREDITO_30', label: 'Créd. 30d' },
  { value: 'CREDITO_45', label: 'Créd. 45d' },
];

interface PosCheckoutModalProps {
  open: boolean;
  onClose: () => void;
  onAfterClose?: () => void;
  cart: readonly CartItem[];
  totals: CartTotals;
  rateValue: number;
  selectedClient: Tercero | null;
  condicionPago: CondicionPago;
  onSelectCondicionPago: (cond: CondicionPago) => void;
  fechaVencimiento: string;
  onFechaVencimientoChange: (date: string) => void;
  registrarPago: boolean;
  onRegistrarPagoChange: (next: boolean) => void;
  tiposPago: readonly TipoPago[];
  selectedTipoPagoId: number | null;
  onSelectTipoPago: (tpId: number) => void;
  cuentasCompatibles: readonly CuentaBancaria[];
  effectiveCuentaBancariaId: number | null;
  onSelectCuentaBancaria: (id: number | null) => void;
  referenciaPago: string;
  onReferenciaPagoChange: (val: string) => void;
  montoAbono: string;
  onMontoAbonoChange: (val: string) => void;
  montoRecibido: string;
  onMontoRecibidoChange: (val: string) => void;
  checkoutError: string | null;
  loading: boolean;
  onConfirmOrder: () => void;
  isDarkMode?: boolean;
}

export default function PosCheckoutModal({
  open,
  onClose,
  onAfterClose,
  cart,
  totals,
  rateValue,
  selectedClient,
  condicionPago,
  onSelectCondicionPago,
  fechaVencimiento,
  onFechaVencimientoChange,
  registrarPago,
  onRegistrarPagoChange,
  tiposPago,
  selectedTipoPagoId,
  onSelectTipoPago,
  cuentasCompatibles,
  effectiveCuentaBancariaId,
  onSelectCuentaBancaria,
  referenciaPago,
  onReferenciaPagoChange,
  montoAbono,
  onMontoAbonoChange,
  montoRecibido,
  onMontoRecibidoChange,
  checkoutError,
  loading,
  onConfirmOrder,
  isDarkMode = false,
}: PosCheckoutModalProps) {
  const [showItemsDetail, setShowItemsDetail] = useState(false);
  const receivedInputRef = useRef<HTMLInputElement | null>(null);
  const refInputRef = useRef<HTMLInputElement | null>(null);
  const abonoInputRef = useRef<HTMLInputElement | null>(null);

  const selectedTp = useMemo(
    () => tiposPago.find((t) => t.id === selectedTipoPagoId) ?? null,
    [tiposPago, selectedTipoPagoId]
  );

  const isContado = condicionPago === 'CONTADO';
  const isEfectivo = Boolean(selectedTp?.codigo?.startsWith('EFECTIVO'));
  const currency: 'USD' | 'VES' = selectedTp?.moneda === 'VES' ? 'VES' : 'USD';
  const requiredAmount = currency === 'VES' ? totals.totalLocal : totals.totalUsd;
  const receivedNum = parseFloat(montoRecibido) || 0;
  const abonoNum = parseFloat(montoAbono) || 0;

  const dualChange = useMemo(() => {
    if (!registrarPago || !isEfectivo || !isContado || receivedNum <= 0) {
      return null;
    }
    return calculateDualChange({
      totalUsd: totals.totalUsd,
      totalLocal: totals.totalLocal,
      rateValue,
      receivedAmount: receivedNum,
      currency,
    });
  }, [registrarPago, isEfectivo, isContado, receivedNum, totals.totalUsd, totals.totalLocal, rateValue, currency]);

  const quickTenderOptions = useMemo(
    () => (isEfectivo && isContado ? getQuickTenderOptions(currency, requiredAmount) : []),
    [isEfectivo, isContado, currency, requiredAmount]
  );

  // Enfocar automáticamente el campo clave al abrir o cambiar método de pago
  useEffect(() => {
    if (!open || !registrarPago) return;
    const raf = window.requestAnimationFrame(() => {
      if (!isContado) {
        abonoInputRef.current?.focus();
      } else if (selectedTp?.requiere_referencia) {
        refInputRef.current?.focus();
      } else if (isEfectivo) {
        receivedInputRef.current?.focus();
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [open, registrarPago, selectedTipoPagoId, isContado, isEfectivo, selectedTp?.requiere_referencia]);

  // Atajos 1–6 para elegir método de pago rápido cuando no se está escribiendo en un input
  useEffect(() => {
    if (!open || !registrarPago) return;
    const handleKeys = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;

      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < Math.min(6, tiposPago.length)) {
        e.preventDefault();
        onSelectTipoPago(tiposPago[idx].id);
      }
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [open, registrarPago, tiposPago, onSelectTipoPago]);

  const isCashShort = Boolean(dualChange?.isShort);
  const creditPendingUsd = !isContado
    ? round2(
        Math.max(
          0,
          totals.totalUsd -
            (registrarPago && abonoNum > 0
              ? currency === 'VES' && rateValue > 0
                ? abonoNum / rateValue
                : abonoNum
              : 0)
        )
      )
    : 0;

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!loading) onClose();
      }}
      onAfterClose={onAfterClose}
      closeOnBackdrop={!loading}
      closeOnEscape={!loading}
      titleId="pos-checkout-modal-title"
      maxWidthClass="max-w-4xl"
      showCloseButton={!loading}
      isDarkMode={isDarkMode}
    >
      <div className="p-4 sm:p-5 space-y-4">
        {/* Header compacto */}
        <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                isDarkMode ? 'bg-emerald-950/60 text-emerald-400' : 'bg-[#F0FDF4] text-[#15803D]'
              }`}
            >
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 id="pos-checkout-modal-title" className="text-base font-bold leading-tight">
                Confirmar y Cobrar Venta
              </h3>
              <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                {selectedClient
                  ? `${selectedClient.identificacion} — ${selectedClient.razon_social_nombre}`
                  : 'Cliente Genérico'}
              </p>
            </div>
          </div>

          <div
            className={`px-2.5 py-1 rounded-lg border font-mono text-xs font-bold tabular-nums ${
              isDarkMode
                ? 'bg-sky-950/50 border-sky-800 text-sky-300'
                : 'bg-[#F0F9FF] border-[#BAE6FD] text-[#0369A1]'
            }`}
          >
            BCV: {rateValue.toLocaleString('es-VE', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} Bs/$
          </div>
        </div>

        {/* Split Layout 2 Columnas (62% Operativa / 38% Resumen Financiero y Cierre) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
          {/* COLUMNA IZQUIERDA (7 cols): Operativa de Cobro */}
          <div className="md:col-span-7 space-y-3.5">
            {/* Condición de Pago (Pills) */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Condición de Pago
              </span>
              <div className="flex flex-wrap gap-1.5">
                {CONDICION_OPTIONS.map((opt) => {
                  const active = condicionPago === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={loading}
                      onClick={() => onSelectCondicionPago(opt.value)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition ${
                        active
                          ? 'bg-[#0369A1] border-[#0369A1] text-white'
                          : isDarkMode
                          ? 'bg-slate-950 border-slate-700 text-slate-300 hover:bg-slate-800'
                          : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Opciones de Crédito */}
            {!isContado && (
              <div
                className={`p-3 rounded-xl border space-y-2.5 ${
                  isDarkMode
                    ? 'bg-amber-950/20 border-amber-800/60'
                    : 'bg-amber-50/70 border-amber-200'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={registrarPago}
                      disabled={loading}
                      onChange={(e) => onRegistrarPagoChange(e.target.checked)}
                      className="rounded border-slate-300 text-[#0369A1] focus:ring-[#0284C7]"
                    />
                    <span>Registrar abono inicial en caja ahora</span>
                  </label>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      Vence:
                    </span>
                    <input
                      type="date"
                      value={fechaVencimiento}
                      disabled={loading}
                      onChange={(e) => onFechaVencimientoChange(e.target.value)}
                      className={`px-2 py-1 rounded-lg border text-xs font-mono ${
                        isDarkMode
                          ? 'bg-slate-900 border-slate-700 text-white'
                          : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Grid de Métodos de Pago (1–6) */}
            {registrarPago && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Método de Pago
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">Teclas 1–6</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {tiposPago.map((tp, idx) => {
                      const active = tp.id === selectedTipoPagoId;
                      return (
                        <button
                          key={tp.id}
                          type="button"
                          disabled={loading}
                          onClick={() => onSelectTipoPago(tp.id)}
                          className={`p-2 rounded-xl border text-left transition flex flex-col gap-0.5 ${
                            active
                              ? tp.moneda === 'VES'
                                ? 'bg-[#F0F9FF] border-[#0369A1] text-[#0369A1] dark:bg-sky-950/60 dark:border-sky-500 dark:text-sky-200 ring-1 ring-[#0369A1]'
                                : 'bg-[#F0FDF4] border-[#15803D] text-[#15803D] dark:bg-emerald-950/60 dark:border-emerald-500 dark:text-emerald-200 ring-1 ring-[#15803D]'
                              : isDarkMode
                              ? 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'
                              : 'bg-white border-slate-200 text-slate-700 hover:border-slate-400'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] font-mono font-bold opacity-70">
                              {idx < 6 ? `[${idx + 1}]` : ''} {tp.moneda}
                            </span>
                            {tp.requiere_referencia && (
                              <span className="text-[9px] uppercase font-bold opacity-70">Ref</span>
                            )}
                          </div>
                          <span className="text-xs font-bold leading-tight line-clamp-1">
                            {tp.nombre}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Cuenta / Caja Receptora + Referencia o Abono */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold mb-1 text-slate-600 dark:text-slate-300">
                      Caja / Cuenta Receptora ({currency})
                    </label>
                    <select
                      value={effectiveCuentaBancariaId ?? ''}
                      disabled={loading}
                      onChange={(e) =>
                        onSelectCuentaBancaria(e.target.value ? Number(e.target.value) : null)
                      }
                      className={`w-full px-2.5 py-2 rounded-xl border text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#0284C7] ${
                        isDarkMode
                          ? 'bg-slate-950 border-slate-700 text-white'
                          : 'bg-slate-50 border-slate-300 text-slate-900'
                      }`}
                    >
                      {cuentasCompatibles.length === 0 ? (
                        <option value="">Sin cuenta compatible ({currency})</option>
                      ) : (
                        cuentasCompatibles.map((cb) => (
                          <option key={cb.id} value={cb.id}>
                            {cb.nombre}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  {!isContado ? (
                    <div>
                      <label className="block text-[11px] font-semibold mb-1 text-slate-600 dark:text-slate-300">
                        Monto Abono Inicial ({currency}) *
                      </label>
                      <PosNumberInput
                        inputRef={abonoInputRef}
                        value={montoAbono}
                        onChange={(val) => onMontoAbonoChange(val > 0 ? String(val) : '')}
                        allowEmptyDisplay
                        decimals={2}
                        disabled={loading}
                        placeholder={`Menor a ${requiredAmount.toFixed(2)}`}
                        className={`w-full px-3 py-2 rounded-xl border text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-[#0284C7] ${
                          isDarkMode
                            ? 'bg-slate-950 border-slate-700 text-white'
                            : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>
                  ) : selectedTp?.requiere_referencia ? (
                    <div>
                      <label className="block text-[11px] font-semibold mb-1 text-slate-600 dark:text-slate-300">
                        N° Referencia / Lote *
                      </label>
                      <input
                        ref={refInputRef}
                        type="text"
                        value={referenciaPago}
                        disabled={loading}
                        onChange={(e) => onReferenciaPagoChange(e.target.value)}
                        placeholder="Últimos 4-8 dígitos..."
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-[#0284C7] ${
                          isDarkMode
                            ? 'bg-slate-950 border-slate-700 text-white'
                            : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[11px] font-semibold mb-1 text-slate-600 dark:text-slate-300">
                        Referencia (opcional)
                      </label>
                      <input
                        type="text"
                        value={referenciaPago}
                        disabled={loading}
                        onChange={(e) => onReferenciaPagoChange(e.target.value)}
                        placeholder="Nota o referencia..."
                        className={`w-full px-3 py-2 rounded-xl border text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#0284C7] ${
                          isDarkMode
                            ? 'bg-slate-950 border-slate-700 text-white'
                            : 'bg-white border-slate-300 text-slate-900'
                        }`}
                      />
                    </div>
                  )}
                </div>

                {/* Referencia adicional cuando es crédito con abono y método requiere referencia */}
                {!isContado && selectedTp?.requiere_referencia && (
                  <div>
                    <label className="block text-[11px] font-semibold mb-1 text-slate-600 dark:text-slate-300">
                      N° Referencia del Abono *
                    </label>
                    <input
                      ref={refInputRef}
                      type="text"
                      value={referenciaPago}
                      disabled={loading}
                      onChange={(e) => onReferenciaPagoChange(e.target.value)}
                      placeholder="Últimos 4-8 dígitos..."
                      className={`w-full px-3 py-2 rounded-xl border text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-[#0284C7] ${
                        isDarkMode
                          ? 'bg-slate-950 border-slate-700 text-white'
                          : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                )}

                {/* Panel de Efectivo + Quick Tender (Contado) */}
                {isContado && isEfectivo && (
                  <div
                    className={`p-3 rounded-xl border space-y-2 ${
                      isDarkMode
                        ? 'bg-slate-950/60 border-slate-800'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                        Efectivo Recibido ({currency}) · Vacío = Exacto
                      </label>
                      {receivedNum > 0 && (
                        <button
                          type="button"
                          onClick={() => onMontoRecibidoChange('')}
                          className="text-[11px] text-[#0369A1] dark:text-sky-400 font-semibold hover:underline"
                        >
                          Limpiar
                        </button>
                      )}
                    </div>

                    <PosNumberInput
                      inputRef={receivedInputRef}
                      value={montoRecibido}
                      onChange={(val) => onMontoRecibidoChange(val > 0 ? String(val) : '')}
                      allowEmptyDisplay
                      decimals={2}
                      disabled={loading}
                      placeholder={`Exacto (${requiredAmount.toFixed(2)} ${currency})`}
                      className={`w-full px-3 py-2 rounded-xl border text-base font-mono font-extrabold tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0284C7] ${
                        isDarkMode
                          ? 'bg-slate-900 border-slate-700 text-white'
                          : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />

                    {quickTenderOptions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {quickTenderOptions.map((opt) => (
                          <button
                            key={opt.label}
                            type="button"
                            disabled={loading}
                            onClick={() => onMontoRecibidoChange(String(opt.amount))}
                            className={`px-2.5 py-1 rounded-full border text-xs font-mono font-bold transition ${
                              isDarkMode
                                ? 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
                                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Detalle colapsable de ítems */}
            <div
              className={`rounded-xl border overflow-hidden ${
                isDarkMode ? 'border-slate-800' : 'border-slate-200'
              }`}
            >
              <button
                type="button"
                onClick={() => setShowItemsDetail((v) => !v)}
                className={`w-full px-3 py-2 text-xs font-semibold flex items-center justify-between ${
                  isDarkMode
                    ? 'bg-slate-950/50 text-slate-300 hover:bg-slate-800/50'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span>Ver detalle de artículos ({cart.length})</span>
                {showItemsDetail ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
              {showItemsDetail && (
                <div className="max-h-32 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 px-3 py-1.5 text-xs">
                  {cart.map((c) => (
                    <div key={c.id} className="py-1 flex items-center justify-between gap-2">
                      <span className="truncate">
                        <strong className="font-mono">{c.cantidad}×</strong> {c.producto.nombre}
                        {c.presentacion_id ? ` (${c.presentacion_nombre})` : ''}
                      </span>
                      <span className="font-mono font-bold tabular-nums shrink-0">
                        ${round2(c.precio_unitario_usd * c.cantidad).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* COLUMNA DERECHA (5 cols): Resumen Financiero y Cierre Fijo */}
          <div
            className={`md:col-span-5 rounded-2xl border p-4 space-y-3 ${
              isDarkMode
                ? 'bg-slate-950/70 border-slate-800'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="space-y-1 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
              <div className="flex justify-between">
                <span>Base Imponible:</span>
                <span>${totals.baseImponibleUsd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>IVA:</span>
                <span>+${totals.montoImpuestoUsd.toFixed(2)}</span>
              </div>
            </div>

            {/* Tarjeta Hero Total USD / Bs */}
            <div
              className={`rounded-xl border overflow-hidden ${
                isDarkMode ? 'border-slate-700' : 'border-slate-300'
              }`}
            >
              <div
                className={`px-3.5 py-2.5 flex items-baseline justify-between ${
                  isDarkMode ? 'bg-emerald-950/50 text-emerald-300' : 'bg-[#F0FDF4] text-[#15803D]'
                }`}
              >
                <span className="text-[11px] font-bold uppercase">Total USD</span>
                <span className="font-mono font-extrabold text-2xl tabular-nums">
                  ${totals.totalUsd.toFixed(2)}
                </span>
              </div>
              <div
                className={`px-3.5 py-2 border-t flex items-baseline justify-between ${
                  isDarkMode
                    ? 'bg-sky-950/50 border-slate-700 text-sky-300'
                    : 'bg-[#F0F9FF] border-[#BAE6FD] text-[#0369A1]'
                }`}
              >
                <span className="text-[11px] font-bold uppercase">Total Bs.</span>
                <span className="font-mono font-extrabold text-lg tabular-nums">
                  {totals.totalLocal.toLocaleString('es-VE', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  Bs
                </span>
              </div>
            </div>

            {/* Estado de Liquidación (Vuelto / Faltante / Crédito) */}
            {!isContado ? (
              <div
                className={`p-3 rounded-xl border text-xs space-y-1 ${
                  isDarkMode
                    ? 'bg-amber-950/30 border-amber-800 text-amber-200'
                    : 'bg-[#FEF3C7] border-[#F59E0B] text-[#92400E]'
                }`}
              >
                <div className="flex justify-between font-bold">
                  <span>Saldo a Crédito:</span>
                  <span className="font-mono tabular-nums">${creditPendingUsd.toFixed(2)}</span>
                </div>
                <p className="text-[11px] opacity-90">
                  Vence el <span className="font-mono font-bold">{fechaVencimiento}</span>
                </p>
              </div>
            ) : dualChange ? (
              dualChange.isShort ? (
                <div
                  className={`p-3 rounded-xl border text-xs space-y-1 ${
                    isDarkMode
                      ? 'bg-rose-950/50 border-rose-700 text-rose-200'
                      : 'bg-[#FEF2F2] border-[#DC2626] text-[#B91C1C]'
                  }`}
                >
                  <div className="flex items-center justify-between font-extrabold">
                    <span>Faltante:</span>
                    <span className="font-mono tabular-nums">
                      ${dualChange.shortUsd.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between font-mono text-[11px] tabular-nums opacity-90">
                    <span>Equivalente Bs.:</span>
                    <span>
                      {dualChange.shortLocal.toLocaleString('es-VE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      Bs
                    </span>
                  </div>
                </div>
              ) : (
                <div
                  className={`p-3 rounded-xl border text-xs space-y-1 ${
                    isDarkMode
                      ? 'bg-emerald-950/50 border-emerald-700 text-emerald-200'
                      : 'bg-[#F0FDF4] border-[#BBF7D0] text-[#15803D]'
                  }`}
                >
                  <div className="flex items-center justify-between font-extrabold text-sm">
                    <span>Vuelto USD:</span>
                    <span className="font-mono tabular-nums">
                      ${dualChange.changeUsd.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between font-mono text-xs font-bold tabular-nums text-[#0369A1] dark:text-sky-300">
                    <span>Vuelto Bs.:</span>
                    <span>
                      {dualChange.changeLocal.toLocaleString('es-VE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      Bs
                    </span>
                  </div>
                </div>
              )
            ) : (
              <div
                className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                  isDarkMode
                    ? 'bg-slate-900 border-slate-800 text-slate-300'
                    : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                <CreditCard className="w-4 h-4 text-[#0369A1] dark:text-sky-400 shrink-0" />
                <span>Cobro exacto por {selectedTp?.nombre || 'método seleccionado'}.</span>
              </div>
            )}

            {/* Error inline persistente sin perder carrito */}
            {checkoutError && (
              <div
                role="alert"
                className={`p-3 rounded-xl border text-xs font-semibold flex items-start gap-2 ${
                  isDarkMode
                    ? 'bg-rose-950/60 border-rose-700 text-rose-200'
                    : 'bg-[#FEF2F2] border-[#DC2626] text-[#B91C1C]'
                }`}
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{checkoutError}</span>
              </div>
            )}

            {/* Botones de Cierre Fijos */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                disabled={loading || isCashShort}
                onClick={onConfirmOrder}
                className="w-full h-11 rounded-xl bg-[#15803D] hover:bg-[#166534] active:bg-[#14532D] text-white font-extrabold text-sm flex items-center justify-center gap-2 transition disabled:opacity-45 disabled:cursor-not-allowed shadow-sm"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Procesando venta...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{checkoutError ? 'Reintentar Cobro' : 'Completar Cobro'}</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-white/20 font-mono text-[11px]">
                      Ctrl+Enter
                    </kbd>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={onClose}
                className={`w-full py-2 rounded-xl border text-xs font-semibold transition disabled:opacity-50 ${
                  isDarkMode
                    ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                Cancelar [Esc]
              </button>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
