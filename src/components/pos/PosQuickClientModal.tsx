'use client';

import { useEffect, useRef, useState } from 'react';
import type { Tercero } from '@/types';
import Dialog from '@/components/ui/Dialog';
import { AlertCircle, Loader2, UserPlus } from 'lucide-react';

interface PosQuickClientModalProps {
  open: boolean;
  onClose: () => void;
  onAfterClose?: () => void;
  onClientCreated: (client: Tercero) => Promise<void> | void;
  isDarkMode?: boolean;
}

export default function PosQuickClientModal({
  open,
  onClose,
  onAfterClose,
  onClientCreated,
  isDarkMode = false,
}: PosQuickClientModalProps) {
  const [identificacion, setIdentificacion] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const submittingRef = useRef(false);
  const idInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const raf = window.requestAnimationFrame(() => {
      idInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(raf);
  }, [open]);

  const handleRequestClose = () => {
    if (submittingRef.current) return;
    setInlineError(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;

    const cleanId = identificacion.trim().toUpperCase();
    const cleanName = razonSocial.trim();

    if (!cleanId || !cleanName) {
      setInlineError('Cédula/RIF y Nombre o Razón Social son obligatorios.');
      return;
    }

    submittingRef.current = true;
    setSaving(true);
    setInlineError(null);

    try {
      const res = await fetch('/api/terceros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'CLIENTE',
          identificacion: cleanId,
          razon_social_nombre: cleanName,
          telefono: telefono.trim() || null,
          email: email.trim() || null,
          activo: true,
        }),
      });

      const data = await res.json();
      if (data.success && data.tercero) {
        setIdentificacion('');
        setRazonSocial('');
        setTelefono('');
        setEmail('');
        await onClientCreated(data.tercero as Tercero);
        onClose();
      } else {
        setInlineError(data.message || 'No se pudo registrar el cliente.');
      }
    } catch {
      setInlineError('Error de conexión al guardar cliente. Verifica tu red e intenta de nuevo.');
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  };

  const inputClass = `w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-sky-600/50 transition-colors ${
    isDarkMode
      ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-400'
      : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-500'
  }`;

  return (
    <Dialog
      open={open}
      onClose={handleRequestClose}
      onAfterClose={onAfterClose}
      closeOnBackdrop={!saving}
      closeOnEscape={!saving}
      titleId="quick-client-modal-title"
      maxWidthClass="max-w-md"
      isDarkMode={isDarkMode}
    >
      <div className="p-6 space-y-4">
        <h3 id="quick-client-modal-title" className="text-base font-bold flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-sky-700 dark:text-sky-400" />
          Nuevo Cliente Rápido
        </h3>

        {inlineError && (
          <div
            role="alert"
            className={`p-3 rounded-xl border text-xs font-semibold flex items-start gap-2 ${
              isDarkMode
                ? 'bg-rose-950/60 border-rose-700 text-rose-200'
                : 'bg-[#FEF2F2] border-[#DC2626] text-[#B91C1C]'
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{inlineError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label
              htmlFor="quick-client-id"
              className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300"
            >
              Cédula / RIF *
            </label>
            <input
              ref={idInputRef}
              id="quick-client-id"
              type="text"
              required
              disabled={saving}
              placeholder="Ej: V-12345678"
              value={identificacion}
              onChange={(e) => {
                setIdentificacion(e.target.value);
                if (inlineError) setInlineError(null);
              }}
              className={`${inputClass} uppercase font-mono`}
            />
          </div>

          <div>
            <label
              htmlFor="quick-client-name"
              className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300"
            >
              Nombre o Razón Social *
            </label>
            <input
              id="quick-client-name"
              type="text"
              required
              disabled={saving}
              placeholder="Ej: María Rodríguez"
              value={razonSocial}
              onChange={(e) => {
                setRazonSocial(e.target.value);
                if (inlineError) setInlineError(null);
              }}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="quick-client-phone"
                className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300"
              >
                Teléfono
              </label>
              <input
                id="quick-client-phone"
                type="text"
                disabled={saving}
                placeholder="Ej: 0412-1234567"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label
                htmlFor="quick-client-email"
                className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300"
              >
                Correo (opcional)
              </label>
              <input
                id="quick-client-email"
                type="email"
                disabled={saving}
                placeholder="cliente@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={saving}
              onClick={handleRequestClose}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition disabled:opacity-50 ${
                isDarkMode
                  ? 'border-slate-700 text-slate-200 hover:bg-slate-800'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              Cancelar [Esc]
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-sky-700 text-white hover:bg-sky-800 transition disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{saving ? 'Guardando...' : 'Guardar y Seleccionar [Enter]'}</span>
            </button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}
