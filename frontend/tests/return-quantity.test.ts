import { describe, it, expect } from 'vitest';
import {
  remainingReturnableQuantity,
  proportionalRefund,
  remainingRefundable,
  roundQty,
} from '../src/lib/return-quantity';

describe('remainingReturnableQuantity', () => {
  it('returns the full amount when nothing has been returned yet', () => {
    expect(remainingReturnableQuantity(100, 0)).toBe(100);
  });
  it('subtracts what has already been returned', () => {
    expect(remainingReturnableQuantity(100, 30)).toBe(70);
  });
  it('floors at zero', () => {
    expect(remainingReturnableQuantity(100, 150)).toBe(0);
  });
});

describe('proportionalRefund', () => {
  it('refunds the full line total for a full-quantity return', () => {
    expect(proportionalRefund(1000, 100, 100)).toBe(1000);
  });
  it('refunds a proportional share for a partial return', () => {
    expect(proportionalRefund(1000, 100, 30)).toBe(300);
  });
  it('guards divide-by-zero', () => {
    expect(proportionalRefund(1000, 0, 0)).toBe(0);
  });
});

describe('remainingRefundable', () => {
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
  });
});

describe('the 100m partial-return example', () => {
  it('30 → 20 → 50 walks the remaining quantity down to 0', () => {
    let already = 0;
    expect(remainingReturnableQuantity(100, already)).toBe(100);
    already += 30;
    expect(remainingReturnableQuantity(100, already)).toBe(70);
    already += 20;
    expect(remainingReturnableQuantity(100, already)).toBe(50);
    already += 50;
    expect(remainingReturnableQuantity(100, already)).toBe(0);
  });
});
