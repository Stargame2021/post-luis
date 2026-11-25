'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  titleId?: string;
  ariaLabel?: string;
  maxWidthClass?: string;
  panelClassName?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  isDarkMode?: boolean;
  zIndexClass?: string;
  /** Callback opcional ejecutado tras cerrar el diálogo (ej. devolver foco al escáner F2). */
  onAfterClose?: () => void;
}

export default function Dialog({
  open,
  onClose,
  children,
  titleId,
  ariaLabel,
  maxWidthClass = 'max-w-lg',
  panelClassName,
  closeOnBackdrop = true,
  closeOnEscape = true,
  showCloseButton = false,
  isDarkMode = false,
  zIndexClass = 'z-50',
  onAfterClose,
}: DialogProps) {
  const generatedId = useId();
  const resolvedTitleId = titleId ?? generatedId;
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  // Capturar el elemento con foco al abrir y restaurar (o delegar a onAfterClose) al cerrar
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      wasOpenRef.current = true;
      previousFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    } else if (!open && wasOpenRef.current) {
      wasOpenRef.current = false;
      if (onAfterClose) {
        window.requestAnimationFrame(() => onAfterClose());
      } else if (previousFocusRef.current && previousFocusRef.current.isConnected) {
        const el = previousFocusRef.current;
        window.requestAnimationFrame(() => el.focus());
      }
      previousFocusRef.current = null;
    }
  }, [open, onAfterClose]);

  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, closeOnEscape, onClose]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-150`}
      onClick={() => {
        if (closeOnBackdrop) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabel ? undefined : resolvedTitleId}
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
        className={
          panelClassName ??
          `relative border rounded-2xl w-full ${maxWidthClass} shadow-2xl overflow-hidden transition-colors my-auto max-h-[92vh] overflow-y-auto ${
            isDarkMode
              ? 'bg-slate-900 border-slate-700 text-slate-100'
              : 'bg-white border-slate-200 text-slate-900'
          }`
        }
      >
        {showCloseButton && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar diálogo"
            className="absolute top-3 right-3 z-10 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
