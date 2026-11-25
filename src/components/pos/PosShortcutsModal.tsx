'use client';

import Dialog from '@/components/ui/Dialog';
import { Keyboard } from 'lucide-react';

interface PosShortcutsModalProps {
  open: boolean;
  onClose: () => void;
  onAfterClose?: () => void;
  isDarkMode?: boolean;
}

const SHORTCUT_GROUPS: {
  title: string;
  items: { keys: string[]; description: string }[];
}[] = [
  {
    title: 'Operación Principal',
    items: [
      { keys: ['F1', 'Alt+H'], description: 'Mostrar / ocultar esta guía de atajos' },
      { keys: ['F2', '/'], description: 'Enfocar buscador / lector de código de barras' },
      { keys: ['F3', 'Alt+C'], description: 'Buscar y seleccionar cliente' },
      { keys: ['Alt+N'], description: 'Registrar cliente rápido' },
      { keys: ['F4'], description: 'Cambiar condición / método de pago' },
      { keys: ['F6'], description: 'Alternar foco entre catálogo y carrito' },
    ],
  },
  {
    title: 'Catálogo y Escáner',
    items: [
      { keys: ['5*código', 'Enter'], description: 'Multiplicador rápido (agrega N unidades)' },
      { keys: ['↑', '↓', 'Enter'], description: 'Navegar resultados y agregar producto' },
      { keys: ['PgUp', 'PgDn'], description: 'Cambiar página del catálogo (20 por pág.)' },
      { keys: ['Esc'], description: 'Limpiar búsqueda o cerrar modal activo' },
    ],
  },
  {
    title: 'Carrito y Cobro Rápido',
    items: [
      { keys: ['F8'], description: 'Abrir ventana de cobro multimoneda' },
      { keys: ['F9'], description: 'Aparcar / recuperar ventas en espera' },
      { keys: ['Ctrl+Enter'], description: 'Confirmar cobro / formulario activo' },
      { keys: ['+', '-', 'Supr'], description: 'Ajustar cantidad o quitar línea activa' },
      { keys: ['Shift+Supr'], description: 'Vaciar carrito (con confirmación)' },
    ],
  },
];

export default function PosShortcutsModal({
  open,
  onClose,
  onAfterClose,
  isDarkMode = false,
}: PosShortcutsModalProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      onAfterClose={onAfterClose}
      titleId="pos-shortcuts-modal-title"
      maxWidthClass="max-w-2xl"
      showCloseButton
      isDarkMode={isDarkMode}
    >
      <div className="p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2.5 pr-8">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              isDarkMode ? 'bg-sky-950/60 text-sky-400' : 'bg-sky-50 text-sky-700'
            }`}
          >
            <Keyboard className="w-5 h-5" />
          </div>
          <div>
            <h3 id="pos-shortcuts-modal-title" className="text-base font-bold leading-tight">
              Atajos de Teclado de Caja
            </h3>
            <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Optimizados para Chrome y Edge en Windows sin interferir con el navegador.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {SHORTCUT_GROUPS.map((group) => (
            <div
              key={group.title}
              className={`rounded-xl border p-3.5 space-y-2 ${
                isDarkMode
                  ? 'bg-slate-950/50 border-slate-800'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <h4
                className={`text-xs font-bold uppercase tracking-wide ${
                  isDarkMode ? 'text-slate-300' : 'text-slate-700'
                }`}
              >
                {group.title}
              </h4>
              <ul className="space-y-1.5">
                {group.items.map((item) => (
                  <li
                    key={item.description}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className={isDarkMode ? 'text-slate-300' : 'text-slate-700'}>
                      {item.description}
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      {item.keys.map((k) => (
                        <kbd
                          key={k}
                          className={`px-1.5 py-0.5 rounded-md border font-mono text-[11px] font-semibold tabular-nums ${
                            isDarkMode
                              ? 'bg-slate-900 border-slate-700 text-sky-300'
                              : 'bg-white border-slate-300 text-slate-800'
                          }`}
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-sky-700 text-white hover:bg-sky-800 transition"
          >
            Entendido [Esc]
          </button>
        </div>
      </div>
    </Dialog>
  );
}
