import { useEffect, useRef } from 'react';

export type PosKeyAction =
  | 'TOGGLE_HELP'
  | 'FOCUS_SEARCH'
  | 'FOCUS_CLIENT'
  | 'OPEN_QUICK_CLIENT'
  | 'FOCUS_PAYMENT'
  | 'TOGGLE_ZONE'
  | 'OPEN_CHECKOUT'
  | 'OPEN_PARKED_ORDERS'
  | 'CATALOG_PREV_PAGE'
  | 'CATALOG_NEXT_PAGE'
  | 'CLEAR_CART'
  | 'CONFIRM_ACTIVE'
  | 'ESCAPE';

export interface PosKeyEventLike {
  key: string;
  code?: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export interface PosKeyContext {
  hasOpenModal: boolean;
  isTextInput: boolean;
}

const FORBIDDEN_BROWSER_CTRL_KEYS = new Set(['w', 't', 'n', 'r', 'l', 'tab']);
const FORBIDDEN_BROWSER_FUNCTION_KEYS = new Set(['F5', 'F11', 'F12']);

/**
 * Determina si el elemento activo es un campo de texto donde no deben interceptarse
 * teclas imprimibles o de edición (`/`, `+`, `-`, `*`, `Delete`).
 */
export function isTextInputElement(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as { tagName?: string; isContentEditable?: boolean };
  const tag = (el.tagName || '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(el.isContentEditable);
}

/**
 * Resuelve la acción semántica de un evento de teclado POS respetando:
 * 1. Prohibiciones estrictas de navegador en Windows (Chrome/Edge).
 * 2. Modificadores limpios en F1–F9 (`!altKey && !ctrlKey && !metaKey`) para jamás interceptar Alt+F4 / Ctrl+F4.
 * 3. Soporte de `event.code` (`KeyH`, `KeyC`, `KeyN`) en combinaciones `Alt+*` para teclados ES/EN.
 * 4. Suspensión de atajos de fondo cuando hay un modal abierto.
 * 5. Protección de escritura en campos de texto (`isTextInput`).
 */
export function resolvePosKeyAction(
  event: PosKeyEventLike,
  context: PosKeyContext
): PosKeyAction | null {
  const key = event.key;
  const lowerKey = key.toLowerCase();
  const code = event.code || '';

  // Capa 0: Atajos prohibidos del navegador (jamás interceptar)
  if (FORBIDDEN_BROWSER_FUNCTION_KEYS.has(key)) return null;
  if ((event.ctrlKey || event.metaKey) && FORBIDDEN_BROWSER_CTRL_KEYS.has(lowerKey)) return null;
  if (event.altKey && (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'F4')) return null;
  if ((event.ctrlKey || event.metaKey) && key === 'F4') return null;

  const noModifiers = !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
  const altOnly = event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;

  // Capa 1: Teclas que funcionan incluso con modal abierto
  if (key === 'Escape' && noModifiers) {
    return 'ESCAPE';
  }
  if (key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.altKey) {
    return 'CONFIRM_ACTIVE';
  }
  if ((key === 'F1' && noModifiers) || (altOnly && (lowerKey === 'h' || code === 'KeyH'))) {
    return 'TOGGLE_HELP';
  }

  // Si hay un modal abierto, suspender atajos de fondo de catálogo/carrito
  if (context.hasOpenModal) {
    return null;
  }

  // Capa 2: Teclas de función globales POS (F2–F9 sin modificadores)
  if (noModifiers) {
    switch (key) {
      case 'F2':
        return 'FOCUS_SEARCH';
      case 'F3':
        return 'FOCUS_CLIENT';
      case 'F4':
        return 'FOCUS_PAYMENT';
      case 'F6':
        return 'TOGGLE_ZONE';
      case 'F8':
        return 'OPEN_CHECKOUT';
      case 'F9':
        return 'OPEN_PARKED_ORDERS';
      case 'PageUp':
        return context.isTextInput ? null : 'CATALOG_PREV_PAGE';
      case 'PageDown':
        return context.isTextInput ? null : 'CATALOG_NEXT_PAGE';
      default:
        break;
    }
  }

  // Respaldos con Alt (seguros en Windows Chrome/Edge, evaluando key y code para teclado ES/EN)
  if (altOnly) {
    if (lowerKey === 'c' || code === 'KeyC') return 'FOCUS_CLIENT';
    if (lowerKey === 'n' || code === 'KeyN') return 'OPEN_QUICK_CLIENT';
  }

  // Capa 3: Atajos protegidos fuera de campos de texto
  if (!context.isTextInput) {
    if (key === '/' && noModifiers) {
      return 'FOCUS_SEARCH';
    }
    if (key === 'Delete' && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
      return 'CLEAR_CART';
    }
  }

  return null;
}

export interface UsePosKeyboardOptions {
  enabled?: boolean;
  hasOpenModal: boolean;
  onAction: (action: PosKeyAction) => void;
}

/**
 * Hook de teclado global del POS montado en fase `capture` mientras `PosView` está activo.
 */
export function usePosKeyboard({
  enabled = true,
  hasOpenModal,
  onAction,
}: UsePosKeyboardOptions): void {
  const onActionRef = useRef(onAction);
  useEffect(() => {
    onActionRef.current = onAction;
  }, [onAction]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const action = resolvePosKeyAction(event, {
        hasOpenModal,
        isTextInput: isTextInputElement(event.target),
      });

      if (!action) return;

      // No bloquear Escape si hay un Dialog abierto (el Dialog gestiona su propio Escape)
      if (action === 'ESCAPE' && hasOpenModal) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onActionRef.current(action);
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [enabled, hasOpenModal]);
}
