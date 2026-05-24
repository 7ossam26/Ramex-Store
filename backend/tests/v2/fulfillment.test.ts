// v2 Phase 10 — Fulfillment destination (shop vs factory_direct).
// Q&A #14, #15, #16, #17, #19, #20.
import { describe, it, expect } from 'vitest';
import { CreateSaleSchema, FulfillmentDestinationEnum } from '../../src/domain/sales/sales.schemas.js';

describe('v2 — fulfillment destination (Q&A #15-19)', () => {
  it('Q&A #15 — FulfillmentDestinationEnum permits exactly shop + factory_direct', () => {
    expect(FulfillmentDestinationEnum.safeParse('shop').success).toBe(true);
    expect(FulfillmentDestinationEnum.safeParse('factory_direct').success).toBe(true);
    expect(FulfillmentDestinationEnum.safeParse('warehouse').success).toBe(false);
    expect(FulfillmentDestinationEnum.safeParse('').success).toBe(false);
  });

  it('Q&A #14 — fulfillmentDestination is per-invoice (single scalar on CreateSale)', () => {
    // Only one field on the sale; no per-line destination is possible.
    const parsed = CreateSaleSchema.safeParse({
      customerId: 1,
      fulfillmentDestination: 'factory_direct',
      lines: [{ rollId: 1, finalPricePerUnit: 100 }],
      payments: [{ method: 'cash', amount: 100 }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.fulfillmentDestination).toBe('factory_direct');
      // No `fulfillmentDestination` key on any line.
      for (const ln of parsed.data.lines) {
        expect(ln).not.toHaveProperty('fulfillmentDestination');
      }
    }
  });

  it('Q&A #15 — default fulfillment destination is shop', () => {
    const parsed = CreateSaleSchema.safeParse({
      customerId: 1,
      lines: [{ rollId: 1, finalPricePerUnit: 100 }],
      payments: [{ method: 'cash', amount: 100 }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.fulfillmentDestination).toBe('shop');
  });

  // The runtime rejection rules for cross-warehouse cart lines live in
  // invoices.service.ts and surface as ROLL_NOT_AT_SHOP / ROLL_NOT_AT_FACTORY
  // domain errors. The error map is asserted in sales.controller.ts; existing
  // test sales.test.ts covers it as a contract check.
  it('Q&A #15/16 — error map registers ROLL_NOT_AT_SHOP + ROLL_NOT_AT_FACTORY', async () => {
    const ctrlSrc = (await import('node:fs')).readFileSync(
      new URL('../../src/domain/sales/sales.controller.ts', import.meta.url),
      'utf8',
    );
    expect(ctrlSrc).toContain('ROLL_NOT_AT_SHOP');
    expect(ctrlSrc).toContain('ROLL_NOT_AT_FACTORY');
  });
});
