'use client';

import { Fragment } from 'react';
import {
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Package,
  Receipt,
  RefreshCw,
  Search,
} from 'lucide-react';
import { usePagination } from '@/hooks/usePagination';
import type {
  SalesCurrencyMode,
  SalesReportRow,
  SalesReportSummary,
} from '@/components/reportes/types';

interface SalesReportTabProps {
  salesSummary: SalesReportSummary;
  filteredSales: SalesReportRow[];
  expandedSaleIds: number[];
  onToggleExpandedSale: (id: number) => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  salesCurrencyMode: SalesCurrencyMode;
  onCurrencyModeChange: (mode: SalesCurrencyMode) => void;
  appliedRate: number;
  fechaDesde: string;
  fechaHasta: string;
  loading: boolean;
  isDarkMode: boolean;
}

export default function SalesReportTab({
  salesSummary,
  filteredSales,
  expandedSaleIds,
  onToggleExpandedSale,
  searchTerm,
  onSearchChange,
  salesCurrencyMode,
  onCurrencyModeChange,
  appliedRate,
  fechaDesde,
  fechaHasta,
  loading,
  isDarkMode,
}: SalesReportTabProps) {
  const { page, totalPages, startIndex, endIndex, paginatedItems, nextPage, prevPage } =
    usePagination(filteredSales, 50);

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          className={`p-5 rounded-2xl border transition-all ${
            isDarkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Total Ventas (USD)
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400 mb-1">
            ${salesSummary.totalVentasUsd.toFixed(2)}
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>Base: ${salesSummary.totalBaseUsd.toFixed(2)}</span>
            <span className="text-amber-500 font-semibold">+IVA: ${salesSummary.totalIvaUsd.toFixed(2)}</span>
          </div>
        </div>

        <div
          className={`p-5 rounded-2xl border transition-all ${
            isDarkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Total Moneda Local
            </span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Receipt className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-indigo-600 dark:text-indigo-400 mb-1">
            {salesSummary.totalVentasLocal.toLocaleString('es-VE', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
            <span className="text-xs font-normal text-slate-400 ml-1">Bs.</span>
          </div>
          <div className="flex justify-between text-xs text-slate-500">
            <span>
              Base:{' '}
              {(salesSummary.totalBaseLocal || Number((salesSummary.totalBaseUsd * appliedRate).toFixed(2))).toLocaleString(
                'es-VE',
                { minimumFractionDigits: 2, maximumFractionDigits: 2 }
              )}{' '}
              Bs.
            </span>
            <span className="text-amber-500 font-semibold">
              +IVA:{' '}
              {(salesSummary.totalIvaLocal || Number((salesSummary.totalIvaUsd * appliedRate).toFixed(2))).toLocaleString(
                'es-VE',
                { minimumFractionDigits: 2, maximumFractionDigits: 2 }
              )}{' '}
              Bs.
            </span>
          </div>
        </div>

        <div
          className={`p-5 rounded-2xl border transition-all ${
            isDarkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Ventas Completadas
            </span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-slate-900 dark:text-white mb-1">
            {salesSummary.cantidadPedidos} <span className="text-xs font-normal text-slate-400">pedidos</span>
          </div>
          <div className="text-xs text-slate-500">
            {salesSummary.totalUnidadesVendidas} unidades de artículos despachadas
          </div>
        </div>

        <div
          className={`p-5 rounded-2xl border transition-all ${
            isDarkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Ticket Promedio
            </span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <BarChart3 className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-purple-600 dark:text-purple-400 mb-1">
            ${salesSummary.ticketPromedioUsd.toFixed(2)}
          </div>
          <div className="text-xs text-slate-400">Promedio de consumo por cliente</div>
        </div>
      </div>

      {/* Print Header */}
      <div className="hidden print:block mb-4 p-4 border border-slate-300 rounded-2xl bg-white text-slate-900">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight">Reporte de Ventas</h2>
            <p className="text-xs font-semibold text-slate-700 mt-0.5">
              Visualización de Moneda:{' '}
              <span className="font-bold text-indigo-700">
                {salesCurrencyMode === 'ambas'
                  ? 'Ambas Monedas (USD y Bs.)'
                  : salesCurrencyMode === 'usd'
                    ? 'Solo Dólares (USD)'
                    : 'Solo Bolívares (Bs.)'}
              </span>
            </p>
            <p className="text-xs text-slate-600 font-mono">
              Período: {fechaDesde} al {fechaHasta}
            </p>
          </div>
          <div className="text-right text-xs text-slate-500 font-mono">
            <p>Fecha de Impresión: {new Date().toLocaleString('es-VE')}</p>
            <p>Total Pedidos: {salesSummary.cantidadPedidos}</p>
          </div>
        </div>
      </div>

      {/* Search bar & Currency Selector */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Filtrar por ID, cliente o RIF..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className={`w-full pl-9 pr-3.5 py-2 rounded-xl border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                isDarkMode
                  ? 'bg-slate-900 border-slate-800 text-white placeholder-slate-500'
                  : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
              }`}
            />
          </div>

          <div
            className={`flex items-center gap-1 p-1 rounded-xl border transition-colors ${
              isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-100/90 border-slate-200'
            }`}
          >
            <span className="text-[11px] font-bold text-slate-400 px-2 flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5 text-indigo-500" /> Moneda:
            </span>
            <button
              type="button"
              onClick={() => onCurrencyModeChange('ambas')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                salesCurrencyMode === 'ambas'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : isDarkMode
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ambas (USD + Bs.)
            </button>
            <button
              type="button"
              onClick={() => onCurrencyModeChange('usd')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                salesCurrencyMode === 'usd'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : isDarkMode
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Solo USD ($)
            </button>
            <button
              type="button"
              onClick={() => onCurrencyModeChange('bs')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                salesCurrencyMode === 'bs'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : isDarkMode
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Solo Bs.
            </button>
          </div>
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Mostrando {filteredSales.length} de {salesSummary.cantidadPedidos} ventas en el período
        </div>
      </div>

      {/* Sales Table */}
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
                <th className="py-3.5 px-4">ID</th>
                <th className="py-3.5 px-4">Fecha y Hora</th>
                <th className="py-3.5 px-4">Cliente</th>
                <th className="py-3.5 px-4">Productos Vendidos</th>
                <th className="py-3.5 px-3 text-center">Arts.</th>
                <th className="py-3.5 px-3 text-right">Tasa BCV</th>

                {(salesCurrencyMode === 'ambas' || salesCurrencyMode === 'usd') && (
                  <>
                    <th className="py-3.5 px-3 text-right text-slate-700 dark:text-slate-300">
                      Base Imponible USD
                    </th>
                    <th className="py-3.5 px-3 text-right text-amber-600 dark:text-amber-400">
                      IVA USD
                    </th>
                    <th className="py-3.5 px-4 text-right text-emerald-600 dark:text-emerald-400">
                      Total USD
                    </th>
                  </>
                )}

                {(salesCurrencyMode === 'ambas' || salesCurrencyMode === 'bs') && (
                  <>
                    <th className="py-3.5 px-3 text-right text-slate-700 dark:text-slate-300">
                      Base Imponible Bs.
                    </th>
                    <th className="py-3.5 px-3 text-right text-amber-600 dark:text-amber-400">
                      IVA Bs.
                    </th>
                    <th className="py-3.5 px-4 text-right text-indigo-600 dark:text-indigo-400">
                      Total Bs.
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody
              className={`divide-y transition-colors ${
                isDarkMode ? 'divide-slate-800/60 text-slate-200' : 'divide-slate-100 text-slate-800'
              }`}
            >
              {loading ? (
                <tr>
                  <td colSpan={salesCurrencyMode === 'ambas' ? 12 : 9} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin text-indigo-500 opacity-60" />
                    Cargando reporte de ventas...
                  </td>
                </tr>
              ) : filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={salesCurrencyMode === 'ambas' ? 12 : 9} className="py-12 text-center text-slate-400">
                    <Receipt className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    No se encontraron ventas completadas en el rango seleccionado ({fechaDesde} a {fechaHasta}).
                  </td>
                </tr>
              ) : (
                paginatedItems.map((p) => {
                  const isSaleExpanded = expandedSaleIds.includes(p.id);
                  const hasLineas = Boolean(p.lineas && p.lineas.length > 0);

                  return (
                    <Fragment key={p.id}>
                      <tr
                        className={`transition-colors ${
                          isDarkMode ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'
                        } ${isSaleExpanded ? 'bg-indigo-50/20 dark:bg-indigo-950/20' : ''}`}
                      >
                        <td className="py-3 px-4 font-mono font-bold text-xs text-indigo-600 dark:text-indigo-400">
                          #{p.id}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 font-mono">
                          {new Date(p.fecha_hora).toLocaleString('es-VE')}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-xs text-slate-900 dark:text-white">
                            {p.cliente_nombre || 'Cliente General'}
                          </div>
                          {p.cliente_identificacion && (
                            <div className="text-[10px] font-mono text-slate-400">
                              {p.cliente_identificacion}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <div className="space-y-1 max-w-[280px]">
                            {hasLineas && p.lineas ? (
                              <>
                                <div className="flex flex-wrap gap-1">
                                  {p.lineas.map((linea) => (
                                    <span
                                      key={
                                        linea.id ??
                                        `${p.id}-${linea.producto_id}-${linea.presentacion_nombre ?? 'base'}`
                                      }
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-mono font-medium bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700/80"
                                      title={`${Number(linea.cantidad)}x ${linea.producto_nombre} ${
                                        linea.presentacion_nombre ? `(${linea.presentacion_nombre})` : ''
                                      } - $${Number(linea.subtotal_usd).toFixed(2)}`}
                                    >
                                      <Package className="w-3 h-3 text-indigo-500 shrink-0" />
                                      <strong className="text-indigo-600 dark:text-indigo-400 font-bold">
                                        {Number(linea.cantidad)}x
                                      </strong>
                                      <span className="font-semibold truncate max-w-[120px]">
                                        {linea.producto_nombre}
                                      </span>
                                      {linea.presentacion_nombre && (
                                        <span className="text-[10px] px-1 rounded bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-bold">
                                          {linea.presentacion_nombre}
                                        </span>
                                      )}
                                    </span>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => onToggleExpandedSale(p.id)}
                                  className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5 mt-0.5"
                                >
                                  {isSaleExpanded ? (
                                    <ChevronUp className="w-3 h-3" />
                                  ) : (
                                    <ChevronDown className="w-3 h-3" />
                                  )}
                                  <span>{isSaleExpanded ? 'Ocultar ticket' : 'Ver detalle del ticket'}</span>
                                </button>
                              </>
                            ) : (
                              <span className="text-xs text-slate-400 italic">Sin productos detallados</span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-center font-mono text-xs">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {p.total_articulos}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs text-slate-500">
                          {Number(p.tasa_cambio_aplicada).toFixed(4)}
                        </td>

                        {(salesCurrencyMode === 'ambas' || salesCurrencyMode === 'usd') && (
                          <>
                            <td className="py-3 px-3 text-right font-mono text-xs text-slate-600 dark:text-slate-300">
                              ${Number(p.base_imponible_usd).toFixed(2)}
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-xs text-amber-600 dark:text-amber-400">
                              ${Number(p.monto_impuesto_usd).toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                              ${Number(p.total_usd).toFixed(2)}
                            </td>
                          </>
                        )}

                        {(salesCurrencyMode === 'ambas' || salesCurrencyMode === 'bs') && (
                          <>
                            <td className="py-3 px-3 text-right font-mono text-xs text-slate-600 dark:text-slate-300">
                              {(p.base_imponible_bs !== undefined
                                ? Number(p.base_imponible_bs)
                                : Number(p.base_imponible_usd) * Number(p.tasa_cambio_aplicada)
                              ).toLocaleString('es-VE', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}{' '}
                              <span className="text-[10px] font-normal text-slate-400">Bs.</span>
                            </td>
                            <td className="py-3 px-3 text-right font-mono text-xs text-amber-600 dark:text-amber-400">
                              {(p.monto_impuesto_bs !== undefined
                                ? Number(p.monto_impuesto_bs)
                                : Number(p.monto_impuesto_usd) * Number(p.tasa_cambio_aplicada)
                              ).toLocaleString('es-VE', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}{' '}
                              <span className="text-[10px] font-normal text-slate-400">Bs.</span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                              {Number(p.total_moneda_local).toLocaleString('es-VE', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}{' '}
                              <span className="text-[10px] font-normal text-slate-400">Bs.</span>
                            </td>
                          </>
                        )}
                      </tr>

                      {isSaleExpanded && hasLineas && p.lineas && (
                        <tr className="bg-slate-50/90 dark:bg-slate-900/60 border-b-2 border-indigo-500/30">
                          <td colSpan={salesCurrencyMode === 'ambas' ? 12 : 9} className="p-4 sm:p-5">
                            <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
                              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-700">
                                <div className="flex items-center gap-2">
                                  <Receipt className="w-4 h-4 text-indigo-500" />
                                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                                    Detalle de Productos en Pedido #{p.id} — {p.cliente_nombre || 'Cliente General'}
                                  </h5>
                                </div>
                                <span className="text-xs font-mono text-slate-400">
                                  Tasa Aplicada: {Number(p.tasa_cambio_aplicada).toFixed(4)} Bs/$
                                </span>
                              </div>

                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs font-mono">
                                  <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                                    <tr>
                                      <th className="py-2 px-3">Producto</th>
                                      <th className="py-2 px-3">Presentación / Medida</th>
                                      <th className="py-2 px-3 text-center">Cantidad</th>
                                      <th className="py-2 px-3 text-right">Precio Unit. (USD)</th>
                                      <th className="py-2 px-3 text-right">IVA %</th>
                                      <th className="py-2 px-3 text-right">IVA (USD)</th>
                                      <th className="py-2 px-3 text-right">Subtotal (USD)</th>
                                      <th className="py-2 px-3 text-right">Total (Bs.)</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                                    {p.lineas.map((linea) => {
                                      const lineTotalUsd =
                                        Number(linea.subtotal_usd) + Number(linea.monto_impuesto_usd);
                                      const lineTotalBs = lineTotalUsd * Number(p.tasa_cambio_aplicada);
                                      return (
                                        <tr
                                          key={
                                            linea.id ??
                                            `${p.id}-${linea.producto_id}-${linea.presentacion_nombre ?? 'base'}`
                                          }
                                          className="hover:bg-slate-500/5"
                                        >
                                          <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">
                                            {linea.producto_nombre}
                                          </td>
                                          <td className="py-2.5 px-3">
                                            <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-bold">
                                              {linea.presentacion_nombre || linea.unidad_base || 'Unidad'}
                                            </span>
                                          </td>
                                          <td className="py-2.5 px-3 text-center font-bold">
                                            {Number(linea.cantidad)}
                                          </td>
                                          <td className="py-2.5 px-3 text-right">
                                            ${Number(linea.precio_unitario_usd).toFixed(2)}
                                          </td>
                                          <td className="py-2.5 px-3 text-right text-slate-400">
                                            {Number(linea.porcentaje_impuesto)}%
                                          </td>
                                          <td className="py-2.5 px-3 text-right text-amber-600 dark:text-amber-400">
                                            ${Number(linea.monto_impuesto_usd).toFixed(2)}
                                          </td>
                                          <td className="py-2.5 px-3 text-right font-bold text-slate-900 dark:text-white">
                                            ${Number(linea.subtotal_usd).toFixed(2)}
                                          </td>
                                          <td className="py-2.5 px-3 text-right font-bold text-indigo-600 dark:text-indigo-400">
                                            Bs. {lineTotalBs.toFixed(2)}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div
            className={`px-4 py-3 border-t flex items-center justify-between text-xs print:hidden ${
              isDarkMode ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-600'
            }`}
          >
            <span className="font-mono">
              Mostrando {startIndex + 1}–{endIndex} de {filteredSales.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={prevPage}
                disabled={page <= 1}
                className="px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
              >
                Anterior
              </button>
              <span className="font-mono font-bold">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={nextPage}
                disabled={page >= totalPages}
                className="px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
