import { describe, expect, it } from 'vitest';
import { parseCartQuantityDraft } from '@/components/pos/PosCartPanel';

describe('Task 6 · Edición de cantidad en carrito sin rebote (PosCartPanel)', () => {
  it('parseCartQuantityDraft acepta enteros >= 0 y retorna null para borradores vacíos o inválidos', () => {
    expect(parseCartQuantityDraft('5')).toBe(5);
    expect(parseCartQuantityDraft('0')).toBe(0);
    expect(parseCartQuantityDraft(' 12 ')).toBe(12);
    expect(parseCartQuantityDraft('')).toBeNull();
    expect(parseCartQuantityDraft('   ')).toBeNull();
    expect(parseCartQuantityDraft('-3')).toBeNull();
    expect(parseCartQuantityDraft('2.5')).toBeNull();
    expect(parseCartQuantityDraft('abc')).toBeNull();
  });
});
