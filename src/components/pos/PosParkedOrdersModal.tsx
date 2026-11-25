'use client';

import Dialog from '@/components/ui/Dialog';
import type { CartItem } from '@/hooks/usePosCart';
import { Clock, Play, Trash2 } from 'lucide-react';

export interface ParkedSale {
  id: string;
  createdAt: string;
  clientId: number | null;
  clientLabel: string;
  items: CartItem[];
  totalUsd: number;
}

interface PosParkedOrdersModalProps {
  open: boolean;
  onClose: () => void;
  onAfterClose?: () => void;
  parkedSales: readonly ParkedSale[];
  onRecallSale: (saleId: string) => void;
  onDeleteSale: (saleId: string) => void;
  isDarkMode?: boolean;
}

export default function PosParkedOrdersModal({
  open,
  onClose,
  onAfterClose,
  parkedSales,
  onRecallSale,
  onDeleteSale,
  isDarkMode = false,
}: PosParkedOrdersModalProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      onAfterClose={onAfterClose}
      titleId="pos-parked-orders-title"
      maxWidthClass="max-w-lg"
      showCloseButton
      isDarkMode={isDarkMode}
    >
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-2.5 pr-8">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              isDarkMode ? 'bg-amber-950/60 text-amber-300' : 'bg-[#FEF3C7] text-[#92400E]'
            }`}
          >
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h3 id="pos-parked-orders-title" className="text-base font-bold leading-tight">
              Ventas en Espera [F9]
            </h3>
            <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Recupera un ticket aparcado para continuar cobrándolo.
            </p>
          </div>
        </div>

        {parkedSales.length === 0 ? (
          <div
            className={`rounded-xl border p-8 text-center text-xs ${
              isDarkMode
                ? 'bg-slate-950/50 border-slate-800 text-slate-400'
                : 'bg-slate-50 border-slate-200 text-slate-500'
            }`}
          >
            No hay ventas en espera en esta sesión.
          </div>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {parkedSales.map((sale) => (
              <div
                key={sale.id}
                className={`rounded-xl border p-3 flex items-center justify-between gap-3 ${
                  isDarkMode
                    ? 'bg-slate-950/50 border-slate-800'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold truncate">{sale.clientLabel}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
                    {sale.items.length} líneas · ${sale.totalUsd.toFixed(2)} · {sale.createdAt}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      onRecallSale(sale.id);
                      onClose();
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0369A1] text-white text-xs font-semibold hover:bg-[#075985] transition"
                  >
                    <Play className="w-3 h-3" />
                    <span>Recuperar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteSale(sale.id)}
                    aria-label="Descartar venta en espera"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-[#B91C1C] hover:bg-rose-50 dark:hover:bg-rose-950/50 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className={`px-3.5 py-1.5 rounded-lg border text-xs font-semibold transition ${
              isDarkMode
                ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                : 'border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            Cerrar [Esc]
          </button>
        </div>
      </div>
    </Dialog>
  );
}
