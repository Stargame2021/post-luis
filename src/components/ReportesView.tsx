'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Boxes,
  Calendar,
  FileSpreadsheet,
  Printer,
  Receipt,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { Tasa } from '@/types';
import { useDebounce } from '@/hooks/useDebounce';
import { exportReportCsv, exportReportExcel } from '@/lib/export-reportes';
import SalesReportTab from '@/components/reportes/SalesReportTab';
import ProfitFifoTab from '@/components/reportes/ProfitFifoTab';
import InventoryReportTab from '@/components/reportes/InventoryReportTab';
import FifoDetailModal from '@/components/reportes/FifoDetailModal';
import SegmentacionModal from '@/components/reportes/SegmentacionModal';
import {
  getCaracasDateStringClient,
  type DatePreset,
  type FifoSaleDetail,
  type InventoryFilter,
  type InventoryReportItem,
  type InventorySort,
  type ReportData,
  type ReportTab,
  type SalesCurrencyMode,
} from '@/components/reportes/types';

interface ReportesViewProps {
  currentRate: Tasa | null;
  initialTab?: ReportTab;
  isDarkMode?: boolean;
}

export default function ReportesView({
  currentRate,
  initialTab = 'ventas',
  isDarkMode = false,
}: ReportesViewProps) {
  const [activeTab, setActiveTab] = useState<ReportTab>(initialTab);
  const [inventoryFilter, setInventoryFilter] = useState<InventoryFilter>('TODOS');
  const [inventorySort, setInventorySort] = useState<InventorySort>('NOMBRE');
  const [selectedSegmentacionItem, setSelectedSegmentacionItem] =
    useState<InventoryReportItem | null>(null);
  const [expandedProductIds, setExpandedProductIds] = useState<number[]>([]);
  const [expandedSaleIds, setExpandedSaleIds] = useState<number[]>([]);

  const initialToday = useMemo(() => getCaracasDateStringClient(), []);
  const initialFirstDay = `${initialToday.slice(0, 7)}-01`;

  const [fechaDesde, setFechaDesde] = useState(initialFirstDay);
  const [fechaHasta, setFechaHasta] = useState(initialToday);
  const [datePreset, setDatePreset] = useState<DatePreset>('mes');

  const [loading, setLoading] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 200);
  const [salesCurrencyMode, setSalesCurrencyMode] = useState<SalesCurrencyMode>('ambas');
  const [rentabilidadSubTab, setRentabilidadSubTab] = useState<'productos' | 'ventas'>('productos');
  const [selectedFifoItem, setSelectedFifoItem] = useState<FifoSaleDetail | null>(null);

  const toggleExpandedProduct = (id: number) => {
    setExpandedProductIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleExpandedSale = (id: number) => {
    setExpandedSaleIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleApplyPreset = (preset: Exclude<DatePreset, 'custom'>) => {
    setDatePreset(preset);
    const todayStr = getCaracasDateStringClient();
    const [y, m, day] = todayStr.split('-').map(Number);
    const baseUtc = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));

    if (preset === 'hoy') {
      setFechaDesde(todayStr);
      setFechaHasta(todayStr);
    } else if (preset === 'semana') {
      const dayOfWeek = baseUtc.getUTCDay() || 7;
      const monday = new Date(baseUtc);
      monday.setUTCDate(baseUtc.getUTCDate() - (dayOfWeek - 1));
      setFechaDesde(monday.toISOString().slice(0, 10));
      setFechaHasta(todayStr);
    } else if (preset === 'mes') {
      setFechaDesde(`${todayStr.slice(0, 7)}-01`);
      setFechaHasta(todayStr);
    } else if (preset === '30dias') {
      const thirtyDaysAgo = new Date(baseUtc);
      thirtyDaysAgo.setUTCDate(baseUtc.getUTCDate() - 30);
      setFechaDesde(thirtyDaysAgo.toISOString().slice(0, 10));
      setFechaHasta(todayStr);
    } else if (preset === 'anio') {
      setFechaDesde(`${todayStr.slice(0, 4)}-01-01`);
      setFechaHasta(todayStr);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadReports = async () => {
      try {
        const res = await fetch(`/api/reportes?desde=${fechaDesde}&hasta=${fechaHasta}`);
        const data = (await res.json()) as ReportData;
        if (!cancelled && data.success) {
          setReportData(data);
        }
      } catch (e) {
        console.error('Error fetching reports:', e);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadReports();
    return () => {
      cancelled = true;
    };
  }, [fechaDesde, fechaHasta, reloadTick]);

  const handleRefresh = () => {
    setLoading(true);
    setReloadTick((prev) => prev + 1);
  };

  const filteredSales = useMemo(() => {
    const pedidos = reportData?.ventas?.pedidos ?? [];
    if (!debouncedSearch.trim()) return pedidos;
    const q = debouncedSearch.toLowerCase();
    return pedidos.filter(
      (p) =>
        String(p.id).includes(q) ||
        Boolean(p.cliente_nombre && p.cliente_nombre.toLowerCase().includes(q)) ||
        Boolean(p.cliente_identificacion && p.cliente_identificacion.toLowerCase().includes(q)) ||
        Boolean(
          p.lineas &&
            p.lineas.some(
              (l) =>
                l.producto_nombre.toLowerCase().includes(q) ||
                Boolean(l.presentacion_nombre && l.presentacion_nombre.toLowerCase().includes(q))
            )
        )
    );
  }, [reportData, debouncedSearch]);

  const filteredProductsProfit = useMemo(() => {
    const rows = reportData?.rentabilidadFifo?.porProducto ?? [];
    if (!debouncedSearch.trim()) return rows;
    const q = debouncedSearch.toLowerCase();
    return rows.filter(
      (p) => p.producto_nombre.toLowerCase().includes(q) || String(p.producto_id).includes(q)
    );
  }, [reportData, debouncedSearch]);

  const filteredFifoSalesDetails = useMemo(() => {
    const rows = reportData?.rentabilidadFifo?.ventasDetalle ?? [];
    if (!debouncedSearch.trim()) return rows;
    const q = debouncedSearch.toLowerCase();
    return rows.filter(
      (s) =>
        String(s.pedido_id).includes(q) ||
        s.producto_nombre.toLowerCase().includes(q) ||
        s.cliente_nombre.toLowerCase().includes(q)
    );
  }, [reportData, debouncedSearch]);

  const filteredInventory = useMemo(() => {
    const raw = reportData?.inventario?.productos ?? [];
    let list = [...raw];
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (p) => p.nombre.toLowerCase().includes(q) || String(p.id).includes(q)
      );
    }
    if (inventoryFilter === 'CON_STOCK') {
      list = list.filter((p) => p.stock_actual > 0);
    } else if (inventoryFilter === 'BAJO_STOCK') {
      list = list.filter((p) => p.stock_actual > 0 && p.stock_actual <= 5);
    } else if (inventoryFilter === 'AGOTADOS') {
      list = list.filter((p) => p.stock_actual <= 0);
    }

    if (inventorySort === 'STOCK_DESC') {
      list.sort((a, b) => b.stock_actual - a.stock_actual);
    } else if (inventorySort === 'VALOR_COSTO_DESC') {
      list.sort((a, b) => b.valor_costo_usd - a.valor_costo_usd);
    } else if (inventorySort === 'VALOR_VENTA_DESC') {
      list.sort((a, b) => b.valor_venta_usd - a.valor_venta_usd);
    } else if (inventorySort === 'UTILIDAD_DESC') {
      list.sort((a, b) => b.utilidad_potencial_usd - a.utilidad_potencial_usd);
    } else {
      list.sort((a, b) => a.nombre.localeCompare(b.nombre));
    }
    return list;
  }, [reportData, debouncedSearch, inventoryFilter, inventorySort]);

  const appliedRate = currentRate && Number(currentRate.tasa) > 0 ? Number(currentRate.tasa) : 1;

  const salesSummary = reportData?.ventas?.resumen ?? {
    totalVentasUsd: 0,
    totalVentasLocal: 0,
    totalBaseUsd: 0,
    totalBaseLocal: 0,
    totalIvaUsd: 0,
    totalIvaLocal: 0,
    cantidadPedidos: 0,
    ticketPromedioUsd: 0,
    totalUnidadesVendidas: 0,
  };

  const fifoSummary = reportData?.rentabilidadFifo?.resumen ?? {
    totalIngresosUsd: 0,
    totalCostosFifoUsd: 0,
    totalUtilidadBrutaUsd: 0,
    margenGlobalPorcentaje: 0,
  };

  const invSummary = reportData?.inventario?.resumen ?? {
    totalProductos: 0,
    productosActivos: 0,
    totalUnidadesEnStock: 0,
    valorTotalCostoUsd: 0,
    valorTotalVentaUsd: 0,
    utilidadPotencialGlobalUsd: 0,
    margenPotencialGlobalPct: 0,
    productosAgotados: 0,
    productosStockBajo: 0,
  };

  return (
    <div className="space-y-6">
      {/* Header with Title & Main Tabs */}
      <div
        className={`print:hidden p-6 rounded-3xl border transition-all ${
          isDarkMode
            ? 'bg-slate-900/60 border-slate-800 shadow-xl'
            : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              <BarChart3 className="w-3.5 h-3.5" />
              Centro de Informes &amp; Analítica
            </div>
            <h2 className={`text-2xl font-black tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              Reportes Ejecutivos del Negocio
            </h2>
            <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Análisis de ventas por período y rentabilidad operativa calculada bajo la metodología FIFO (PEPS)
            </p>
          </div>

          <div
            className={`inline-flex flex-wrap items-center p-1.5 rounded-2xl border ${
              isDarkMode ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-100 border-slate-200'
            }`}
          >
            <button
              type="button"
              onClick={() => setActiveTab('ventas')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'ventas'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                  : isDarkMode
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Receipt className="w-4 h-4" />
              1. Ventas por Fecha
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('rentabilidad')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'rentabilidad'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25'
                  : isDarkMode
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              2. Rentabilidad FIFO
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('inventario')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                activeTab === 'inventario'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
                  : isDarkMode
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Boxes className="w-4 h-4" />
              3. Inventario &amp; Valorización
            </button>
          </div>
        </div>
      </div>

      {/* Date Range Selector & Actions Bar */}
      <div
        className={`print:hidden p-4 rounded-2xl border flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 transition-colors ${
          isDarkMode ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-400 mr-1 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" /> Período:
          </span>

          {(
            [
              { id: 'hoy', label: 'Hoy' },
              { id: 'semana', label: 'Esta Semana' },
              { id: 'mes', label: 'Este Mes' },
              { id: '30dias', label: 'Últimos 30 días' },
              { id: 'anio', label: 'Este Año' },
            ] as const
          ).map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleApplyPreset(preset.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                datePreset === preset.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : isDarkMode
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-400 font-medium">Desde:</span>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => {
                  setLoading(true);
                  setFechaDesde(e.target.value);
                  setDatePreset('custom');
                }}
                className={`px-2.5 py-1.5 rounded-xl border text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                  isDarkMode
                    ? 'bg-slate-800 border-slate-700 text-white'
                    : 'bg-slate-50 border-slate-200 text-slate-900'
                }`}
              />
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-400 font-medium">Hasta:</span>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => {
                  setLoading(true);
                  setFechaHasta(e.target.value);
                  setDatePreset('custom');
                }}
                className={`px-2.5 py-1.5 rounded-xl border text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                  isDarkMode
                    ? 'bg-slate-800 border-slate-700 text-white'
                    : 'bg-slate-50 border-slate-200 text-slate-900'
                }`}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              title="Refrescar reporte"
              className={`p-2 rounded-xl border transition ${
                isDarkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                  : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() =>
                exportReportExcel({
                  activeTab,
                  reportData,
                  salesCurrencyMode,
                  appliedRate,
                  fechaDesde,
                  fechaHasta,
                })
              }
              title="Descargar libro de Microsoft Excel (.xlsx)"
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm shadow-emerald-600/25"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Excel (.xlsx)
            </button>

            <button
              type="button"
              onClick={() =>
                exportReportCsv({
                  activeTab,
                  reportData,
                  salesCurrencyMode,
                  appliedRate,
                  fechaDesde,
                  fechaHasta,
                })
              }
              title="Exportar a archivo plano CSV"
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition ${
                isDarkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                  : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200 shadow-sm'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
              CSV
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              title="Imprimir reporte"
              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm shadow-indigo-600/20"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'ventas' && (
        <SalesReportTab
          salesSummary={salesSummary}
          filteredSales={filteredSales}
          expandedSaleIds={expandedSaleIds}
          onToggleExpandedSale={toggleExpandedSale}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          salesCurrencyMode={salesCurrencyMode}
          onCurrencyModeChange={setSalesCurrencyMode}
          appliedRate={appliedRate}
          fechaDesde={fechaDesde}
          fechaHasta={fechaHasta}
          loading={loading}
          isDarkMode={isDarkMode}
        />
      )}

      {activeTab === 'rentabilidad' && (
        <ProfitFifoTab
          fifoSummary={fifoSummary}
          filteredProductsProfit={filteredProductsProfit}
          filteredFifoSalesDetails={filteredFifoSalesDetails}
          rentabilidadSubTab={rentabilidadSubTab}
          onSubTabChange={setRentabilidadSubTab}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onSelectFifoItem={setSelectedFifoItem}
          loading={loading}
          isDarkMode={isDarkMode}
        />
      )}

      {activeTab === 'inventario' && (
        <InventoryReportTab
          invSummary={invSummary}
          allProducts={reportData?.inventario?.productos ?? []}
          filteredInventory={filteredInventory}
          inventoryFilter={inventoryFilter}
          onInventoryFilterChange={setInventoryFilter}
          inventorySort={inventorySort}
          onInventorySortChange={setInventorySort}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          expandedProductIds={expandedProductIds}
          onToggleExpandedProduct={toggleExpandedProduct}
          onSelectSegmentacionItem={setSelectedSegmentacionItem}
          appliedRate={appliedRate}
          loading={loading}
          isDarkMode={isDarkMode}
        />
      )}

      <FifoDetailModal
        selectedFifoItem={selectedFifoItem}
        onClose={() => setSelectedFifoItem(null)}
        isDarkMode={isDarkMode}
      />

      <SegmentacionModal
        selectedSegmentacionItem={selectedSegmentacionItem}
        onClose={() => setSelectedSegmentacionItem(null)}
        isDarkMode={isDarkMode}
      />
    </div>
  );
}
