'use client';

import { useEffect, useId, type ReactNode } from 'react';
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
  showCloseButton?: boolean;
  isDarkMode?: boolean;
  zIndexClass?: string;
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
  showCloseButton = false,
  isDarkMode = false,
  zIndexClass = 'z-50',
}: DialogProps) {
  const generatedId = useId();
  const resolvedTitleId = titleId ?? generatedId;

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

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
