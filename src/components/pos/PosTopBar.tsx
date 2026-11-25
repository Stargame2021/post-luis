'use client';

import { useMemo } from 'react';
import type { Tercero } from '@/types';
import {
  AlertTriangle,
  Keyboard,
  RefreshCw,
  Search,
  User,
  UserPlus,
  Volume2,
  VolumeX,
} from 'lucide-react';

/**
 * Normaliza texto eliminando diacríticos y espacios extra para búsquedas rápidas en caja.
 */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Filtra clientes por Cédula/RIF o Nombre/Razón Social de forma insensible a acentos y mayúsculas.
 */
export function filterPosClients(clients: readonly Tercero[], query: string): Tercero[] {
  const norm = normalizeSearchText(query);
  if (!norm) return [...clients];
  return clients.filter((c) => {
    const idNorm = normalizeSearchText(c.identificacion || '');
    const nameNorm = normalizeSearchText(c.razon_social_nombre || '');
    const phoneNorm = normalizeSearchText(c.telefono || '');
    return idNorm.includes(norm) || nameNorm.includes(norm) || phoneNorm.includes(norm);
  });
}

/**
 * Resuelve el cliente por defecto (mostrador `V-00000000` o el primero disponible) sin hardcodear `id === 1`.
 */
export function resolveDefaultClient(clients: readonly Tercero[]): Tercero | null {
  if (clients.length === 0) return null;
  const generic = clients.find(
    (c) =>
      normalizeSearchText(c.identificacion || '') === 'v-00000000' ||
      normalizeSearchText(c.razon_social_nombre || '').includes('generico') ||
      normalizeSearchText(c.razon_social_nombre || '').includes('mostrador')
  );
  return generic ?? clients[0];
}

interface PosTopBarProps {
  rateValue: number;
  onOpenRates: () => void;
  clients: readonly Tercero[];
  selectedClientId: number | null;
  onOpenClientSearch: () => void;
  onOpenQuickClient: () => void;
  permitirStockNegativo: boolean;
  onToggleStockNegativo: (next: boolean) => void;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  onOpenShortcuts: () => void;
  initialLoadError: string | null;
  onRetryInitialLoad: () => void;
  isDarkMode?: boolean;
}

export default function PosTopBar({
  rateValue,
  onOpenRates,
  clients,
  selectedClientId,
  onOpenClientSearch,
  onOpenQuickClient,
  permitirStockNegativo,
  onToggleStockNegativo,
  soundEnabled = true,
  onToggleSound,
  onOpenShortcuts,
  initialLoadError,
  onRetryInitialLoad,
  isDarkMode = false,
}: PosTopBarProps) {
  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) ?? resolveDefaultClient(clients),
    [clients, selectedClientId]
  );

  return (
    <div
      className={`rounded-2xl border px-3 py-2 flex flex-wrap items-center justify-between gap-2.5 transition-colors ${
        isDarkMode
          ? 'bg-slate-900 border-slate-800 text-slate-100'
          : 'bg-white border-slate-200 text-slate-900'
      }`}
    >
      {/* Izquierda: Tasa BCV (azul Bs. invariante o alerta accionable) */}
      <div className="flex items-center gap-2 shrink-0">
        {rateValue > 0 ? (
          <button
            type="button"
            onClick={onOpenRates}
            title="Haz clic para actualizar o consultar la tasa BCV"
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
              isDarkMode
                ? 'bg-sky-950/50 border-sky-800 text-sky-300 hover:bg-sky-950/80'
                : 'bg-[#F0F9FF] border-[#BAE6FD] text-[#0369A1] hover:bg-sky-100/70'
            }`}
          >
            <span className="text-[11px] font-bold uppercase tracking-wide opacity-80">BCV</span>
            <span className="font-mono font-bold tabular-nums">
              {rateValue.toLocaleString('es-VE', {
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
              })}{' '}
              Bs/$
            </span>
          </button>
        ) : (
          <div
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
              isDarkMode
                ? 'bg-amber-950/50 border-amber-700 text-amber-200'
                : 'bg-[#FEF3C7] border-[#F59E0B] text-[#92400E]'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Sin tasa BCV</span>
            <button
              type="button"
              onClick={onOpenRates}
              className="px-2 py-0.5 rounded-md bg-amber-600 text-white text-[11px] font-bold hover:bg-amber-700 transition"
            >
              Configurar Tasa
            </button>
          </div>
        )}

        {initialLoadError && (
          <button
            type="button"
            onClick={onRetryInitialLoad}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition ${
              isDarkMode
                ? 'bg-rose-950/50 border-rose-800 text-rose-300 hover:bg-rose-950'
                : 'bg-[#FEF2F2] border-[#DC2626] text-[#B91C1C] hover:bg-rose-100'
            }`}
            title={initialLoadError}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reintentar catálogos</span>
          </button>
        )}
      </div>

      {/* Centro: Botón de Cliente activo (abre diálogo de búsqueda [F3]) + Cliente Rápido [Alt+N] */}
      <div className="flex items-center gap-1.5 flex-1 min-w-[240px] max-w-lg">
        <button
          type="button"
          onClick={onOpenClientSearch}
          title="Abrir diálogo de búsqueda de clientes (F3 o Alt+C)"
          className={`flex-1 min-w-0 inline-flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium text-left transition focus:outline-none focus:ring-2 focus:ring-[#0284C7] ${
            isDarkMode
              ? 'bg-slate-950 border-slate-700 text-slate-100 hover:bg-slate-800/80'
              : 'bg-slate-50 border-slate-300 text-slate-900 hover:bg-slate-100/80'
          }`}
        >
          <span className="inline-flex items-center gap-2 min-w-0">
            <User className="w-3.5 h-3.5 text-[#0369A1] dark:text-sky-400 shrink-0" />
            <span className="truncate">
              {selectedClient ? (
                <>
                  <span className="font-mono font-bold mr-1.5">{selectedClient.identificacion}</span>
                  <span>{selectedClient.razon_social_nombre}</span>
                </>
              ) : (
                'Seleccionar cliente...'
              )}
            </span>
          </span>
          <span className="inline-flex items-center gap-1 shrink-0">
            <Search className="w-3.5 h-3.5 opacity-60" />
            <kbd
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                isDarkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-200/80 text-slate-700'
              }`}
            >
              F3
            </kbd>
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenQuickClient}
          title="Registrar nuevo cliente rápido (Alt+N)"
          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-semibold shrink-0 transition ${
            isDarkMode
              ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
              : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Nuevo</span>
          <kbd className="hidden md:inline text-[10px] font-mono opacity-70">Alt+N</kbd>
        </button>
      </div>

      {/* Derecha: Stock Negativo + Atajos [F1] */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => onToggleStockNegativo(!permitirStockNegativo)}
          aria-pressed={permitirStockNegativo}
          title="Permitir vender productos sin stock disponible"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition ${
            permitirStockNegativo
              ? isDarkMode
                ? 'bg-amber-950/60 border-amber-600 text-amber-300'
                : 'bg-[#FEF3C7] border-[#F59E0B] text-[#92400E]'
              : isDarkMode
              ? 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              permitirStockNegativo ? 'bg-amber-500' : 'bg-slate-400'
            }`}
          />
          <span className="hidden xl:inline">Stock negativo</span>
          <span className="xl:hidden">Stock -</span>
        </button>

        {onToggleSound && (
          <button
            type="button"
            onClick={onToggleSound}
            aria-pressed={soundEnabled}
            title={soundEnabled ? 'Silenciar sonidos de caja' : 'Activar sonidos de caja'}
            className={`p-1.5 rounded-xl border text-xs transition ${
              isDarkMode
                ? 'bg-slate-950 border-slate-700 text-slate-300 hover:bg-slate-800'
                : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5 opacity-60" />}
          </button>
        )}

        <button
          type="button"
          onClick={onOpenShortcuts}
          title="Ver atajos de teclado (F1 o Alt+H)"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition ${
            isDarkMode
              ? 'bg-slate-950 border-slate-700 text-slate-200 hover:bg-slate-800'
              : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Keyboard className="w-3.5 h-3.5" />
          <span className="font-mono text-[11px]">F1</span>
        </button>
      </div>
    </div>
  );
}
