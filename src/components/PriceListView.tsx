'use client';

import { useState, useMemo, useRef } from 'react';
import { Producto, Tasa } from '@/types';
import { getOpcionesUnidad, OpcionUnidad, formatStockDesgloseCompleto } from '@/lib/unidades';
import {
  Tag,
  Search,
  Calculator,
  Package,
  Layers,
  TrendingUp,
  RotateCcw,
  ShoppingBag,
  Info,
  CheckCircle2,
  AlertCircle,
  Hash,
  Trash2,
  Plus,
  Minus,
  Check,
} from 'lucide-react';

interface PriceListItem {
  id: string; // ID único único por fila (UUID o timestamp + random)
  product: Producto;
  opcion: OpcionUnidad;
  cantidad: string;
}

interface PriceListViewProps {
  products: Producto[];
  currentRate: Tasa | null;
  isDarkMode?: boolean;
}

export default function PriceListView({
  products,
  currentRate,
  isDarkMode = false,
}: PriceListViewProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItems, setSelectedItems] = useState<PriceListItem[]>([]);
  const [filtroStock, setFiltroStock] = useState<'todos' | 'con_stock' | 'agotados'>('todos');

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Tasa de cambio en formato numérico
  const rate = currentRate ? Number(currentRate.tasa) : 0;
  const rateFormatted = rate > 0 ? rate.toFixed(4) : '0.0000';

  // Productos activos filtrados
  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => p.activo !== false)
      .filter((p) => {
        const stock = Number(p.stock_actual) || 0;
        if (filtroStock === 'con_stock') return stock > 0;
        if (filtroStock === 'agotados') return stock <= 0;
        return true;
      })
      .filter((p) => {
        if (!searchTerm.trim()) return true;
        const term = searchTerm.toLowerCase();
        const matchesName = p.nombre.toLowerCase().includes(term);
        const matchesPresentaciones = (p.presentaciones || []).some((pres) =>
          pres.nombre.toLowerCase().includes(term)
        );
        return matchesName || matchesPresentaciones;
      });
  }, [products, searchTerm, filtroStock]);

  // Agregar una presentación específica o la unidad base a la cotización
  const handleAddPresentation = (p: Producto, opc: OpcionUnidad, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    // Ver si ya existe exactamente esta misma combinación (mismo producto y misma presentación)
    const existingIndex = selectedItems.findIndex(
      (it) => it.product.id === p.id && it.opcion.id === opc.id
    );

    if (existingIndex >= 0) {
      // Si ya está exactamente esa presentación, incrementamos su cantidad en +1
      setSelectedItems((prev) =>
        prev.map((it, idx) => {
          if (idx !== existingIndex) return it;
          const curr = parseFloat(it.cantidad) || 0;
          return { ...it, cantidad: String(curr + 1) };
        })
      );
    } else {
      // Si no existe, creamos una nueva fila independiente con su ID único
      const uniqueId = `item_${p.id}_${opc.id ?? 'base'}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const newItem: PriceListItem = {
        id: uniqueId,
        product: p,
        opcion: opc,
        cantidad: '1',
      };
      setSelectedItems((prev) => [...prev, newItem]);
    }
  };

  // Al hacer clic en la tarjeta del producto, agrega la unidad base por defecto
  const handleCardClick = (p: Producto) => {
    const opciones = getOpcionesUnidad(p);
    handleAddPresentation(p, opciones[0]);
  };

  // Cambiar la presentación de una fila específica directamente
  const handleChangeItemPresentation = (itemId: string, newOpc: OpcionUnidad) => {
    setSelectedItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, opcion: newOpc } : it))
    );
  };

  // Modificar cantidad de una fila específica por teclado
  const handleUpdateCantidad = (itemId: string, val: string) => {
    setSelectedItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, cantidad: val } : it))
    );
  };

  // Ajustar cantidad de una fila con botones (+ o -)
  const handleStepCantidad = (itemId: string, delta: number) => {
    setSelectedItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const curr = parseFloat(it.cantidad) || 0;
        const nextVal = Math.max(1, curr + delta);
        return { ...it, cantidad: String(nextVal) };
      })
    );
  };

  // Eliminar una fila específica de la cotización
  const handleRemoveItem = (itemId: string) => {
    setSelectedItems((prev) => prev.filter((it) => it.id !== itemId));
  };

  // Limpiar todos los productos seleccionados
  const handleClearAll = () => {
    setSelectedItems([]);
  };

  // Cálculos detallados por cada fila de cotización y totales generales
  const { detailedItems, grandTotalUsd, grandTotalBs, totalSubtotalUsd, totalTaxUsd } = useMemo(() => {
    let sumSubtotalUsd = 0;
    let sumTaxUsd = 0;
    let sumTotalUsd = 0;
    let sumTotalBs = 0;

    const list = selectedItems.map((item) => {
      const qty = Math.max(0, parseFloat(item.cantidad) || 0);
      const unitPriceUsd = item.opcion.precio_usd;
      const unitPriceBs = unitPriceUsd * rate;

      const taxRate = Number(item.product.impuesto_porcentaje) || 0;
      const isExento = taxRate === 0;

      const subtotalUsd = unitPriceUsd * qty;
      const taxAmountUsd = subtotalUsd * (taxRate / 100);
      const totalUsd = subtotalUsd + taxAmountUsd;

      const subtotalBs = subtotalUsd * rate;
      const taxAmountBs = taxAmountUsd * rate;
      const totalBs = totalUsd * rate;

      const baseUnitsRequired = qty * item.opcion.factor;
      const currentStock = Number(item.product.stock_actual) || 0;
      const hasEnoughStock = currentStock >= baseUnitsRequired;

      sumSubtotalUsd += subtotalUsd;
      sumTaxUsd += taxAmountUsd;
      sumTotalUsd += totalUsd;
      sumTotalBs += totalBs;

      return {
        ...item,
        qty,
        unitPriceUsd,
        unitPriceBs,
        taxRate,
        isExento,
        subtotalUsd,
        taxAmountUsd,
        totalUsd,
        subtotalBs,
        taxAmountBs,
        totalBs,
        baseUnitsRequired,
        currentStock,
        hasEnoughStock,
      };
    });

    return {
      detailedItems: list,
      totalSubtotalUsd: sumSubtotalUsd,
      totalTaxUsd: sumTaxUsd,
      grandTotalUsd: sumTotalUsd,
      grandTotalBs: sumTotalBs,
    };
  }, [selectedItems, rate]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header / Banner de Lista de Precios */}
      <div
        className={`p-6 rounded-3xl border transition-all ${
          isDarkMode
            ? 'bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border-slate-800 shadow-xl'
            : 'bg-gradient-to-r from-white via-indigo-50/50 to-white border-slate-200/90 shadow-sm'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              <Tag className="w-3.5 h-3.5" />
              Módulo de Consulta Rápida
            </div>
            <h1
              className={`text-2xl sm:text-3xl font-black tracking-tight ${
                isDarkMode ? 'text-white' : 'text-slate-900'
              }`}
            >
              Lista de Precios & Cotizador
            </h1>
            <p className={`text-xs sm:text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Consulta artículos por unidad o presentación (bulto, caja, etc.) y cotiza múltiples productos a la vez.
            </p>
          </div>

          {/* Tarjeta de Tasa Oficial en Vivo */}
          <div
            className={`px-5 py-3 rounded-2xl border flex items-center gap-4 ${
              isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                Tasa BCV del Día
              </span>
              <div className="flex items-baseline gap-1">
                <span className="font-mono font-black text-xl text-emerald-600 dark:text-emerald-400">
                  {rateFormatted}
                </span>
                <span className="text-xs font-semibold text-slate-400">Bs./$</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Panel Principal: Grid de 2 Columnas (Buscador a la izquierda, Cotizador a la derecha) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COLUMNA IZQUIERDA: Catálogo de Productos (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Barra de Búsqueda y Filtros */}
          <div
            className={`p-4 rounded-2xl border transition-colors ${
              isDarkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Input de Búsqueda */}
              <div className="relative flex-1">
                <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar producto por nombre o presentación..."
                  className={`w-full pl-11 pr-4 py-2.5 rounded-xl text-sm font-medium border outline-none transition ${
                    isDarkMode
                      ? 'bg-slate-950/70 border-slate-700 text-white placeholder-slate-500 focus:border-indigo-500'
                      : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:bg-white'
                  }`}
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    Limpiar
                  </button>
                )}
              </div>

              {/* Selector de filtro por stock */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-semibold shrink-0">
                <button
                  type="button"
                  onClick={() => setFiltroStock('todos')}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    filtroStock === 'todos'
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Todos ({products.filter((p) => p.activo !== false).length})
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroStock('con_stock')}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    filtroStock === 'con_stock'
                      ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  En Existencia
                </button>
                <button
                  type="button"
                  onClick={() => setFiltroStock('agotados')}
                  className={`px-3 py-1.5 rounded-lg transition ${
                    filtroStock === 'agotados'
                      ? 'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Agotados
                </button>
              </div>
            </div>
          </div>

          {/* Lista de Productos Encontrados */}
          <div className="space-y-2.5 max-h-[660px] overflow-y-auto pr-1">
            {filteredProducts.length === 0 ? (
              <div
                className={`p-12 text-center rounded-2xl border ${
                  isDarkMode ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-slate-200'
                }`}
              >
                <Package className="w-12 h-12 mx-auto text-slate-400 mb-3 opacity-40" />
                <h3 className="font-bold text-base text-slate-700 dark:text-slate-300">
                  No se encontraron productos
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Intenta buscando con otra palabra o cambia el filtro de existencias.
                </p>
              </div>
            ) : (
              filteredProducts.map((p) => {
                const opciones = getOpcionesUnidad(p);
                const taxRate = Number(p.impuesto_porcentaje) || 0;
                const multiplier = 1 + taxRate / 100;

                // Precio final con impuesto incluido
                const basePriceNetUsd = Number(p.precio_usd) || 0;
                const baseFinalPriceUsd = basePriceNetUsd * multiplier;
                const baseFinalPriceBs = baseFinalPriceUsd * rate;
                const stock = Number(p.stock_actual) || 0;
                const isOutOfStock = stock <= 0;

                // Contar cuántas veces está este producto en la cotización
                const occurrencesInCotizacion = selectedItems.filter((it) => it.product.id === p.id);

                return (
                  <div
                    key={p.id}
                    onClick={() => handleCardClick(p)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer relative group ${
                      occurrencesInCotizacion.length > 0
                        ? isDarkMode
                          ? 'bg-indigo-950/40 border-indigo-500/80 shadow-md ring-1 ring-indigo-500/30'
                          : 'bg-indigo-50/80 border-indigo-400/80 shadow-sm ring-1 ring-indigo-400/30'
                        : isDarkMode
                        ? 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                        : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50/50 shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Información del Producto */}
                      <div className="space-y-2 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4
                            className={`font-bold text-sm sm:text-base leading-snug break-words ${
                              occurrencesInCotizacion.length > 0
                                ? 'text-indigo-600 dark:text-indigo-400'
                                : isDarkMode
                                ? 'text-white group-hover:text-indigo-400'
                                : 'text-slate-900 group-hover:text-indigo-600'
                            }`}
                          >
                            {p.nombre}
                          </h4>

                          {occurrencesInCotizacion.length > 0 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-600 text-white flex items-center gap-1 shadow-sm">
                              <Check className="w-3 h-3" />
                              {occurrencesInCotizacion.length === 1
                                ? 'En Cotización'
                                : `${occurrencesInCotizacion.length} en Cotización`}
                            </span>
                          )}

                          {isOutOfStock ? (
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                              Agotado
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              Stock: {formatStockDesgloseCompleto(p)}
                            </span>
                          )}

                          {taxRate > 0 ? (
                            <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              IVA {taxRate}% Incl.
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/20">
                              Exento
                            </span>
                          )}
                        </div>

                        {/* Lista de Presentaciones en Líneas Individuales */}
                        <div className="pt-1.5 space-y-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                            Presentaciones Disponibles:
                          </span>
                          <div className="space-y-1">
                            {opciones.map((opc, idx) => {
                              const isThisPresAdded = occurrencesInCotizacion.some(
                                (it) => it.opcion.id === opc.id
                              );
                              const opcFinalPriceUsd = opc.precio_usd * multiplier;
                              const opcFinalPriceBs = opcFinalPriceUsd * rate;

                              return (
                                <div
                                  key={idx}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAddPresentation(p, opc);
                                  }}
                                  className={`flex items-center justify-between p-2 rounded-xl border text-xs transition cursor-pointer ${
                                    isThisPresAdded
                                      ? isDarkMode
                                        ? 'bg-indigo-950/60 border-indigo-500/80'
                                        : 'bg-indigo-50/90 border-indigo-300'
                                      : isDarkMode
                                      ? 'bg-slate-800/60 hover:bg-slate-800 border-slate-700/80'
                                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`p-1 rounded-md text-[10px] font-bold ${
                                        isThisPresAdded
                                          ? 'bg-indigo-600 text-white'
                                          : isDarkMode
                                          ? 'bg-slate-700 text-slate-300'
                                          : 'bg-slate-200 text-slate-700'
                                      }`}
                                    >
                                      <Plus className="w-3 h-3" />
                                    </span>
                                    <span className="font-bold text-slate-800 dark:text-slate-100">
                                      {opc.nombre}
                                    </span>
                                    {opc.factor > 1 && (
                                      <span className="text-[10px] font-mono text-slate-400">
                                        (x{opc.factor} {p.unidad_base || 'unid'})
                                      </span>
                                    )}
                                  </div>

                                  <div className="text-right">
                                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                      ${opcFinalPriceUsd.toFixed(2)}
                                    </span>
                                    <span className="font-mono text-[10px] text-slate-400 ml-2">
                                      {opcFinalPriceBs.toLocaleString('es-VE', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}{' '}
                                      Bs.
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Precios Principales (Precio Final Unidad Base) */}
                      <div className="text-right shrink-0">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                          Unidad Base
                        </div>
                        <div className="font-mono font-black text-lg text-emerald-600 dark:text-emerald-400 leading-tight">
                          ${baseFinalPriceUsd.toFixed(2)}
                        </div>
                        <div className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">
                          {baseFinalPriceBs.toLocaleString('es-VE', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{' '}
                          <span className="text-[10px]">Bs.</span>
                        </div>
                        {taxRate > 0 && (
                          <div className="text-[9px] font-mono text-slate-400 mt-0.5">
                            (Base: ${basePriceNetUsd.toFixed(2)})
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* COLUMNA DERECHA: Cotizador / Calculadora Multi-Producto (5 cols) */}
        <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-20">
          <div
            className={`p-6 rounded-3xl border transition-all ${
              isDarkMode
                ? 'bg-slate-900 border-slate-800 shadow-2xl'
                : 'bg-white border-slate-200/90 shadow-lg'
            }`}
          >
            {/* Header del panel del Cotizador */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  <Calculator className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    className={`font-black text-base flex items-center gap-2 ${
                      isDarkMode ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    Calculadora / Cotizador
                    {selectedItems.length > 0 && (
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                        {selectedItems.length} {selectedItems.length === 1 ? 'ítem' : 'ítems'}
                      </span>
                    )}
                  </h3>
                  <span className="text-xs text-slate-400">
                    Suma productos para dar el total exacto al cliente
                  </span>
                </div>
              </div>

              {selectedItems.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  title="Vaciar cotización"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition flex items-center gap-1 text-xs font-semibold"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Limpiar</span>
                </button>
              )}
            </div>

            {selectedItems.length === 0 ? (
              <div className="py-14 text-center space-y-3">
                <ShoppingBag className="w-12 h-12 mx-auto text-indigo-400/40 animate-bounce" />
                <h4 className="font-bold text-sm text-slate-600 dark:text-slate-300">
                  No hay productos en la cotización
                </h4>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  Haz clic en un producto o en sus presentaciones (Bulto, Unidad) para calcular cantidades y dar el monto global al cliente.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-4 animate-in fade-in duration-200">
                {/* Lista de Filas de Productos Agregadas a la Cotización */}
                <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                  {detailedItems.map((item) => {
                    const opciones = getOpcionesUnidad(item.product);

                    return (
                      <div
                        key={item.id}
                        className={`p-3.5 rounded-2xl border transition-all ${
                          isDarkMode
                            ? 'bg-slate-950/60 border-slate-800'
                            : 'bg-slate-50/80 border-slate-200 shadow-sm'
                        }`}
                      >
                        {/* Cabecera del ítem: Nombre y Precios */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0 flex-1">
                            <h5
                              className={`font-bold text-xs truncate ${
                                isDarkMode ? 'text-white' : 'text-slate-900'
                              }`}
                            >
                              {item.product.nombre}
                            </h5>

                            {/* Selector o Píldoras de presentación directa por fila (precios con IVA) */}
                            {opciones.length > 1 ? (
                              <div className="flex flex-wrap items-center gap-1 mt-1">
                                {opciones.map((opc, opcIdx) => {
                                  const isCurrent = item.opcion.id === opc.id;
                                  const rawPct = item.product.impuesto_porcentaje;
                                  const itemTaxPct =
                                    rawPct !== undefined && rawPct !== null ? Number(rawPct) : 16;
                                  const opcFinalUsd = opc.precio_usd * (1 + itemTaxPct / 100);
                                  return (
                                    <button
                                      key={opcIdx}
                                      type="button"
                                      onClick={() => handleChangeItemPresentation(item.id, opc)}
                                      className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition ${
                                        isCurrent
                                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                          : isDarkMode
                                          ? 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600'
                                          : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-300'
                                      }`}
                                    >
                                      {opc.nombre} (${opcFinalUsd.toFixed(2)})
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <span className="text-[10px] font-medium text-slate-400">
                                {item.opcion.nombre} · ${(item.unitPriceUsd * (1 + item.taxRate / 100)).toFixed(2)} c/IVA
                              </span>
                            )}
                          </div>

                          {/* Subtotal del ítem en USD y Bs */}
                          <div className="text-right shrink-0">
                            <span className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400 block leading-tight">
                              ${item.totalUsd.toFixed(2)}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">
                              {item.totalBs.toLocaleString('es-VE', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}{' '}
                              Bs.
                            </span>
                          </div>

                          {/* Botón eliminar ítem de la fila */}
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition shrink-0 ml-1"
                            title="Quitar este ítem"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Fila de Controles: Botones de incremento, Input limpio y alerta de stock */}
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
                          {/* Control de Cantidad por Teclado (sin scroll ni spinners) */}
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleStepCantidad(item.id, -1)}
                              className="w-7 h-7 rounded-lg border flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                            >
                              <Minus className="w-3 h-3" />
                            </button>

                            <input
                              type="number"
                              min="0.01"
                              step="any"
                              value={item.cantidad}
                              onChange={(e) => handleUpdateCantidad(item.id, e.target.value)}
                              onWheel={(e) => (e.target as HTMLElement).blur()}
                              onKeyDown={(e) => {
                                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                  e.preventDefault();
                                }
                              }}
                              className={`w-14 py-1 text-center font-mono font-bold text-xs rounded-lg border outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition ${
                                isDarkMode
                                  ? 'bg-slate-900 border-slate-700 text-white focus:border-indigo-500'
                                  : 'bg-white border-slate-300 text-slate-900 focus:border-indigo-500'
                              }`}
                            />

                            <button
                              type="button"
                              onClick={() => handleStepCantidad(item.id, 1)}
                              className="w-7 h-7 rounded-lg border flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Estado de existencias */}
                          <div className="text-[10px] font-semibold text-right">
                            {item.hasEnoughStock ? (
                              <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                Stock OK ({item.currentStock})
                              </span>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                Falta stock ({item.currentStock})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Panel de Totales Globales */}
                <div
                  className={`p-5 rounded-2xl border space-y-3 ${
                    isDarkMode ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>Subtotal de productos</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                      ${totalSubtotalUsd.toFixed(2)}
                    </span>
                  </div>

                  {totalTaxUsd > 0 && (
                    <div className="flex items-center justify-between text-xs text-amber-600 dark:text-amber-400">
                      <span>IVA estimado acumulado</span>
                      <span className="font-mono font-semibold">+${totalTaxUsd.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] uppercase font-black tracking-wider text-indigo-500 block">
                        Gran Total Cotizado
                      </span>
                      <span className="text-xs text-slate-400">
                        {selectedItems.length} {selectedItems.length === 1 ? 'ítem' : 'ítems'}
                      </span>
                    </div>

                    <div className="text-right">
                      {/* Gran Total en USD */}
                      <div className="font-mono font-black text-2xl text-emerald-600 dark:text-emerald-400 leading-none">
                        ${grandTotalUsd.toFixed(2)}
                      </div>
                      {/* Gran Total en Bolívares */}
                      <div className="font-mono font-bold text-base text-indigo-600 dark:text-indigo-400 mt-1">
                        {grandTotalBs.toLocaleString('es-VE', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        <span className="text-xs">Bs.</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Nota para empleados */}
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>
                    Monto total calculado a la tasa BCV oficial activa ({rateFormatted} Bs./$).
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
