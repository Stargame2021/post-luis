/**
 * Feedback auditivo sutil para caja POS usando Web Audio API (sin archivos externos).
 * Falla silenciosamente si el navegador no soporta AudioContext o el usuario silenció el sonido.
 */

const SOUND_STORAGE_KEY = 'pos_sound_enabled_v1';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) {
    try {
      audioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Lee si el sonido de caja está habilitado (activado por defecto).
 */
export function isPosSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(SOUND_STORAGE_KEY);
    if (raw === null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
}

/**
 * Guarda la preferencia de sonido del POS en `localStorage`.
 */
export function setPosSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, String(enabled));
  } catch {
    // ignore storage errors
  }
}

function playTone(frequency: number, durationSec: number, gainPeak = 0.06, startOffset = 0): void {
  if (!isPosSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime + startOffset;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationSec + 0.01);
  } catch {
    // Fallback silencioso
  }
}

/** Beep corto de confirmación al escanear/agregar un producto (880Hz). */
export function playPosAddBeep(): void {
  playTone(880, 0.07, 0.05);
}

/** Acorde breve de confirmación al completar una venta. */
export function playPosSuccessChime(): void {
  playTone(660, 0.09, 0.055, 0);
  playTone(880, 0.14, 0.055, 0.08);
}

/** Tono grave breve de advertencia/error (220Hz). */
export function playPosErrorTone(): void {
  playTone(220, 0.14, 0.06);
}
