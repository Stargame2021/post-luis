'use client';

import { Boxes } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import { formatStockDesgloseCompleto, getSegmentacionExistencias } from '@/lib/unidades';
import type { InventoryReportItem } from '@/components/reportes/types';

interface SegmentacionModalProps {
  selectedSegmentacionItem: InventoryReportItem | null;
  onClose: () => void;
  isDarkMode: boolean;
}

export default function SegmentacionModal({
  selectedSegmentacionItem,
  onClose,
  isDarkMode,
}: SegmentacionModalProps) {
  return (
    <Dialog
      open={Boolean(selectedSegmentacionItem)}
      onClose={onClose}
      titleId="segmentacion-modal-title"
      maxWidthClass="max-w-2xl"
      isDarkMode={isDarkMode}
    >
      {selectedSegmentacionItem && (
        <>
          <div
            className={`px-6 py-4 border-b flex justify-between items-center ${
              isDarkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-100 bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
                <Boxes className="w-5 h-5" />
              </div>
              <div>
                <h3
                  id="segmentacion-modal-title"
                  className="font-bold text-base text-slate-800 dark:text-slate-100"
                >
                  Segmentación de Medidas &amp; Precios — {selectedSegmentacionItem.nombre}
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  Stock Total: {selectedSegmentacionItem.stock_actual}{' '}
                  {selectedSegmentacionItem.unidad_base || 'unidades'} • Costo ref: $
                  {Number(selectedSegmentacionItem.costo_promedio_usd).toFixed(2)} USD
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar segmentación"
              className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-base p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              ✕
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div
              className={`p-4 rounded-2xl border flex items-center justify-between text-xs ${
                isDarkMode ? 'bg-indigo-950/20 border-indigo-900/40' : 'bg-indigo-50 border-indigo-200'
              }`}
            >
              <div>
                <span className="font-bold text-indigo-600 dark:text-indigo-400 block text-xs uppercase tracking-wider">
                  📦 Empaque Combinado Óptimo en Almacén
                </span>
                <p className="text-sm font-bold font-mono text-slate-800 dark:text-slate-200 mt-0.5">
                  {formatStockDesgloseCompleto(
                    selectedSegmentacionItem,
                    selectedSegmentacionItem.stock_actual
                  )}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Total Base</span>
                <p className="font-mono font-bold text-sm text-indigo-500">
                  {selectedSegmentacionItem.stock_actual}{' '}
                  {selectedSegmentacionItem.unidad_base || 'unidades'}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead
                  className={`text-[11px] uppercase tracking-wider border-b ${
                    isDarkMode
                      ? 'bg-slate-950/80 text-slate-400 border-slate-800'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  <tr>
                    <th className="py-2.5 px-3">Presentación / Medida</th>
                    <th className="py-2.5 px-3 text-center">Contenido</th>
                    <th className="py-2.5 px-3 text-center">Disponible</th>
                    <th className="py-2.5 px-3 text-right">Precio Venta</th>
                    <th className="py-2.5 px-3 text-right">Equiv. / Unidad</th>
                    <th className="py-2.5 px-3 text-right">Valor Total Estimado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                  {getSegmentacionExistencias(
                    selectedSegmentacionItem,
                    selectedSegmentacionItem.stock_actual
                  ).map((seg) => (
                    <tr key={seg.id ?? 'base'} className="hover:bg-slate-500/5 transition">
                      <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">
                        {seg.nombre} {seg.id === null ? '(Unidad Base)' : ''}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono">
                        {seg.factor} {selectedSegmentacionItem.unidad_base || 'un.'}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-sm">
                          {seg.unidades_completas}
                        </span>{' '}
                        <span className="text-[11px] text-slate-400">{seg.nombre}s</span>
                        {seg.resto_unidades > 0 && seg.factor > 1 && (
                          <span className="block text-[10px] text-slate-400 font-mono">
                            (+{seg.resto_unidades} {selectedSegmentacionItem.unidad_base || 'un'} sueltas)
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        ${seg.precio_usd.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                        ${seg.precio_unitario_equivalente.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                        ${seg.valor_potencial_usd.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
