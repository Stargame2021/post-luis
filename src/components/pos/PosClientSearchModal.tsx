'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Tercero } from '@/types';
import Dialog from '@/components/ui/Dialog';
import { filterPosClients } from '@/components/pos/PosTopBar';
import { Check, Search, User, UserPlus, X } from 'lucide-react';

interface PosClientSearchModalProps {
  open: boolean;
  onClose: () => void;
  onAfterClose?: () => void;
  clients: readonly Tercero[];
  selectedClientId: number | null;
  onSelectClient: (client: Tercero) => void;
  onOpenQuickClient: () => void;
  isDarkMode?: boolean;
}

export default function PosClientSearchModal({
  open,
  onClose,
  onAfterClose,
  clients,
  selectedClientId,
  onSelectClient,
  onOpenQuickClient,
  isDarkMode = false,
}: PosClientSearchModalProps) {
  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const filteredClients = useMemo(
    () => filterPosClients(clients, query).slice(0, 60),
    [clients, query]
  );

  const safeHighlightIdx =
    filteredClients.length === 0 ? 0 : Math.min(highlightIdx, filteredClients.length - 1);

  useEffect(() => {
    if (!open) return;
    const raf = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = itemRefs.current[safeHighlightIdx];
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, safeHighlightIdx]);

  const handleClose = () => {
    setQuery('');
    setHighlightIdx(0);
    onClose();
  };

  const handleChoose = (client: Tercero) => {
    onSelectClient(client);
    setQuery('');
    setHighlightIdx(0);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      onAfterClose={onAfterClose}
      titleId="pos-client-search-modal-title"
      maxWidthClass="max-w-xl"
      showCloseButton
      isDarkMode={isDarkMode}
    >
      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 pr-8">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                isDarkMode ? 'bg-sky-950/60 text-sky-400' : 'bg-[#F0F9FF] text-[#0369A1]'
              }`}
            >
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 id="pos-client-search-modal-title" className="text-base font-bold leading-tight">
                Seleccionar Cliente
              </h3>
              <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Busca por Cédula, RIF o Nombre · Usa ↑/↓ y Enter para elegir rápido
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              handleClose();
              onOpenQuickClient();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0369A1] text-white text-xs font-semibold hover:bg-[#075985] transition shrink-0"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Nuevo [Alt+N]</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search
            className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none ${
              isDarkMode ? 'text-slate-400' : 'text-slate-500'
            }`}
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlightIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlightIdx((i) => Math.min(filteredClients.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlightIdx((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const target = filteredClients[safeHighlightIdx];
                if (target) handleChoose(target);
              }
            }}
            placeholder="Escribe Cédula, RIF o nombre del cliente..."
            className={`w-full rounded-xl pl-10 pr-24 py-2.5 text-sm border font-medium focus:outline-none focus:ring-2 focus:ring-[#0284C7] transition-colors ${
              isDarkMode
                ? 'bg-slate-950 border-slate-700 text-white placeholder-slate-400'
                : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-500'
            }`}
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setHighlightIdx(0);
                inputRef.current?.focus();
              }}
              aria-label="Limpiar búsqueda de cliente"
              className="absolute right-16 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <span
            className={`absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono tabular-nums ${
              isDarkMode ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            {filteredClients.length}
          </span>
        </div>

        {/* Results List */}
        <div
          role="listbox"
          aria-label="Resultados de clientes"
          className={`rounded-xl border overflow-y-auto max-h-72 divide-y ${
            isDarkMode
              ? 'bg-slate-950/50 border-slate-800 divide-slate-800/60'
              : 'bg-white border-slate-200 divide-slate-100'
          }`}
        >
          {filteredClients.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <p className={`text-sm font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                No se encontraron clientes para &ldquo;{query}&rdquo;
              </p>
              <button
                type="button"
                onClick={() => {
                  handleClose();
                  onOpenQuickClient();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0369A1] text-white text-xs font-semibold hover:bg-[#075985] transition"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Registrar nuevo cliente ahora</span>
              </button>
            </div>
          ) : (
            filteredClients.map((client, idx) => {
              const isSelected = client.id === selectedClientId;
              const isHighlighted = idx === safeHighlightIdx;
              return (
                <button
                  key={client.id}
                  ref={(el) => {
                    itemRefs.current[idx] = el;
                  }}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleChoose(client)}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 transition ${
                    isHighlighted
                      ? isDarkMode
                        ? 'bg-sky-900/40 text-white'
                        : 'bg-[#E0F2FE] text-slate-900'
                      : isDarkMode
                      ? 'hover:bg-slate-800/60 text-slate-200'
                      : 'hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded ${
                          isDarkMode
                            ? 'bg-slate-800 text-sky-300'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {client.identificacion}
                      </span>
                      <span className="text-sm font-semibold truncate">
                        {client.razon_social_nombre}
                      </span>
                    </div>
                    {(client.telefono || client.email) && (
                      <p className={`text-[11px] mt-0.5 truncate ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {[client.telefono, client.email].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>

                  {isSelected && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#15803D] dark:text-emerald-400 shrink-0">
                      <Check className="w-4 h-4" />
                      Activo
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1">
          <span className={`text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Enter selecciona · Esc cancela y vuelve al escáner
          </span>
          <button
            type="button"
            onClick={handleClose}
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
