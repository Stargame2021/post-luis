'use client';

import {
  ArrowUpRight,
  DollarSign,
  Eye,
  Info,
  Package,
  Receipt,
  RefreshCw,
  Search,
  TrendingUp,
} from 'lucide-react';
import type {
  FifoProductRow,
  FifoSaleDetail,
  RentabilidadFifoData,
} from '@/components/reportes/types';

interface ProfitFifoTabProps {
  fifoSummary: RentabilidadFifoData['resumen'];
  filteredProductsProfit: FifoProductRow[];
  filteredFifoSalesDetails: FifoSaleDetail[];
  rentabilidadSubTab: 'productos' | 'ventas';
  onSubTabChange: (tab: 'productos' | 'ventas') => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onSelectFifoItem: (item: FifoSaleDetail) => void;
  loading: boolean;
  isDarkMode: boolean;
}

export default function ProfitFifoTab({
  fifoSummary,
  filteredProductsProfit,
  filteredFifoSalesDetails,
  rentabilidadSubTab,
  onSubTabChange,
  searchTerm,
  onSearchChange,
  onSelectFifoItem,
  loading,
  isDarkMode,
}: ProfitFifoTabProps) {
  return (
    <div className="space-y-6 animate-in fade-in">
      <div
        className={`p-4 rounded-2xl border flex items-start gap-3.5 text-xs ${
          isDarkMode
            ? 'bg-emerald-950/20 border-emerald-900/40 text-emerald-200'
            : 'bg-emerald-50 border-emerald-200 text-emerald-900'
        }`}
      >
        <Info className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold text-sm block">
            Metodología de Costeo FIFO / PEPS (Primeras Entradas, Primeras Salidas)
          </span>
          <p className="leading-relaxed opacity-90 text-[11px]">
            Este reporte analiza el margen de ganancia real de cada producto. Al vender un artículo, se le asigna el costo exacto del{' '}
            <strong>lote de compra más antiguo disponible en inventario</strong>. Cuando ese lote se agota, las siguientes unidades toman el costo del siguiente lote de compra.
          </p>
        </div>
      </div>

      {/* Profitability KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          className={`p-5 rounded-2xl border transition-all ${
            isDarkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Ingresos por Ventas
            </span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-blue-600 dark:text-blue-400 mb-1">
            ${fifoSummary.totalIngresosUsd.toFixed(2)}{' '}
            <span className="text-xs font-normal text-slate-400">USD</span>
          </div>
          <div className="text-xs text-slate-400">Monto facturado sin impuestos</div>
        </div>

        <div
          className={`p-5 rounded-2xl border transition-all ${
            isDarkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Costo de Ventas (FIFO)
            </span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-amber-600 dark:text-amber-400 mb-1">
            ${fifoSummary.totalCostosFifoUsd.toFixed(2)}{' '}
            <span className="text-xs font-normal text-slate-400">USD</span>
          </div>
          <div className="text-xs text-slate-400">Costo histórico según compras FIFO</div>
        </div>

        <div
          className={`p-5 rounded-2xl border transition-all ${
            isDarkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Utilidad Bruta (Ganancia)
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400 mb-1">
            ${fifoSummary.totalUtilidadBrutaUsd.toFixed(2)}{' '}
            <span className="text-xs font-normal text-slate-400">USD</span>
          </div>
          <div className="text-xs text-slate-400">Ganancia neta (Ingresos - Costos)</div>
        </div>

        <div
          className={`p-5 rounded-2xl border transition-all ${
            isDarkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Margen de Rentabilidad
            </span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <ArrowUpRight className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-purple-600 dark:text-purple-400 mb-1">
            {fifoSummary.margenGlobalPorcentaje}%
          </div>
          <div className="text-xs text-slate-400">Rentabilidad sobre ventas totales</div>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div
          className={`inline-flex items-center p-1 rounded-xl border ${
            isDarkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-100 border-slate-200'
          }`}
        >
          <button
            type="button"
            onClick={() => onSubTabChange('productos')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              rentabilidadSubTab === 'productos'
                ? isDarkMode
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'bg-white text-slate-900 shadow-sm'
                : isDarkMode
                  ? 'text-slate-400 hover:text-white'
                  : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            Rentabilidad por Producto
            <span className="ml-1 text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
              {filteredProductsProfit.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onSubTabChange('ventas')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              rentabilidadSubTab === 'ventas'
                ? isDarkMode
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'bg-white text-slate-900 shadow-sm'
                : isDarkMode
                  ? 'text-slate-400 hover:text-white'
                  : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            Detalle por Venta Individual
            <span className="ml-1 text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
              {filteredFifoSalesDetails.length}
            </span>
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por producto o venta..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className={`w-full pl-9 pr-3.5 py-1.5 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
              isDarkMode
                ? 'bg-slate-900 border-slate-800 text-white placeholder-slate-500'
                : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
            }`}
          />
        </div>
      </div>

      {/* Sub-View A: Rentabilidad por Producto */}
      {rentabilidadSubTab === 'productos' && (
        <div
          className={`rounded-2xl border overflow-hidden transition-colors ${
            isDarkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead
                className={`text-xs uppercase tracking-wider border-b transition-colors ${
                  isDarkMode
                    ? 'bg-slate-950/70 text-slate-400 border-slate-800'
                    : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}
              >
                <tr>
                  <th className="py-3.5 px-5">Producto</th>
                  <th className="py-3.5 px-4 text-center">Unid. Vendidas</th>
                  <th className="py-3.5 px-5 text-right">Ingreso Venta (USD)</th>
                  <th className="py-3.5 px-5 text-right">Costo FIFO (USD)</th>
                  <th className="py-3.5 px-5 text-right">Utilidad Bruta</th>
                  <th className="py-3.5 px-5 text-center w-48">Margen %</th>
                </tr>
              </thead>
              <tbody
                className={`divide-y transition-colors ${
                  isDarkMode ? 'divide-slate-800/60 text-slate-200' : 'divide-slate-100 text-slate-800'
                }`}
              >
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin text-emerald-500 opacity-60" />
                      Calculando costos FIFO por producto...
                    </td>
                  </tr>
                ) : filteredProductsProfit.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      No se registraron ventas de productos en este período.
                    </td>
                  </tr>
                ) : (
                  filteredProductsProfit.map((prod) => {
                    const isProfitable = prod.utilidad_bruta_usd >= 0;
                    const margin = prod.margen_porcentaje;

                    return (
                      <tr
                        key={prod.producto_id}
                        className={isDarkMode ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}
                      >
                        <td className="py-3.5 px-5 font-semibold text-xs">
                          <span className="text-slate-900 dark:text-white block">{prod.producto_nombre}</span>
                          <span className="font-mono text-[10px] text-slate-400">
                            ID #{prod.producto_id}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono font-bold text-xs">
                          {prod.unidades_vendidas}
                        </td>
                        <td className="py-3.5 px-5 text-right font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
                          ${prod.ingreso_total_usd.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-5 text-right font-mono text-xs text-amber-600 dark:text-amber-400">
                          ${prod.costo_fifo_total_usd.toFixed(2)}
                        </td>
                        <td
                          className={`py-3.5 px-5 text-right font-mono font-bold text-xs ${
                            isProfitable
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          ${prod.utilidad_bruta_usd.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-5 text-center">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  margin >= 30
                                    ? 'bg-emerald-500'
                                    : margin >= 15
                                      ? 'bg-amber-500'
                                      : 'bg-rose-500'
                                }`}
                                style={{ width: `${Math.min(100, Math.max(0, margin))}%` }}
                              />
                            </div>
                            <span
                              className={`font-mono font-bold text-xs shrink-0 ${
                                margin >= 30
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : margin >= 15
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {margin}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sub-View B: Detalle por Venta Individual */}
      {rentabilidadSubTab === 'ventas' && (
        <div
          className={`rounded-2xl border overflow-hidden transition-colors ${
            isDarkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead
                className={`text-xs uppercase tracking-wider border-b transition-colors ${
                  isDarkMode
                    ? 'bg-slate-950/70 text-slate-400 border-slate-800'
                    : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}
              >
                <tr>
                  <th className="py-3.5 px-4">Pedido</th>
                  <th className="py-3.5 px-4">Fecha y Hora</th>
                  <th className="py-3.5 px-4">Cliente</th>
                  <th className="py-3.5 px-4">Producto</th>
                  <th className="py-3.5 px-3 text-center">Cant.</th>
                  <th className="py-3.5 px-4 text-right">P. Venta</th>
                  <th className="py-3.5 px-4 text-right">Costo FIFO</th>
                  <th className="py-3.5 px-4 text-right">Ingreso USD</th>
                  <th className="py-3.5 px-4 text-right">Costo USD</th>
                  <th className="py-3.5 px-4 text-right">Ganancia</th>
                  <th className="py-3.5 px-4 text-center">Margen</th>
                  <th className="py-3.5 px-3 text-center">Lotes</th>
                </tr>
              </thead>
              <tbody
                className={`divide-y transition-colors ${
                  isDarkMode ? 'divide-slate-800/60 text-slate-200' : 'divide-slate-100 text-slate-800'
                }`}
              >
                {loading ? (
                  <tr>
                    <td colSpan={12} className="py-12 text-center text-slate-400">
                      <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin text-emerald-500 opacity-60" />
                      Cargando detalle FIFO por venta...
                    </td>
                  </tr>
                ) : filteredFifoSalesDetails.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-12 text-center text-slate-400">
                      <Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      No se encontraron transacciones en este período.
                    </td>
                  </tr>
                ) : (
                  filteredFifoSalesDetails.map((sale) => {
                    const isProfitable = sale.utilidad_bruta_usd >= 0;
                    return (
                      <tr
                        key={`${sale.pedido_id}-${sale.linea_id}`}
                        className={isDarkMode ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}
                      >
                        <td className="py-3 px-4 font-mono font-bold text-xs text-indigo-600 dark:text-indigo-400">
                          #{sale.pedido_id}
                        </td>
                        <td className="py-3 px-4 text-xs font-mono text-slate-400 whitespace-nowrap">
                          {new Date(sale.fecha_hora).toLocaleDateString('es-VE')}{' '}
                          {new Date(sale.fecha_hora).toLocaleTimeString('es-VE', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-3 px-4 text-xs font-medium truncate max-w-[140px]">
                          {sale.cliente_nombre}
                        </td>
                        <td className="py-3 px-4 text-xs font-semibold text-slate-900 dark:text-white truncate max-w-[180px]">
                          {sale.producto_nombre}
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-bold text-xs">
                          {sale.cantidad}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs text-slate-600 dark:text-slate-300">
                          ${sale.precio_unitario_usd.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs text-amber-600 dark:text-amber-400">
                          ${sale.costo_unitario_ponderado_fifo.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
                          ${sale.ingreso_usd.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs text-amber-600 dark:text-amber-400">
                          ${sale.costo_fifo_total_usd.toFixed(2)}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono font-bold text-xs ${
                            isProfitable
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          ${sale.utilidad_bruta_usd.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full font-mono font-bold text-[11px] ${
                              sale.margen_porcentaje >= 30
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : sale.margen_porcentaje >= 15
                                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {sale.margen_porcentaje}%
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => onSelectFifoItem(sale)}
                            title="Ver lotes de compra consumidos"
                            className={`p-1.5 rounded-lg transition ${
                              isDarkMode
                                ? 'hover:bg-slate-800 text-slate-400 hover:text-white'
                                : 'hover:bg-slate-200 text-slate-600'
                            }`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
