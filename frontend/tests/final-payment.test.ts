import { describe, it, expect } from 'vitest';
import { deriveFinalPayment, round2 } from '../src/lib/final-payment';

describe('deriveFinalPayment', () => {
  it('paid amount equals the balance → discount is 0', () => {
    const r = deriveFinalPayment({ balance: 10000, tendered: 10000 });
    expect(r.discount).toBe(0);
    expect(r.required).toBe(10000);
    expect(r.error).toBeNull();
  });

  it('paid amount less than the balance → the difference becomes the discount (worked example)', () => {
    // Invoice total 10,000, customer paid 9,500 → discount 500.
    const r = deriveFinalPayment({ balance: 10000, tendered: 9500 });
    expect(r.discount).toBe(500);
    expect(r.required).toBe(9500);
    expect(r.error).toBeNull();
  });

  it('rejects a negative tendered amount', () => {
    const r = deriveFinalPayment({ balance: 1000, tendered: -1 });
    expect(r.error).toBe('NEGATIVE_AMOUNT');
  });

  it('rejects an amount that overpays the balance', () => {
    const r = deriveFinalPayment({ balance: 1000, tendered: 1500 });
    expect(r.error).toBe('OVERPAYMENT');
  });

  it('discount never goes negative', () => {
    const r = deriveFinalPayment({ balance: 1000, tendered: 1000 });
    expect(r.discount).toBeGreaterThanOrEqual(0);
  });

  it('tendered of 0 waives the whole balance as a discount', () => {
    const r = deriveFinalPayment({ balance: 500, tendered: 0 });
    expect(r.discount).toBe(500);
    expect(r.required).toBe(0);
    expect(r.error).toBeNull();
  });
});

describe('round2', () => {
  it('rounds to 2 decimals, avoiding float drift', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
  });
});
