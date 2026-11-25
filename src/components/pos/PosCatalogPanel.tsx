'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Producto } from '@/types';
import { getOpcionesUnidad, getOpcionUnidad } from '@/lib/unidades';
import { round2 } from '@/lib/pos-calculations';
import {
  filterPosProducts,
  getAvailablePresentationQty,
  normalizePosText,
  parseScannerQuery,
  resolveExactProductMatch,
} from '@/lib/pos-search';
import type { CartItem } from '@/hooks/usePosCart';
import {
  ChevronLeft,
  ChevronRight,
  Coffee,
  CornerDownLeft,
  CupSoda,
  Droplets,
  LayoutGrid,
  List,
  Milk,
  Package,
  Search,
  Star,
  Wheat,
  X,
} from 'lucide-react';

export const CATALOG_PAGE_SIZE = 20;
const FAVORITES_STORAGE_KEY = 'pos_favorite_product_ids_v1';

/**
 * Calcula el siguiente índice en una grilla 2D de `columns` columnas al pulsar flechas.
 */
export function getNextGridIndex(
  currentIdx: number,
  total: number,
  columns: number,
  key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown'
): number {
  if (total <= 0) return 0;
  const cols = Math.max(1, columns);
  const safe = Math.min(Math.max(0, currentIdx), total - 1);

  switch (key) {
    case 'ArrowRight':
      return Math.min(total - 1, safe + 1);
    case 'ArrowLeft':
      return Math.max(0, safe - 1);
    case 'ArrowDown':
      return Math.min(total - 1, safe + cols);
    case 'ArrowUp':
      return Math.max(0, safe - cols);
    default:
      return safe;
  }
}

/**
 * Elige un icono por defecto reconocible según el nombre del producto cuando no tiene imagen cargada.
 */
function ProductDefaultIcon({ name, className }: { name: string; className?: string }) {
  const n = normalizePosText(name);
  if (n.includes('cafe') || n.includes('te ')) return <Coffee className={className} />;
  if (n.includes('refresco') || n.includes('jugo') || n.includes('agua') || n.includes('bebida') || n.includes('cola')) {
    return <CupSoda className={className} />;
  }
  if (n.includes('leche') || n.includes('queso') || n.includes('yogurt')) {
    return <Milk className={className} />;
  }
  if (n.includes('aceite') || n.includes('vinagre') || n.includes('salsa')) {
    return <Droplets className={className} />;
  }
  if (n.includes('harina') || n.includes('arroz') || n.includes('pasta') || n.includes('azucar') || n.includes('pan')) {
    return <Wheat className={className} />;
  }
  return <Package className={className} />;
}

interface PosCatalogPanelProps {
  products: readonly Producto[];
  cart: readonly CartItem[];
  rateValue: number;
  permitirStockNegativo: boolean;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  cardSelectedPres: Record<number, number | null>;
  onSelectCardPres: (productId: number, presId: number | null) => void;
  getCartBaseUnits: (productId: number) => number;
  makeLineId: (productId: number, presId: number | null) => string;
  onAddToCart: (product: Producto, presId: number | null, qty?: number) => void;
  page: number;
  onPageChange: (nextPage: number) => void;
  isActiveZone: boolean;
  onFocusZone: () => void;
  isDarkMode?: boolean;
}

function loadStoredFavorites(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

const PosCatalogPanel = memo(function PosCatalogPanel({
  products,
  cart,
  rateValue,
  permitirStockNegativo,
  searchTerm,
  onSearchTermChange,
  searchInputRef,
  cardSelectedPres,
  onSelectCardPres,
  getCartBaseUnits,
  makeLineId,
  onAddToCart,
  page,
  onPageChange,
  isActiveZone,
  onFocusZone,
  isDarkMode = false,
}: PosCatalogPanelProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<number[]>(() => loadStoredFavorites());
  const [highlightIdx, setHighlightIdx] = useState(0);
  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const toggleFavorite = (productId: number) => {
    setFavoriteIds((prev) => {
      const next = prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId];
      try {
        window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage quota errors
      }
      return next;
    });
  };

  const parsedQuery = useMemo(() => parseScannerQuery(searchTerm), [searchTerm]);

  const filteredProducts = useMemo(
    () => filterPosProducts(products, searchTerm, { onlyFavorites, favoriteIds: favoriteSet }),
    [products, searchTerm, onlyFavorites, favoriteSet]
  );

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / CATALOG_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const pagedProducts = useMemo(() => {
    const start = (safePage - 1) * CATALOG_PAGE_SIZE;
    return filteredProducts.slice(start, start + CATALOG_PAGE_SIZE);
  }, [filteredProducts, safePage]);

  const safeHighlightIdx =
    pagedProducts.length === 0 ? 0 : Math.min(highlightIdx, pagedProducts.length - 1);

  const getCurrentGridColumns = useCallback((): number => {
    if (viewMode === 'list') return 1;
    const el = gridContainerRef.current;
    if (!el || typeof window === 'undefined') return 3;
    const cols = window.getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length;
    return Math.max(1, cols || 3);
  }, [viewMode]);

  useEffect(() => {
    const el = cardRefs.current[safeHighlightIdx];
    if (el && isActiveZone) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [safeHighlightIdx, isActiveZone]);

  const handleTriggerAdd = useCallback(
    (product: Producto, qtyOverride?: number) => {
      const activePresId = cardSelectedPres[product.id] ?? null;
      const activeOpcion = getOpcionUnidad(product, activePresId);
      if (Number(activeOpcion.precio_usd) <= 0) {
        return;
      }
      const qty = qtyOverride ?? 1;
      onAddToCart(product, activePresId, qty);
    },
    [cardSelectedPres, onAddToCart]
  );

  const navigateByArrow = useCallback(
    (key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown') => {
      const cols = getCurrentGridColumns();
      setHighlightIdx((prev) => getNextGridIndex(prev, pagedProducts.length, cols, key));
    },
    [getCurrentGridColumns, pagedProducts.length]
  );

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      navigateByArrow(e.key);
      return;
    }
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !searchTerm) {
      e.preventDefault();
      navigateByArrow(e.key);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (searchTerm.trim()) {
        const exact = resolveExactProductMatch(filteredProducts, searchTerm);
        const target = exact ?? pagedProducts[safeHighlightIdx] ?? null;
        if (target) {
          handleTriggerAdd(target, parsedQuery.quantity);
          onSearchTermChange('');
          setHighlightIdx(0);
          onPageChange(1);
          searchInputRef.current?.focus();
        }
      } else {
        const target = pagedProducts[safeHighlightIdx];
        if (target) {
          handleTriggerAdd(target, 1);
        }
      }
    } else if (e.key === 'Escape' && searchTerm) {
      e.preventDefault();
      e.stopPropagation();
      onSearchTermChange('');
      setHighlightIdx(0);
      onPageChange(1);
    }
  };

  const handleGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowRight' ||
      e.key === 'ArrowUp' ||
      e.key === 'ArrowDown'
    ) {
      e.preventDefault();
      navigateByArrow(e.key);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const target = pagedProducts[safeHighlightIdx];
      if (target) {
        handleTriggerAdd(target, 1);
      }
    }
  };

  return (
    <div
      className={`rounded-2xl border p-3 flex flex-col gap-2.5 h-full transition-colors ${
        isActiveZone
          ? isDarkMode
            ? 'bg-slate-900/90 border-sky-500/60'
            : 'bg-white border-[#0284C7]'
          : isDarkMode
          ? 'bg-slate-900/70 border-slate-800'
          : 'bg-white border-slate-200'
      }`}
      onClick={onFocusZone}
    >
      {/* Buscador / Escáner [F2] + Controles de vista y favoritos */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${
              isDarkMode ? 'text-slate-400' : 'text-slate-500'
            }`}
          />
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onFocus={onFocusZone}
            onChange={(e) => {
              onSearchTermChange(e.target.value);
              setHighlightIdx(0);
              onPageChange(1);
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder="Buscar o escanear [F2] · Usa ←↑↓→ + Enter o 5*código..."
            className={`w-full rounded-xl pl-9 pr-20 py-2 text-xs border font-medium focus:outline-none focus:ring-2 focus:ring-[#0284C7] transition-colors ${
              isDarkMode
                ? 'bg-slate-950 border-slate-700 text-white placeholder-slate-400'
                : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-500'
            }`}
          />
          {parsedQuery.hasMultiplier && (
            <span className="absolute right-16 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-mono text-[10px] font-bold">
              ×{parsedQuery.quantity}
            </span>
          )}
          {searchTerm && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => {
                onSearchTermChange('');
                setHighlightIdx(0);
                onPageChange(1);
                searchInputRef.current?.focus();
              }}
              aria-label="Limpiar búsqueda"
              className="absolute right-9 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <span
            className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-mono tabular-nums ${
              isDarkMode ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            {filteredProducts.length}
          </span>
        </div>

        {/* Filtro Favoritos ★ */}
        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            setOnlyFavorites((v) => !v);
            onPageChange(1);
            setHighlightIdx(0);
          }}
          aria-pressed={onlyFavorites}
          title="Filtrar productos favoritos"
          className={`inline-flex items-center gap-1 px-2.5 py-2 rounded-xl border text-xs font-semibold transition ${
            onlyFavorites
              ? 'bg-[#F59E0B] border-[#D97706] text-[#0F172A]'
              : isDarkMode
              ? 'bg-slate-950 border-slate-700 text-slate-300 hover:bg-slate-800'
              : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Star className={`w-3.5 h-3.5 ${onlyFavorites ? 'fill-current' : ''}`} />
          <span className="hidden xl:inline">Favoritos</span>
          {favoriteIds.length > 0 && (
            <span className="font-mono text-[10px] tabular-nums">({favoriteIds.length})</span>
          )}
        </button>

        {/* Toggle Cuadrícula / Lista */}
        <div
          className={`inline-flex rounded-xl border p-0.5 ${
            isDarkMode ? 'bg-slate-950 border-slate-700' : 'bg-slate-50 border-slate-300'
          }`}
        >
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setViewMode('grid')}
            aria-label="Vista cuadrícula"
            aria-pressed={viewMode === 'grid'}
            className={`p-1.5 rounded-lg transition ${
              viewMode === 'grid'
                ? 'bg-[#0369A1] text-white'
                : isDarkMode
                ? 'text-slate-400 hover:text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setViewMode('list')}
            aria-label="Vista lista densa"
            aria-pressed={viewMode === 'list'}
            className={`p-1.5 rounded-lg transition ${
              viewMode === 'list'
                ? 'bg-[#0369A1] text-white'
                : isDarkMode
                ? 'text-slate-400 hover:text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Indicador de zona activa y guía rápida */}
      <div className="flex items-center justify-between text-[11px] px-0.5 shrink-0">
        <span
          className={`inline-flex items-center gap-1.5 font-semibold ${
            isActiveZone
              ? 'text-[#0369A1] dark:text-sky-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isActiveZone ? 'bg-[#0284C7]' : 'bg-slate-300 dark:bg-slate-600'
            }`}
          />
          {isActiveZone
            ? 'Catálogo activo · Flechas ← ↑ ↓ → para moverte · Enter agrega +1 · Tab va al Ticket'
            : 'Catálogo (F2 para enfocar)'}
        </span>
      </div>

      {/* Área de productos navegable por Tab + Flechas 2D */}
      <div
        tabIndex={0}
        onFocus={onFocusZone}
        onKeyDown={handleGridKeyDown}
        aria-label="Catálogo de productos navegable con flechas y Enter"
        className="flex-1 min-h-0 overflow-y-auto pr-1 focus:outline-none rounded-xl"
      >
        {pagedProducts.length === 0 ? (
          <div
            className={`rounded-xl border p-8 text-center text-xs space-y-2 ${
              isDarkMode
                ? 'bg-slate-950/50 border-slate-800 text-slate-400'
                : 'bg-slate-50 border-slate-200 text-slate-500'
            }`}
          >
            <p className="font-semibold text-sm">
              {onlyFavorites
                ? 'Aún no tienes productos marcados como favoritos.'
                : 'No se encontraron productos con ese criterio.'}
            </p>
            {(searchTerm || onlyFavorites) && (
              <button
                type="button"
                onClick={() => {
                  onSearchTermChange('');
                  setOnlyFavorites(false);
                  onPageChange(1);
                  searchInputRef.current?.focus();
                }}
                className="px-3 py-1.5 rounded-lg bg-[#0369A1] text-white font-semibold hover:bg-[#075985] transition"
              >
                Ver todo el catálogo
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div
            ref={gridContainerRef}
            className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2.5 p-0.5"
          >
            {pagedProducts.map((p, idx) => {
              const opciones = getOpcionesUnidad(p);
              const activePresId = cardSelectedPres[p.id] ?? null;
              const activeOpcion = getOpcionUnidad(p, activePresId);

              const activePriceUsd = Number(activeOpcion.precio_usd) || 0;
              const noPrice = activePriceUsd <= 0;
              const rawTaxPct = p.impuesto_porcentaje;
              const taxPct = rawTaxPct !== undefined && rawTaxPct !== null ? Number(rawTaxPct) : 16.0;
              const activeFinalUsd = round2(activePriceUsd * (1 + taxPct / 100));
              const activePriceLocal = rateValue > 0 ? round2(activeFinalUsd * rateValue) : 0;

              const activeLineId = makeLineId(p.id, activeOpcion.id);
              const currentLineItem = cart.find((c) => c.id === activeLineId);
              const currentQty = currentLineItem ? currentLineItem.cantidad : 0;
              const totalBaseInCart = getCartBaseUnits(p.id);

              const avail = getAvailablePresentationQty({
                stockActual: Number(p.stock_actual) || 0,
                cartBaseUnits: totalBaseInCart,
                presentationFactor: activeOpcion.factor,
                permitirStockNegativo,
              });

              const disabled = noPrice || !avail.canAdd;
              const isFav = favoriteSet.has(p.id);
              const isCursorHere = isActiveZone && idx === safeHighlightIdx;

              return (
                <div
                  key={p.id}
                  ref={(el) => {
                    cardRefs.current[idx] = el;
                  }}
                  role="button"
                  aria-disabled={disabled}
                  aria-current={isCursorHere ? 'true' : undefined}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  onClick={() => {
                    setHighlightIdx(idx);
                    if (!disabled) handleTriggerAdd(p, 1);
                  }}
                  className={`group relative rounded-xl border p-2.5 flex flex-col justify-between gap-2 transition select-none ${
                    disabled
                      ? isDarkMode
                        ? 'bg-slate-950/40 border-slate-800 opacity-55 cursor-not-allowed'
                        : 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                      : 'cursor-pointer active:scale-[0.99]'
                  } ${
                    isCursorHere
                      ? isDarkMode
                        ? 'ring-2 ring-[#0284C7] border-[#0284C7] bg-sky-950/35 shadow-md'
                        : 'ring-2 ring-[#0284C7] border-[#0284C7] bg-[#F0F9FF] shadow-md'
                      : currentQty > 0
                      ? isDarkMode
                        ? 'border-emerald-500/70 bg-emerald-950/20'
                        : 'border-[#15803D] bg-[#F0FDF4]/60'
                      : isFav
                      ? isDarkMode
                        ? 'border-amber-600/60 bg-amber-950/15 hover:border-amber-500'
                        : 'border-[#F59E0B] bg-[#FFFDF5] hover:border-amber-500'
                      : isDarkMode
                      ? 'bg-slate-950/60 border-slate-800 hover:border-slate-600'
                      : 'bg-white border-slate-200 hover:border-slate-400'
                  }`}
                >
                  {/* Fila superior: #ID + Indicador de cursor activo / Favorito / Cantidad */}
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`font-mono text-[10px] font-bold tabular-nums ${
                        isCursorHere
                          ? 'text-[#0369A1] dark:text-sky-300'
                          : isDarkMode
                          ? 'text-slate-400'
                          : 'text-slate-500'
                      }`}
                    >
                      #{p.id}
                    </span>

                    <div className="flex items-center gap-1">
                      {isCursorHere && !disabled && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#0369A1] text-white font-mono text-[9px] font-bold">
                          <CornerDownLeft className="w-2.5 h-2.5" />
                          +1
                        </span>
                      )}
                      {totalBaseInCart > 0 && (
                        <span
                          title={`${totalBaseInCart} ${p.unidad_base || 'unidades'} en carrito`}
                          className="min-w-5 h-5 px-1.5 rounded-full bg-[#15803D] text-white font-mono text-[10px] font-bold inline-flex items-center justify-center tabular-nums"
                        >
                          {currentQty > 0 ? currentQty : `${totalBaseInCart}u`}
                        </span>
                      )}
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(p.id);
                        }}
                        aria-label={isFav ? 'Quitar de favoritos' : 'Marcar como favorito'}
                        className={`p-0.5 rounded transition ${
                          isFav
                            ? 'text-amber-500 hover:text-amber-600'
                            : 'text-slate-300 dark:text-slate-600 hover:text-amber-500'
                        }`}
                      >
                        <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-current' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* Cuerpo con ancla visual: Miniatura 48x48 (foto comprimida o icono por defecto) + Nombre */}
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-12 h-12 rounded-lg border flex items-center justify-center shrink-0 overflow-hidden ${
                        isDarkMode
                          ? 'bg-slate-900 border-slate-700 text-slate-400'
                          : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}
                    >
                      {p.imagen_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.imagen_url}
                          alt={p.nombre}
                          loading="lazy"
                          className="w-full h-full object-contain p-0.5"
                        />
                      ) : (
                        <ProductDefaultIcon name={p.nombre} className="w-5 h-5" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <h4
                        className={`font-bold text-xs leading-snug line-clamp-2 ${
                          isDarkMode ? 'text-slate-100' : 'text-slate-900'
                        }`}
                      >
                        {p.nombre}
                      </h4>
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        <span
                          className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded tabular-nums ${
                            avail.availablePresQty > 5
                              ? isDarkMode
                                ? 'bg-emerald-950/60 text-emerald-300'
                                : 'bg-[#F0FDF4] text-[#15803D]'
                              : avail.availablePresQty > 0
                              ? isDarkMode
                                ? 'bg-amber-950/60 text-amber-300'
                                : 'bg-[#FEF3C7] text-[#92400E]'
                              : isDarkMode
                              ? 'bg-rose-950/60 text-rose-300'
                              : 'bg-[#FEF2F2] text-[#B91C1C]'
                          }`}
                        >
                          {avail.availablePresQty <= 0
                            ? 'Agotado'
                            : `${avail.availablePresQty} ${activeOpcion.nombre}`}
                        </span>
                        {taxPct === 0 && (
                          <span
                            className={`text-[9px] font-semibold px-1 py-0.5 rounded ${
                              isDarkMode
                                ? 'bg-slate-800 text-slate-300'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            Exento
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Chips de presentación (si aplica) */}
                  {opciones.length > 1 && (
                    <div className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                      {opciones.map((opt) => {
                        const isOptActive = activePresId === opt.id;
                        return (
                          <button
                            key={opt.id ?? 'base'}
                            type="button"
                            tabIndex={-1}
                            onClick={() => onSelectCardPres(p.id, opt.id)}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border transition ${
                              isOptActive
                                ? 'bg-[#0369A1] border-[#0369A1] text-white'
                                : isDarkMode
                                ? 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'
                                : 'bg-slate-50 border-slate-300 text-slate-700 hover:border-slate-400'
                            }`}
                          >
                            {opt.nombre}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Pie de precio: USD verde + Bs. azul invariantes */}
                  <div
                    className={`pt-1.5 border-t flex items-baseline justify-between gap-1 ${
                      isDarkMode ? 'border-slate-800' : 'border-slate-100'
                    }`}
                  >
                    {noPrice ? (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-[#FEF3C7] text-[#92400E]">
                        SIN PRECIO
                      </span>
                    ) : (
                      <>
                        <span className="font-mono font-extrabold text-sm tabular-nums text-[#15803D] dark:text-emerald-400">
                          ${activeFinalUsd.toFixed(2)}
                        </span>
                        {rateValue > 0 && (
                          <span className="font-mono font-bold text-[11px] tabular-nums text-[#0369A1] dark:text-sky-400 truncate">
                            {activePriceLocal.toLocaleString('es-VE', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{' '}
                            Bs
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Vista Lista Densa */
          <div
            className={`rounded-xl border divide-y overflow-hidden ${
              isDarkMode
                ? 'bg-slate-950/60 border-slate-800 divide-slate-800'
                : 'bg-white border-slate-200 divide-slate-100'
            }`}
          >
            {pagedProducts.map((p, idx) => {
              const opciones = getOpcionesUnidad(p);
              const activePresId = cardSelectedPres[p.id] ?? null;
              const activeOpcion = getOpcionUnidad(p, activePresId);
              const activePriceUsd = Number(activeOpcion.precio_usd) || 0;
              const noPrice = activePriceUsd <= 0;
              const rawTaxPct = p.impuesto_porcentaje;
              const taxPct = rawTaxPct !== undefined && rawTaxPct !== null ? Number(rawTaxPct) : 16.0;
              const activeFinalUsd = round2(activePriceUsd * (1 + taxPct / 100));
              const activePriceLocal = rateValue > 0 ? round2(activeFinalUsd * rateValue) : 0;
              const totalBaseInCart = getCartBaseUnits(p.id);

              const avail = getAvailablePresentationQty({
                stockActual: Number(p.stock_actual) || 0,
                cartBaseUnits: totalBaseInCart,
                presentationFactor: activeOpcion.factor,
                permitirStockNegativo,
              });
              const disabled = noPrice || !avail.canAdd;
              const isCursorHere = isActiveZone && idx === safeHighlightIdx;

              return (
                <div
                  key={p.id}
                  ref={(el) => {
                    cardRefs.current[idx] = el;
                  }}
                  role="button"
                  onMouseEnter={() => setHighlightIdx(idx)}
                  onClick={() => {
                    setHighlightIdx(idx);
                    if (!disabled) handleTriggerAdd(p, 1);
                  }}
                  className={`px-3 py-2 flex items-center justify-between gap-2.5 text-xs transition ${
                    disabled ? 'opacity-55 cursor-not-allowed' : 'cursor-pointer'
                  } ${
                    isCursorHere
                      ? isDarkMode
                        ? 'bg-sky-900/40 ring-1 ring-inset ring-[#0284C7]'
                        : 'bg-[#E0F2FE] ring-1 ring-inset ring-[#0284C7]'
                      : isDarkMode
                      ? 'hover:bg-slate-800/70'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div
                      className={`w-7 h-7 rounded-md border flex items-center justify-center shrink-0 overflow-hidden ${
                        isDarkMode
                          ? 'bg-slate-900 border-slate-700 text-slate-400'
                          : 'bg-slate-50 border-slate-200 text-slate-500'
                      }`}
                    >
                      {p.imagen_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.imagen_url}
                          alt={p.nombre}
                          loading="lazy"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <ProductDefaultIcon name={p.nombre} className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <span className="font-mono text-[10px] text-slate-400 w-7 shrink-0">#{p.id}</span>
                    <span className="font-semibold truncate">{p.nombre}</span>
                    {opciones.length > 1 && (
                      <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {opciones.map((opt) => (
                          <button
                            key={opt.id ?? 'base'}
                            type="button"
                            tabIndex={-1}
                            onClick={() => onSelectCardPres(p.id, opt.id)}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                              activePresId === opt.id
                                ? 'bg-[#0369A1] border-[#0369A1] text-white'
                                : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {opt.nombre}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <span
                      className={`font-mono text-[11px] font-bold tabular-nums ${
                        avail.availablePresQty <= 0
                          ? 'text-[#B91C1C] dark:text-rose-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {avail.availablePresQty <= 0 ? 'Agotado' : `${avail.availablePresQty} disp`}
                    </span>
                    <span className="font-mono font-extrabold tabular-nums text-[#15803D] dark:text-emerald-400 w-14 text-right">
                      {noPrice ? 'N/A' : `$${activeFinalUsd.toFixed(2)}`}
                    </span>
                    {rateValue > 0 && !noPrice && (
                      <span className="font-mono font-bold tabular-nums text-[#0369A1] dark:text-sky-400 w-24 text-right hidden xl:inline">
                        {activePriceLocal.toLocaleString('es-VE', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        Bs
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Paginación fija 20 ítems/pág (PgUp / PgDn) */}
      {totalPages > 1 && (
        <div
          className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl border text-xs shrink-0 ${
            isDarkMode
              ? 'bg-slate-950 border-slate-800 text-slate-300'
              : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}
        >
          <span className="font-mono tabular-nums text-[11px]">
            Pág. {safePage}/{totalPages} · {filteredProducts.length} productos
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              tabIndex={-1}
              disabled={safePage <= 1}
              onClick={() => onPageChange(safePage - 1)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>PgUp</span>
            </button>
            <button
              type="button"
              tabIndex={-1}
              disabled={safePage >= totalPages}
              onClick={() => onPageChange(safePage + 1)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <span>PgDn</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

export default PosCatalogPanel;
