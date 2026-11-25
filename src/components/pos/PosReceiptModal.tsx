'use client';

import { useEffect } from 'react';
import type { CondicionPago } from '@/types';
import Dialog from '@/components/ui/Dialog';
import { CheckCircle2, Printer } from 'lucide-react';

export interface CompletedOrderLine {
  lineId: string;
  nombre: string;
  presentacion_nombre: string;
  cantidad: number;
  precio: number;
  subtotal: number;
  taxPct: number;
}

export interface CompletedOrderReceipt {
  id: number;
  tasa_cambio_aplicada: number | string;
  base_imponible_usd?: number | string;
  monto_impuesto_usd?: number | string;
  total_usd: number | string;
  total_moneda_local: number | string;
  condicion_pago: CondicionPago;
  tipo_pago_nombre: string | null;
  referencia_pago: string | null;
  fecha_vencimiento: string | null;
  cliente_nombre: string;
  cliente_identificacion: string;
  lineas: CompletedOrderLine[];
  vuelto_usd?: number;
  vuelto_local?: number;
  recibido_monto?: number;
  recibido_moneda?: 'USD' | 'VES';
}

interface PosReceiptModalProps {
  order: CompletedOrderReceipt | null;
  storeName: string;
  onClose: () => void;
  onAfterClose?: () => void;
  isDarkMode?: boolean;
}

export default function PosReceiptModal({
  order,
  storeName,
  onClose,
  onAfterClose,
  isDarkMode = false,
}: PosReceiptModalProps) {
  // Atajos post-venta: P imprime ticket 80mm; Enter inicia nueva venta y devuelve foco a F2
  useEffect(() => {
    if (!order) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.toLowerCase() === 'p') {
        e.preventDefault();
        window.print();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [order, onClose]);

  const totalUsd = Number(order?.total_usd || 0);
  const totalLocal = Number(order?.total_moneda_local || 0);
  const baseUsd = Number(order?.base_imponible_usd ?? totalUsd);
  const taxUsd = Number(order?.monto_impuesto_usd || 0);
  const rate = Number(order?.tasa_cambio_aplicada || 0);
  const hasChange = Boolean(order && ((order.vuelto_usd ?? 0) > 0 || (order.vuelto_local ?? 0) > 0));

  return (
    <Dialog
      open={Boolean(order)}
      onClose={onClose}
      onAfterClose={onAfterClose}
      titleId="pos-receipt-modal-title"
      maxWidthClass="max-w-md"
      isDarkMode={isDarkMode}
    >
      {order && (
        <div className="p-5 space-y-4">
          {/* Encabezado de éxito (oculto en impresión) */}
          <div className="flex items-center gap-2.5 print:hidden">
            <div className="w-9 h-9 rounded-xl bg-[#F0FDF4] dark:bg-emerald-950/60 text-[#15803D] dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 id="pos-receipt-modal-title" className="text-base font-bold leading-tight">
                ¡Venta #{order.id} Completada!
              </h3>
              <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Presiona <kbd className="font-mono font-bold">P</kbd> para imprimir o{' '}
                <kbd className="font-mono font-bold">Enter</kbd> para nueva venta
              </p>
            </div>
          </div>

          {/* Área imprimible de ticket térmico 80mm */}
          <div
            className={`pos-thermal-receipt rounded-xl border p-4 space-y-3 text-xs ${
              isDarkMode
                ? 'bg-slate-950 border-slate-800 text-slate-100'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="text-center border-b border-dashed border-slate-300 dark:border-slate-700 pb-2">
              <p className="font-extrabold text-sm uppercase tracking-wide">{storeName}</p>
              <p className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                Nota de Venta #{order.id} · {new Date().toLocaleString('es-VE')}
              </p>
            </div>

            <div className="space-y-0.5 text-[11px]">
              <p>
                <strong>Cliente:</strong> {order.cliente_nombre} ({order.cliente_identificacion})
              </p>
              <p>
                <strong>Condición:</strong> {order.condicion_pago}
                {order.tipo_pago_nombre ? ` · ${order.tipo_pago_nombre}` : ''}
              </p>
              {order.referencia_pago && (
                <p className="font-mono">
                  <strong>Ref:</strong> {order.referencia_pago}
                </p>
              )}
              {order.fecha_vencimiento && (
                <p className="font-mono">
                  <strong>Vencimiento:</strong> {order.fecha_vencimiento}
                </p>
              )}
              <p className="font-mono">
                <strong>Tasa BCV:</strong>{' '}
                {rate.toLocaleString('es-VE', {
                  minimumFractionDigits: 4,
                  maximumFractionDigits: 4,
                })}{' '}
                Bs/$
              </p>
            </div>

            {/* Líneas del ticket: scroll en pantalla, sin límite en impresión */}
            <div className="border-y border-dashed border-slate-300 dark:border-slate-700 py-2 space-y-1.5 max-h-48 overflow-y-auto print:max-h-none print:overflow-visible">
              {order.lineas.map((l) => (
                <div key={l.lineId} className="flex items-start justify-between gap-2 text-[11px]">
                  <span className="flex-1">
                    <strong className="font-mono">{l.cantidad}×</strong> {l.nombre}
                  </span>
                  <span className="font-mono font-bold tabular-nums shrink-0">
                    ${Number(l.subtotal).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            {/* Totales */}
            <div className="space-y-1 font-mono tabular-nums text-[11px]">
              <div className="flex justify-between">
                <span>Base Imponible:</span>
                <span>${baseUsd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>IVA:</span>
                <span>${taxUsd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-extrabold text-sm text-[#15803D] dark:text-emerald-400 pt-1">
                <span>TOTAL USD:</span>
                <span>${totalUsd.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-extrabold text-xs text-[#0369A1] dark:text-sky-400">
                <span>TOTAL BS.:</span>
                <span>
                  {totalLocal.toLocaleString('es-VE', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  Bs
                </span>
              </div>
            </div>

            {/* Vuelto entregado persistido */}
            {hasChange && (
              <div className="pt-2 border-t border-dashed border-slate-300 dark:border-slate-700 space-y-0.5 font-mono tabular-nums text-[11px]">
                {order.recibido_monto && order.recibido_moneda && (
                  <div className="flex justify-between">
                    <span>Recibido ({order.recibido_moneda}):</span>
                    <span>
                      {order.recibido_moneda === 'USD'
                        ? `$${order.recibido_monto.toFixed(2)}`
                        : `${order.recibido_monto.toLocaleString('es-VE', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })} Bs`}
                    </span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-[#15803D] dark:text-emerald-400">
                  <span>Vuelto USD:</span>
                  <span>${Number(order.vuelto_usd || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-[#0369A1] dark:text-sky-400">
                  <span>Vuelto Bs.:</span>
                  <span>
                    {Number(order.vuelto_local || 0).toLocaleString('es-VE', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    Bs
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Botones de acción (ocultos en impresión) */}
          <div className="flex items-center gap-2 print:hidden">
            <button
              type="button"
              onClick={() => window.print()}
              className={`flex-1 py-2.5 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1.5 transition ${
                isDarkMode
                  ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                  : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
              }`}
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Ticket [P]</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-[#15803D] hover:bg-[#166534] text-white text-xs font-extrabold transition"
            >
              Nueva Venta [Enter]
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
