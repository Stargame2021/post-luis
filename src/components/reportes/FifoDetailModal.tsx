'use client';

import { TrendingUp } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import type { FifoSaleDetail } from '@/components/reportes/types';

interface FifoDetailModalProps {
  selectedFifoItem: FifoSaleDetail | null;
  onClose: () => void;
  isDarkMode: boolean;
}

export default function FifoDetailModal({
  selectedFifoItem,
  onClose,
  isDarkMode,
}: FifoDetailModalProps) {
  return (
    <Dialog
      open={Boolean(selectedFifoItem)}
      onClose={onClose}
      titleId="fifo-modal-title"
      maxWidthClass="max-w-lg"
      isDarkMode={isDarkMode}
    >
      {selectedFifoItem && (
        <>
          <div
            className={`px-6 py-4 border-b flex justify-between items-center ${
              isDarkMode ? 'border-slate-800 bg-slate-950/40' : 'border-slate-100 bg-slate-50'
            }`}
          >
            <div>
              <h3
                id="fifo-modal-title"
                className="font-bold text-base text-emerald-600 dark:text-emerald-400 flex items-center gap-2"
              >
                <TrendingUp className="w-4 h-4" />
                Desglose FIFO de Venta #{selectedFifoItem.pedido_id}
              </h3>
              <p className="text-xs text-slate-400">
                {selectedFifoItem.producto_nombre} — {selectedFifoItem.cantidad} unidades vendidas
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar desglose FIFO"
              className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-sm p-1 rounded-lg"
            >
              ✕
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
              <div>
                <span className="text-slate-400 block">Precio Venta Unitario:</span>
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                  ${selectedFifoItem.precio_unitario_usd.toFixed(2)} USD
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Costo Ponderado FIFO:</span>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                  ${selectedFifoItem.costo_unitario_ponderado_fifo.toFixed(2)} USD
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Utilidad Bruta:</span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  +${selectedFifoItem.utilidad_bruta_usd.toFixed(2)} USD
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Margen de Ganancia:</span>
                <span className="font-mono font-bold text-purple-600 dark:text-purple-400">
                  {selectedFifoItem.margen_porcentaje}%
                </span>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Lotes de Compra Consumidos (FIFO):
              </h4>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-500 border-b border-slate-200 dark:border-slate-800 text-[11px] uppercase">
                    <tr>
                      <th className="py-2 px-3">Lote / Factura</th>
                      <th className="py-2 px-3 text-center">Unidades</th>
                      <th className="py-2 px-3 text-right">Costo Lote</th>
                      <th className="py-2 px-3 text-right">Subtotal Costo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                    {selectedFifoItem.lotes_consumidos?.map((lote) => (
                      <tr
                        key={`${lote.compra_id ?? 'base'}-${lote.numero_factura ?? ''}-${lote.costo_unitario_usd}-${lote.cantidad_consumida}`}
                      >
                        <td className="py-2 px-3 font-medium">
                          {lote.es_costo_base ? (
                            <span className="text-slate-400 italic">Costo Base / Inventario Inicial</span>
                          ) : (
                            <span>
                              Factura #{lote.numero_factura} (Compra #{lote.compra_id})
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold">
                          {lote.cantidad_consumida} un.
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-amber-600 dark:text-amber-400">
                          ${Number(lote.costo_unitario_usd).toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                          ${(lote.cantidad_consumida * lote.costo_unitario_usd).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div
            className={`px-6 py-3 border-t flex justify-end ${
              isDarkMode ? 'border-slate-800 bg-slate-950/40' : 'border-slate-100 bg-slate-50'
            }`}
          >
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition"
            >
              Cerrar
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
