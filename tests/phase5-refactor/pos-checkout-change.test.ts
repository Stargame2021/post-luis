import { describe, expect, it } from 'vitest';
import { getQuickTenderOptions } from '@/components/pos/PosCheckoutModal';
import { calculateDualChange } from '@/lib/pos-calculations';

describe('Task 7 · Quick Tender y Vuelto Dual USD/Bs (PosCheckoutModal)', () => {
  it('getQuickTenderOptions genera Exacto y billetes superiores relevantes en USD', () => {
    const opts = getQuickTenderOptions('USD', 12.5);
    expect(opts[0]).toEqual({ label: 'Exacto', amount: 12.5 });
    expect(opts.map((o) => o.amount)).toContain(20);
    expect(opts.map((o) => o.amount)).toContain(50);
    expect(opts.every((o) => o.amount >= 12.5)).toBe(true);
    expect(opts.length).toBeLessThanOrEqual(5);
  });

  it('getQuickTenderOptions genera Exacto y múltiplos redondeados en VES', () => {
    const opts = getQuickTenderOptions('VES', 1230.5);
    expect(opts[0]).toEqual({ label: 'Exacto', amount: 1230.5 });
    expect(opts.length).toBeGreaterThanOrEqual(2);
    expect(opts.every((o) => o.amount >= 1230.5)).toBe(true);
  });

  it('calculateDualChange refleja vuelto dual exacto al pagar con Quick Tender en USD o VES', () => {
    const usdChange = calculateDualChange({
      totalUsd: 12.5,
      totalLocal: 625,
      rateValue: 50,
      receivedAmount: 20,
      currency: 'USD',
    });
    expect(usdChange.isShort).toBe(false);
    expect(usdChange.changeUsd).toBe(7.5);
    expect(usdChange.changeLocal).toBe(375);

    const vesChange = calculateDualChange({
      totalUsd: 10,
      totalLocal: 500,
      rateValue: 50,
      receivedAmount: 600,
      currency: 'VES',
    });
    expect(vesChange.isShort).toBe(false);
    expect(vesChange.changeLocal).toBe(100);
    expect(vesChange.changeUsd).toBe(2);
  });
});
