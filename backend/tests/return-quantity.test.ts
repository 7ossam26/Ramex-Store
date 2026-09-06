// Pure-logic tests for the partial roll/fabric return maths.
import { describe, it, expect } from 'vitest';
import {
  remainingReturnableQuantity,
  assertReturnQuantity,
  proportionalRefund,
  remainingRefundable,
  roundQty,
} from '../src/domain/sales/returnQuantity.js';

describe('remainingReturnableQuantity', () => {
  it('returns the full amount when nothing has been returned yet', () => {
    expect(remainingReturnableQuantity(100, 0)).toBe(100);
  });
  it('subtracts what has already been returned', () => {
    expect(remainingReturnableQuantity(100, 30)).toBe(70);
    expect(remainingReturnableQuantity(100, 30 + 20)).toBe(50);
  });
  it('floors at zero rather than going negative', () => {
    expect(remainingReturnableQuantity(100, 150)).toBe(0);
  });
  it('treats an already-fully-returned (Infinity) line as zero remaining', () => {
    expect(remainingReturnableQuantity(100, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('assertReturnQuantity', () => {
  it('accepts a request within the remaining amount', () => {
    expect(() => assertReturnQuantity(30, 70)).not.toThrow();
    expect(() => assertReturnQuantity(70, 70)).not.toThrow();
  });
  it('rejects a request exceeding the remaining amount', () => {
    expect(() => assertReturnQuantity(71, 70)).toThrow('RETURN_QUANTITY_EXCEEDS_REMAINING');
  });
  it('rejects any request once nothing remains, reusing the existing "already returned" error', () => {
    expect(() => assertReturnQuantity(1, 0)).toThrow('RETURN_LINE_ALREADY_RETURNED');
  });
  it('rejects a zero or negative request', () => {
    expect(() => assertReturnQuantity(0, 70)).toThrow('RETURN_QUANTITY_INVALID');
    expect(() => assertReturnQuantity(-5, 70)).toThrow('RETURN_QUANTITY_INVALID');
  });
});

describe('proportionalRefund', () => {
  it('refunds the full line total when the full quantity is returned', () => {
    expect(proportionalRefund(1000, 100, 100)).toBe(1000);
  });
  it('refunds a proportional share for a partial quantity', () => {
    expect(proportionalRefund(1000, 100, 30)).toBe(300);
    expect(proportionalRefund(1000, 100, 50)).toBe(500);
  });
  it('returns 0 when sold quantity is 0 (guards divide-by-zero)', () => {
    expect(proportionalRefund(1000, 0, 0)).toBe(0);
  });
});

describe('remainingRefundable', () => {
  it('returns the full line total when nothing has been refunded', () => {
    expect(remainingRefundable(1000, 0)).toBe(1000);
  });
  it('subtracts what has already been refunded', () => {
    expect(remainingRefundable(1000, 300)).toBe(700);
  });
  it('floors at zero', () => {
    expect(remainingRefundable(1000, 1500)).toBe(0);
  });
});

describe('roundQty', () => {
  it('rounds to 3 decimals', () => {
    expect(roundQty(1.23456)).toBe(1.235);
    expect(roundQty(0.1 + 0.2)).toBe(0.3);
  });
});

describe('partial-return sequence (30 → 20 → 50 of a 100m roll)', () => {
  it('walks through the full example from the requirements', () => {
    const sold = 100;
    let already = 0;

    // Return 30.
    let remaining = remainingReturnableQuantity(sold, already);
    expect(remaining).toBe(100);
    assertReturnQuantity(30, remaining);
    already += 30;
    expect(remainingReturnableQuantity(sold, already)).toBe(70);

    // Return 20 more.
    remaining = remainingReturnableQuantity(sold, already);
    assertReturnQuantity(20, remaining);
    already += 20;
    expect(remainingReturnableQuantity(sold, already)).toBe(50);

    // Return the remaining 50.
    remaining = remainingReturnableQuantity(sold, already);
    assertReturnQuantity(50, remaining);
    already += 50;
    expect(remainingReturnableQuantity(sold, already)).toBe(0);

    // A further return of any amount is now rejected.
    remaining = remainingReturnableQuantity(sold, already);
    expect(() => assertReturnQuantity(1, remaining)).toThrow('RETURN_LINE_ALREADY_RETURNED');
  });
});
