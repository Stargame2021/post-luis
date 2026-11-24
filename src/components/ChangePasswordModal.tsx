'use client';

import { useState } from 'react';
import { ShieldAlert, KeyRound, Lock, LogOut, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onPasswordChanged: () => void;
  onLogout: () => void;
  isDarkMode?: boolean;
}

export default function ChangePasswordModal({
  isOpen,
  onPasswordChanged,
  onLogout,
  isDarkMode = false,
}: ChangePasswordModalProps) {
  if (!isOpen) return null;

  return (
    <ChangePasswordModalContent
      onPasswordChanged={onPasswordChanged}
      onLogout={onLogout}
      isDarkMode={isDarkMode}
    />
  );
}

function ChangePasswordModalContent({
  onPasswordChanged,
  onLogout,
  isDarkMode,
}: Omit<ChangePasswordModalProps, 'isOpen'>) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedNew = newPassword.trim();
    const trimmedConfirm = confirmPassword.trim();

    if (!currentPassword) {
      setError('Ingresa tu contraseña actual.');
      return;
    }

    if (trimmedNew.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (trimmedNew === currentPassword.trim()) {
      setError('La nueva contraseña debe ser diferente a la contraseña actual.');
      return;
    }

    if (newPassword !== confirmPassword || trimmedNew !== trimmedConfirm) {
      setError('La confirmación de la nueva contraseña no coincide.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          currentPassword,
          newPassword: trimmedNew,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        onPasswordChanged();
      } else {
        setError(data.message || 'No se pudo actualizar la contraseña.');
      }
    } catch {
      setError('Error al comunicar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`w-full max-w-md rounded-3xl border shadow-2xl overflow-hidden ${
          isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-100 text-slate-900'
        }`}
      >
        {/* Header */}
        <div className="relative p-7 text-center bg-gradient-to-br from-amber-600 via-orange-600 to-rose-700 text-white">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg">
            <ShieldAlert className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-bold tracking-tight">Cambio de Contraseña Obligatorio</h2>
          <p className="text-xs text-amber-50/90 mt-1">
            Por seguridad, debes actualizar la contraseña inicial antes de continuar.
          </p>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-7 space-y-4">
          {error && (
            <div
              className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-xs ${
                isDarkMode
                  ? 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                  : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-amber-500" /> Contraseña Actual
            </label>
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Ingresa tu contraseña actual"
              className={`w-full px-4 py-2.5 rounded-xl border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition ${
                isDarkMode
                  ? 'bg-slate-800/80 border-slate-700 text-white placeholder-slate-500'
                  : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
              }`}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-500" /> Nueva Contraseña
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className={`w-full px-4 py-2.5 rounded-xl border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition ${
                isDarkMode
                  ? 'bg-slate-800/80 border-slate-700 text-white placeholder-slate-500'
                  : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
              }`}
            />
            <p className={`text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Debe tener al menos 8 caracteres y ser distinta a la clave inicial por defecto.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" /> Confirmar Nueva Contraseña
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repite la nueva contraseña"
              className={`w-full px-4 py-2.5 rounded-xl border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition ${
                isDarkMode
                  ? 'bg-slate-800/80 border-slate-700 text-white placeholder-slate-500'
                  : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
              }`}
            />
          </div>

          <div className="pt-2 space-y-2.5">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-lg shadow-amber-600/30 transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Actualizando...
                </span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Actualizar Contraseña y Continuar
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onLogout}
              disabled={loading}
              className={`w-full py-2.5 px-4 rounded-xl font-semibold text-xs border transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${
                isDarkMode
                  ? 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <LogOut className="w-3.5 h-3.5 text-rose-500" />
              Cerrar Sesión
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
