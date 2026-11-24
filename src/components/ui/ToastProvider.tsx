'use client';

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';

export type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface ToastContextValue {
  showToast: (type: ToastType, message: string) => void;
  confirm: (options: string | ConfirmOptions) => Promise<boolean>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const confirmTitleId = useId();
  const nextToastId = useRef(1);
  const confirmResolver = useRef<((value: boolean) => void) | null>(null);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastType, message: string) => {
      const id = nextToastId.current++;
      setToasts((prev) => [...prev.slice(-3), { id, type, message }]);
      window.setTimeout(() => {
        dismissToast(id);
      }, 4500);
    },
    [dismissToast]
  );

  const confirm = useCallback((options: string | ConfirmOptions): Promise<boolean> => {
    if (confirmResolver.current) {
      confirmResolver.current(false);
      confirmResolver.current = null;
    }
    const normalized: ConfirmOptions =
      typeof options === 'string' ? { message: options } : options;
    setConfirmState(normalized);
    return new Promise<boolean>((resolve) => {
      confirmResolver.current = resolve;
    });
  }, []);

  const resolveConfirm = useCallback((accepted: boolean) => {
    setConfirmState(null);
    const resolver = confirmResolver.current;
    confirmResolver.current = null;
    if (resolver) resolver(accepted);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, confirm }}>
      {children}

      {/* Toast stack */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] pointer-events-none print:hidden"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-2xl border shadow-xl text-xs font-semibold backdrop-blur-md animate-in fade-in duration-150 ${
                toast.type === 'success'
                  ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-100'
                  : toast.type === 'error'
                  ? 'bg-rose-950/90 border-rose-500/40 text-rose-100'
                  : 'bg-slate-900/95 border-indigo-500/40 text-slate-100'
              }`}
            >
              {toast.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : toast.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              ) : (
                <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              )}
              <span className="flex-1 leading-relaxed">{toast.message}</span>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Cerrar notificación"
                className="text-slate-400 hover:text-white p-0.5 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Confirm dialog */}
      <Dialog
        open={Boolean(confirmState)}
        onClose={() => resolveConfirm(false)}
        titleId={confirmTitleId}
        maxWidthClass="max-w-md"
        zIndexClass="z-[65]"
        panelClassName="relative rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 w-full max-w-md shadow-2xl overflow-hidden"
      >
        {confirmState && (
          <div className="p-5 sm:p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div
                className={`p-2.5 rounded-xl shrink-0 border ${
                  confirmState.destructive
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-500'
                    : 'bg-amber-500/10 border-amber-500/20 text-amber-500'
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 id={confirmTitleId} className="text-base font-bold">
                  {confirmState.title || 'Confirmar acción'}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {confirmState.message}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => resolveConfirm(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                {confirmState.cancelLabel || 'Cancelar'}
              </button>
              <button
                type="button"
                onClick={() => resolveConfirm(true)}
                className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition shadow-sm cursor-pointer ${
                  confirmState.destructive
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-indigo-600 hover:bg-indigo-500'
                }`}
              >
                {confirmState.confirmLabel || 'Confirmar'}
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </ToastContext.Provider>
  );
}

export function useToast(): { showToast: (type: ToastType, message: string) => void } {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast debe usarse dentro de ToastProvider');
  }
  return { showToast: ctx.showToast };
}

export function useConfirm(): (options: string | ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useConfirm debe usarse dentro de ToastProvider');
  }
  return ctx.confirm;
}
