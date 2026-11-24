'use client';

import { Fragment } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Filter,
  Info,
  Package,
  RefreshCw,
  Search,
  TrendingUp,
} from 'lucide-react';
import { formatStockDesgloseCompleto, getSegmentacionExistencias } from '@/lib/unidades';
import { usePagination } from '@/hooks/usePagination';
import type {
  InventoryFilter,
  InventoryReportData,
  InventoryReportItem,
  InventorySort,
} from '@/components/reportes/types';

interface InventoryReportTabProps {
  invSummary: InventoryReportData['resumen'];
  allProducts: InventoryReportItem[];
  filteredInventory: InventoryReportItem[];
  inventoryFilter: InventoryFilter;
  onInventoryFilterChange: (filter: InventoryFilter) => void;
  inventorySort: InventorySort;
  onInventorySortChange: (sort: InventorySort) => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  expandedProductIds: number[];
  onToggleExpandedProduct: (id: number) => void;
  onSelectSegmentacionItem: (item: InventoryReportItem) => void;
  appliedRate: number;
  loading: boolean;
  isDarkMode: boolean;
}

export default function InventoryReportTab({
  invSummary,
  allProducts,
  filteredInventory,
  inventoryFilter,
  onInventoryFilterChange,
  inventorySort,
  onInventorySortChange,
  searchTerm,
  onSearchChange,
  expandedProductIds,
  onToggleExpandedProduct,
  onSelectSegmentacionItem,
  appliedRate,
  loading,
  isDarkMode,
}: InventoryReportTabProps) {
  const { page, totalPages, startIndex, endIndex, paginatedItems, nextPage, prevPage } =
    usePagination(filteredInventory, 50);

  return (
    <div className="space-y-6 animate-in fade-in">
      <div
        className={`p-4 rounded-2xl border flex items-start gap-3.5 text-xs ${
          isDarkMode
            ? 'bg-blue-950/20 border-blue-900/40 text-blue-200'
            : 'bg-blue-50 border-blue-200 text-blue-950'
        }`}
      >
        <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold text-sm block">Valorización de Existencias Físicas en Almacén</span>
          <p className="leading-relaxed opacity-90 text-[11px]">
            Este reporte calcula el valor monetario de tu inventario en tiempo real. El{' '}
            <strong>Costo Total</strong> representa el capital invertido según el costo promedio ponderado de compra. El{' '}
            <strong>Valor de Venta</strong> y la <strong>Utilidad Potencial</strong> proyectan los ingresos y el margen bruto que se generarán al comercializar todas las existencias disponibles.
          </p>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div
          className={`p-5 rounded-2xl border transition-all ${
            isDarkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Capital al Costo
            </span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-amber-600 dark:text-amber-400 mb-1">
            $
            {invSummary.valorTotalCostoUsd.toLocaleString('es-VE', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div className="text-xs text-slate-500 font-mono">
            Bs.{' '}
            {(invSummary.valorTotalCostoUsd * appliedRate).toLocaleString('es-VE', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Costo promedio de adquisición</p>
        </div>

        <div
          className={`p-5 rounded-2xl border transition-all ${
            isDarkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Valor a Venta
            </span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-blue-600 dark:text-blue-400 mb-1">
            $
            {invSummary.valorTotalVentaUsd.toLocaleString('es-VE', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div className="text-xs text-slate-500 font-mono">
            Bs.{' '}
            {(invSummary.valorTotalVentaUsd * appliedRate).toLocaleString('es-VE', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Proyección de venta total</p>
        </div>

        <div
          className={`p-5 rounded-2xl border transition-all ${
            isDarkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Ganancia Proyectada
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400 mb-1">
            +$
            {invSummary.utilidadPotencialGlobalUsd.toLocaleString('es-VE', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div className="text-xs font-bold text-emerald-500">
            {invSummary.margenPotencialGlobalPct}% de margen
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Beneficio bruto proyectado</p>
        </div>

        <div
          className={`p-5 rounded-2xl border transition-all ${
            isDarkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Existencia Total
            </span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Boxes className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-black font-mono text-purple-600 dark:text-purple-400 mb-1">
            {invSummary.totalUnidadesEnStock.toLocaleString('es-VE')}
          </div>
          <div className="text-xs text-slate-500">Unidades base en almacén</div>
          <p className="text-[10px] text-slate-400 mt-1">
            {invSummary.productosActivos} de {invSummary.totalProductos} productos activos
          </p>
        </div>

        <div
          className={`p-5 rounded-2xl border transition-all ${
            isDarkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Alertas de Stock
            </span>
            <div
              className={`p-2 rounded-xl ${
                invSummary.productosAgotados > 0
                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Agotados (0 stock):</span>
              <span
                className={`font-mono font-bold ${
                  invSummary.productosAgotados > 0 ? 'text-rose-500' : 'text-slate-500'
                }`}
              >
                {invSummary.productosAgotados}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Stock Bajo (≤ 5):</span>
              <span
                className={`font-mono font-bold ${
                  invSummary.productosStockBajo > 0 ? 'text-amber-500' : 'text-slate-500'
                }`}
              >
                {invSummary.productosStockBajo}
              </span>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-2">Productos que requieren reposición</p>
        </div>
      </div>

      {/* Filters & Sorting Bar */}
      <div
        className={`p-4 rounded-2xl border flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 transition-colors ${
          isDarkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-400 mr-1 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Filtrar:
          </span>
          {(
            [
              { id: 'TODOS', label: 'Todos', count: invSummary.totalProductos },
              {
                id: 'CON_STOCK',
                label: 'Con Existencia',
                count: allProducts.filter((p) => p.stock_actual > 0).length,
              },
              { id: 'BAJO_STOCK', label: 'Stock Bajo (≤ 5)', count: invSummary.productosStockBajo },
              { id: 'AGOTADOS', label: 'Agotados (0)', count: invSummary.productosAgotados },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onInventoryFilterChange(f.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                inventoryFilter === f.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : isDarkMode
                    ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>{f.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  inventoryFilter === f.id
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {f.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-60">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar producto por nombre..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
                isDarkMode
                  ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500'
                  : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
              }`}
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={inventorySort}
              onChange={(e) => onInventorySortChange(e.target.value as InventorySort)}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold focus:outline-none cursor-pointer ${
                isDarkMode
                  ? 'bg-slate-800 border-slate-700 text-white'
                  : 'bg-slate-50 border-slate-200 text-slate-800'
              }`}
            >
              <option value="NOMBRE">Nombre A-Z</option>
              <option value="STOCK_DESC">Mayor Existencia</option>
              <option value="VALOR_COSTO_DESC">Mayor Capital al Costo</option>
              <option value="VALOR_VENTA_DESC">Mayor Valor a Venta</option>
              <option value="UTILIDAD_DESC">Mayor Ganancia Proyectada</option>
            </select>
          </div>
        </div>
      </div>

      {/* Inventory Table */}
      <div
        className={`rounded-2xl border overflow-hidden transition-all ${
          isDarkMode ? 'bg-slate-900/60 border-slate-800 shadow-xl' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead
              className={`border-b text-[11px] uppercase tracking-wider ${
                isDarkMode
                  ? 'bg-slate-950/80 text-slate-400 border-slate-800'
                  : 'bg-slate-50 text-slate-600 border-slate-200'
              }`}
            >
              <tr>
                <th className="py-3.5 px-4">Producto</th>
                <th className="py-3.5 px-3">Presentaciones</th>
                <th className="py-3.5 px-4 text-center">Existencia Actual</th>
                <th className="py-3.5 px-3 text-right">Costo Unit.</th>
                <th className="py-3.5 px-3 text-right">Precio Venta</th>
                <th className="py-3.5 px-4 text-right">Valor al Costo</th>
                <th className="py-3.5 px-4 text-right">Valor a Venta</th>
                <th className="py-3.5 px-4 text-right">Ganancia Est.</th>
                <th className="py-3.5 px-3 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-500 mb-2" />
                    Cargando inventario valorizado...
                  </td>
                </tr>
              ) : filteredInventory.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    No se encontraron productos que coincidan con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item) => {
                  const stockNum = Number(item.stock_actual);
                  const isAgotado = stockNum <= 0;
                  const isBajo = stockNum > 0 && stockNum <= 5;
                  const empaqueCompleto = formatStockDesgloseCompleto(item, stockNum);
                  const segmentaciones = getSegmentacionExistencias(item, stockNum);
                  const valorCostoLocal = item.valor_costo_usd * appliedRate;
                  const valorVentaLocal = item.valor_venta_usd * appliedRate;
                  const isExpanded = expandedProductIds.includes(item.id);
                  const hasPresentaciones = item.presentaciones && item.presentaciones.length > 0;

                  return (
                    <Fragment key={item.id}>
                      <tr
                        className={`transition-colors hover:bg-slate-500/5 ${
                          isExpanded ? 'bg-indigo-50/20 dark:bg-indigo-950/20' : ''
                        }`}
                      >
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-800 dark:text-slate-100">{item.nombre}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="font-mono text-[10px] text-slate-400">#{item.id}</span>
                            <span className="text-[10px] font-semibold text-slate-400">
                              • {item.impuesto_nombre} ({item.impuesto_porcentaje}%)
                            </span>
                          </div>
                          {hasPresentaciones && (
                            <button
                              type="button"
                              onClick={() => onToggleExpandedProduct(item.id)}
                              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                              <span>
                                {isExpanded
                                  ? 'Ocultar matriz'
                                  : `Ver segmentación (${item.presentaciones.length + 1} medidas)`}
                              </span>
                            </button>
                          )}
                        </td>

                        <td className="py-3 px-3">
                          <div className="space-y-1">
                            <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-mono">
                              Base: {item.unidad_base || 'Unidad'} (${Number(item.precio_usd).toFixed(2)})
                            </span>
                            {hasPresentaciones && (
                              <div className="flex flex-wrap gap-1">
                                {item.presentaciones.map((pr) => (
                                  <span
                                    key={pr.id}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-mono flex items-center gap-1"
                                  >
                                    <strong className="font-bold">{pr.nombre}</strong>
                                    <span className="opacity-70">x{pr.factor}</span>
                                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                      (${Number(pr.precio_usd).toFixed(2)})
                                    </span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex flex-col items-center max-w-[340px] mx-auto">
                            <span
                              className={`px-2.5 py-1 rounded-xl text-xs font-bold font-mono border text-center ${
                                isAgotado
                                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                                  : isBajo
                                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                              }`}
                            >
                              {empaqueCompleto}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono mt-0.5">
                              Total:{' '}
                              <strong className="text-slate-600 dark:text-slate-300">{stockNum}</strong>{' '}
                              {item.unidad_base || 'unidades'}
                            </span>

                            {hasPresentaciones && stockNum > 0 && (
                              <div className="mt-2 w-full bg-slate-50 dark:bg-slate-800/80 rounded-xl p-2.5 border border-slate-200/90 dark:border-slate-700/80 text-left font-mono shadow-sm">
                                <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between pb-1 border-b border-slate-200 dark:border-slate-700/60">
                                  <span>Disponibilidad por Medida</span>
                                  <span className="text-emerald-600 dark:text-emerald-400">P. Venta</span>
                                </div>
                                <div className="space-y-1">
                                  {segmentaciones.map((s) => (
                                    <div
                                      key={s.id ?? 'base'}
                                      className="flex items-center justify-between gap-1.5 text-xs py-0.5 border-b border-slate-100 dark:border-slate-700/40 last:border-0"
                                    >
                                      <div className="flex items-center gap-1 min-w-0">
                                        <span className="text-xs">📦</span>
                                        <span className="font-black text-slate-800 dark:text-slate-100">
                                          {s.unidades_completas}
                                        </span>
                                        <span className="text-slate-600 dark:text-slate-300 font-medium truncate">
                                          {s.nombre}
                                        </span>
                                        {s.resto_unidades > 0 && s.factor > 1 && (
                                          <span
                                            className="text-[10px] font-bold text-amber-600 dark:text-amber-400"
                                            title={`Sobran ${s.resto_unidades} unidades sueltas`}
                                          >
                                            (+{s.resto_unidades}u)
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1 text-right flex-shrink-0">
                                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                          ${s.precio_usd.toFixed(2)}
                                        </span>
                                        {s.factor > 1 && (
                                          <span className="text-[9px] text-slate-400">
                                            (${s.precio_unitario_equivalente.toFixed(2)}/u)
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <div className="mt-2 pt-1.5 border-t border-slate-200 dark:border-slate-700/70 flex items-center justify-between text-[10px]">
                                  <button
                                    type="button"
                                    onClick={() => onToggleExpandedProduct(item.id)}
                                    className="font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                                  >
                                    {isExpanded ? (
                                      <ChevronUp className="w-3 h-3" />
                                    ) : (
                                      <ChevronDown className="w-3 h-3" />
                                    )}
                                    <span>{isExpanded ? 'Cerrar análisis' : 'Análisis financiero'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onSelectSegmentacionItem(item)}
                                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                  >
                                    Ver modal
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                          ${item.costo_promedio_usd.toFixed(2)}
                        </td>

                        <td className="py-3 px-3 text-right">
                          <div className="font-mono font-bold text-slate-800 dark:text-slate-200">
                            ${item.precio_usd.toFixed(2)}{' '}
                            <span className="text-[10px] font-normal text-slate-400">
                              /{item.unidad_base || 'un'}
                            </span>
                          </div>
                          {hasPresentaciones && (
                            <div className="space-y-0.5 mt-1 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                              {item.presentaciones.map((pr) => {
                                const equiv =
                                  Number(pr.factor) > 0
                                    ? (Number(pr.precio_usd) / Number(pr.factor)).toFixed(2)
                                    : '0';
                                return (
                                  <div key={pr.id} className="truncate">
                                    <span className="font-semibold text-indigo-500 dark:text-indigo-400">
                                      {pr.nombre}:
                                    </span>{' '}
                                    ${Number(pr.precio_usd).toFixed(2)}
                                    <span className="text-[9px] text-slate-400 ml-1">(${equiv}/u)</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="font-mono font-bold text-amber-600 dark:text-amber-400">
                            ${item.valor_costo_usd.toFixed(2)}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">
                            Bs. {valorCostoLocal.toFixed(2)}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="font-mono font-bold text-blue-600 dark:text-blue-400">
                            ${item.valor_venta_usd.toFixed(2)}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">
                            Bs. {valorVentaLocal.toFixed(2)}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            +${item.utilidad_potencial_usd.toFixed(2)}
                          </div>
                          <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400">
                            {item.margen_potencial_porcentaje}%
                          </span>
                        </td>

                        <td className="py-3 px-3 text-center">
                          {isAgotado ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                              <AlertTriangle className="w-3 h-3" /> Agotado
                            </span>
                          ) : isBajo ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              <AlertTriangle className="w-3 h-3" /> Stock Bajo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" /> Óptimo
                            </span>
                          )}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-slate-50/90 dark:bg-slate-900/60 border-b-2 border-indigo-500/30">
                          <td colSpan={9} className="p-4 sm:p-6">
                            <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-md space-y-4">
                              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-700">
                                <div className="flex items-center gap-3">
                                  <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                                    <Boxes className="w-5 h-5" />
                                  </div>
                                  <div>
                                    <h4 className="text-base font-bold text-slate-800 dark:text-slate-100">
                                      Matriz Financiera de Medidas &amp; Precios — {item.nombre}
                                    </h4>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                      Stock físico total:{' '}
                                      <strong className="text-slate-700 dark:text-slate-200">
                                        {stockNum} {item.unidad_base || 'unidades'}
                                      </strong>{' '}
                                      • Costo promedio:{' '}
                                      <strong className="text-amber-600 dark:text-amber-400 font-mono">
                                        ${item.costo_promedio_usd.toFixed(2)}
                                      </strong>{' '}
                                      (Valor costo total: ${item.valor_costo_usd.toFixed(2)} / Bs.{' '}
                                      {(item.valor_costo_usd * appliedRate).toFixed(2)})
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="px-3 py-1 rounded-xl text-xs font-bold font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                    Empaque Óptimo: {empaqueCompleto}
                                  </span>
                                </div>
                              </div>

                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs font-mono">
                                  <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                                    <tr>
                                      <th className="py-2.5 px-3">Presentación / Medida</th>
                                      <th className="py-2.5 px-3 text-center">Factor</th>
                                      <th className="py-2.5 px-3 text-center">Stock Disponible</th>
                                      <th className="py-2.5 px-3 text-right">Precio Venta (USD)</th>
                                      <th className="py-2.5 px-3 text-right">Precio Venta (Bs.)</th>
                                      <th className="py-2.5 px-3 text-right">Equiv. / Unidad</th>
                                      <th className="py-2.5 px-3 text-right">Valor Venta Potencial (USD)</th>
                                      <th className="py-2.5 px-3 text-right">Ganancia Est. (USD)</th>
                                      <th className="py-2.5 px-3 text-center">Margen %</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
                                    {segmentaciones.map((seg) => {
                                      const precioBs = seg.precio_usd * appliedRate;
                                      const ganancia = seg.valor_potencial_usd - item.valor_costo_usd;
                                      const margenPct =
                                        seg.valor_potencial_usd > 0
                                          ? ((ganancia / seg.valor_potencial_usd) * 100).toFixed(2)
                                          : '0.00';
                                      const isBase = seg.id === null;

                                      return (
                                        <tr
                                          key={seg.id ?? 'base'}
                                          className={`hover:bg-slate-500/5 ${
                                            isBase ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                                          }`}
                                        >
                                          <td className="py-3 px-3 font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                            <span className="text-sm">📦</span>
                                            <span>{seg.nombre}</span>
                                            {isBase && (
                                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 font-bold uppercase">
                                                Base
                                              </span>
                                            )}
                                          </td>
                                          <td className="py-3 px-3 text-center text-slate-500">
                                            {seg.factor} {item.unidad_base || 'un'}
                                          </td>
                                          <td className="py-3 px-3 text-center">
                                            <span className="font-bold text-slate-800 dark:text-slate-100">
                                              {seg.unidades_completas} {seg.nombre}s
                                            </span>
                                            {seg.resto_unidades > 0 && seg.factor > 1 && (
                                              <span className="block text-[10px] text-amber-600 dark:text-amber-400">
                                                + {seg.resto_unidades} {item.unidad_base || 'unidades'} sueltas
                                              </span>
                                            )}
                                          </td>
                                          <td className="py-3 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                            ${seg.precio_usd.toFixed(2)}
                                          </td>
                                          <td className="py-3 px-3 text-right text-slate-500">
                                            Bs. {precioBs.toFixed(2)}
                                          </td>
                                          <td className="py-3 px-3 text-right">
                                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                                              ${seg.precio_unitario_equivalente.toFixed(2)}
                                            </span>
                                            {seg.factor > 1 && (
                                              <span className="block text-[10px] text-slate-400">
                                                {(
                                                  (1 -
                                                    seg.precio_unitario_equivalente /
                                                      (Number(item.precio_usd) || 1)) *
                                                  100
                                                ).toFixed(0)}
                                                % desc.
                                              </span>
                                            )}
                                          </td>
                                          <td className="py-3 px-3 text-right font-bold text-blue-600 dark:text-blue-400">
                                            ${seg.valor_potencial_usd.toFixed(2)}
                                            <span className="block text-[10px] text-slate-400 font-normal">
                                              Bs. {(seg.valor_potencial_usd * appliedRate).toFixed(2)}
                                            </span>
                                          </td>
                                          <td className="py-3 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                            +${ganancia.toFixed(2)}
                                          </td>
                                          <td className="py-3 px-3 text-center font-bold text-purple-600 dark:text-purple-400">
                                            {margenPct}%
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
              Mostrando {startIndex + 1}–{endIndex} de {filteredInventory.length}
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
