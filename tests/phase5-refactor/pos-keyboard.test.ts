import { describe, expect, it } from 'vitest';
import {
  isTextInputElement,
  resolvePosKeyAction,
  type PosKeyEventLike,
} from '@/hooks/usePosKeyboard';
import { getNextGridIndex } from '@/components/pos/PosCatalogPanel';
import { validateProductImageUrl } from '@/lib/image-compress';

function makeEvent(
  key: string,
  mods: Partial<Omit<PosKeyEventLike, 'key'>> = {}
): PosKeyEventLike {
  return {
    key,
    code: mods.code,
    altKey: Boolean(mods.altKey),
    ctrlKey: Boolean(mods.ctrlKey),
    metaKey: Boolean(mods.metaKey),
    shiftKey: Boolean(mods.shiftKey),
  };
}

describe('Task 4 · Motor de atajos POS Windows Chrome/Edge-safe (usePosKeyboard.ts)', () => {
  it('despacha los atajos principales POS cuando no hay modal abierto', () => {
    const ctx = { hasOpenModal: false, isTextInput: false };
    expect(resolvePosKeyAction(makeEvent('F1'), ctx)).toBe('TOGGLE_HELP');
    expect(resolvePosKeyAction(makeEvent('h', { altKey: true }), ctx)).toBe('TOGGLE_HELP');
    expect(resolvePosKeyAction(makeEvent('F2'), ctx)).toBe('FOCUS_SEARCH');
    expect(resolvePosKeyAction(makeEvent('/'), ctx)).toBe('FOCUS_SEARCH');
    expect(resolvePosKeyAction(makeEvent('F3'), ctx)).toBe('FOCUS_CLIENT');
    expect(resolvePosKeyAction(makeEvent('c', { altKey: true }), ctx)).toBe('FOCUS_CLIENT');
    expect(resolvePosKeyAction(makeEvent('n', { altKey: true }), ctx)).toBe('OPEN_QUICK_CLIENT');
    expect(resolvePosKeyAction(makeEvent('F4'), ctx)).toBe('FOCUS_PAYMENT');
    expect(resolvePosKeyAction(makeEvent('F6'), ctx)).toBe('TOGGLE_ZONE');
    expect(resolvePosKeyAction(makeEvent('F8'), ctx)).toBe('OPEN_CHECKOUT');
    expect(resolvePosKeyAction(makeEvent('F9'), ctx)).toBe('OPEN_PARKED_ORDERS');
    expect(resolvePosKeyAction(makeEvent('PageUp'), ctx)).toBe('CATALOG_PREV_PAGE');
    expect(resolvePosKeyAction(makeEvent('PageDown'), ctx)).toBe('CATALOG_NEXT_PAGE');
    expect(resolvePosKeyAction(makeEvent('Delete', { shiftKey: true }), ctx)).toBe('CLEAR_CART');
    expect(resolvePosKeyAction(makeEvent('Enter', { ctrlKey: true }), ctx)).toBe('CONFIRM_ACTIVE');
    expect(resolvePosKeyAction(makeEvent('Escape'), ctx)).toBe('ESCAPE');
  });

  it('NUNCA intercepta atajos prohibidos de Chrome/Edge Windows ni Alt+F4 / Ctrl+F4', () => {
    const ctx = { hasOpenModal: false, isTextInput: false };
    const forbidden: PosKeyEventLike[] = [
      makeEvent('w', { ctrlKey: true }),
      makeEvent('t', { ctrlKey: true }),
      makeEvent('n', { ctrlKey: true }),
      makeEvent('r', { ctrlKey: true }),
      makeEvent('l', { ctrlKey: true }),
      makeEvent('Tab', { ctrlKey: true }),
      makeEvent('F5'),
      makeEvent('F11'),
      makeEvent('F12'),
      makeEvent('F4', { altKey: true }),
      makeEvent('F4', { ctrlKey: true }),
      makeEvent('ArrowLeft', { altKey: true }),
      makeEvent('ArrowRight', { altKey: true }),
      makeEvent('F2', { ctrlKey: true }),
      makeEvent('F8', { altKey: true }),
    ];

    for (const ev of forbidden) {
      expect(resolvePosKeyAction(ev, ctx)).toBeNull();
    }
  });

  it('suspende atajos de catálogo/carrito cuando hay un modal abierto, pero permite F1/Ctrl+Enter/Esc', () => {
    const modalCtx = { hasOpenModal: true, isTextInput: false };
    expect(resolvePosKeyAction(makeEvent('F2'), modalCtx)).toBeNull();
    expect(resolvePosKeyAction(makeEvent('F3'), modalCtx)).toBeNull();
    expect(resolvePosKeyAction(makeEvent('F8'), modalCtx)).toBeNull();
    expect(resolvePosKeyAction(makeEvent('Delete', { shiftKey: true }), modalCtx)).toBeNull();
    expect(resolvePosKeyAction(makeEvent('F1'), modalCtx)).toBe('TOGGLE_HELP');
    expect(resolvePosKeyAction(makeEvent('Enter', { ctrlKey: true }), modalCtx)).toBe('CONFIRM_ACTIVE');
    expect(resolvePosKeyAction(makeEvent('Escape'), modalCtx)).toBe('ESCAPE');
  });

  it('protege escritura en campos de texto: / y Shift+Delete no se interceptan dentro de inputs', () => {
    const inputCtx = { hasOpenModal: false, isTextInput: true };
    expect(resolvePosKeyAction(makeEvent('/'), inputCtx)).toBeNull();
    expect(resolvePosKeyAction(makeEvent('Delete', { shiftKey: true }), inputCtx)).toBeNull();
    expect(resolvePosKeyAction(makeEvent('PageUp'), inputCtx)).toBeNull();
    // F2/F3/F8 sí siguen funcionando desde un input
    expect(resolvePosKeyAction(makeEvent('F2'), inputCtx)).toBe('FOCUS_SEARCH');
    expect(resolvePosKeyAction(makeEvent('F8'), inputCtx)).toBe('OPEN_CHECKOUT');

    expect(isTextInputElement({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isTextInputElement({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
    expect(isTextInputElement({ tagName: 'SELECT' } as unknown as EventTarget)).toBe(true);
    expect(isTextInputElement({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false);
  });

  it('soporta Alt+N / Alt+C / Alt+H vía event.code en teclados ES/EN', () => {
    const ctx = { hasOpenModal: false, isTextInput: true };
    expect(resolvePosKeyAction(makeEvent('Dead', { altKey: true, code: 'KeyN' }), ctx)).toBe(
      'OPEN_QUICK_CLIENT'
    );
    expect(resolvePosKeyAction(makeEvent('ç', { altKey: true, code: 'KeyC' }), ctx)).toBe(
      'FOCUS_CLIENT'
    );
    expect(resolvePosKeyAction(makeEvent('˙', { altKey: true, code: 'KeyH' }), ctx)).toBe(
      'TOGGLE_HELP'
    );
  });

  it('getNextGridIndex navega en 2D con flechas izquierda/derecha/arriba/abajo sin salir de rango', () => {
    // 8 productos en 3 columnas:
    // [0, 1, 2]
    // [3, 4, 5]
    // [6, 7]
    expect(getNextGridIndex(0, 8, 3, 'ArrowRight')).toBe(1);
    expect(getNextGridIndex(0, 8, 3, 'ArrowDown')).toBe(3);
    expect(getNextGridIndex(4, 8, 3, 'ArrowUp')).toBe(1);
    expect(getNextGridIndex(4, 8, 3, 'ArrowLeft')).toBe(3);
    expect(getNextGridIndex(6, 8, 3, 'ArrowDown')).toBe(7); // clamp al último
    expect(getNextGridIndex(0, 8, 3, 'ArrowLeft')).toBe(0);
  });

  it('validateProductImageUrl acepta imágenes comprimidas WebP/JPEG y rechaza formatos inseguros o pesados', () => {
    const valid = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';
    expect(validateProductImageUrl(valid)).toBe(valid);
    expect(validateProductImageUrl('')).toBeNull();
    expect(validateProductImageUrl(null)).toBeNull();
    expect(() => validateProductImageUrl('javascript:alert(1)')).toThrow();
    expect(() => validateProductImageUrl(`data:image/webp;base64,${'A'.repeat(170_000)}`)).toThrow();
  });
});
