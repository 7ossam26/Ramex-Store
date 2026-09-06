import { describe, expect, it } from 'vitest';
import {
  formatInvoiceRollQuantityAr,
  resolveInvoiceRollQuantity,
  resolveRollSaleQuantity,
} from '../src/domain/sales/lineQuantity.js';

describe('resolveRollSaleQuantity', () => {
  it.each([
    ['55.000', '28.000', 55],
    ['20.000', '11.250', 20],
  ])(
    'uses the stored roll length %s m instead of physical weight %s kg for metre fabric',
    (lengthM, weightKg, expected) => {
      expect(
        resolveRollSaleQuantity({
          fabric_unit: 'meter',
          length_m: lengthM,
          weight_kg: weightKg,
        }),
      ).toEqual({ quantity: expected, unit: 'meter' });
    },
  );

  it('keeps the existing kg quantity path for legacy kg-priced fabric', () => {
    expect(
      resolveRollSaleQuantity({
        fabric_unit: 'kg',
        length_m: '50.000',
        weight_kg: '25.500',
      }),
    ).toEqual({ quantity: 25.5, unit: 'kg' });
  });

  it('keeps the invoice snapshot even if the linked roll quantity later changes', () => {
    expect(
      resolveInvoiceRollQuantity({
        sold_quantity: '55.000',
        sold_unit: 'meter',
        fabric_unit: 'meter',
        length_m: '45.000',
        weight_kg: '28.000',
      }),
    ).toEqual({ quantity: 55, unit: 'meter' });
  });

  it('formats the corrected metre quantity for printable documents', () => {
    expect(formatInvoiceRollQuantityAr({
      sold_quantity: '55.000',
      sold_unit: 'meter',
      fabric_unit: 'meter',
      length_m: '55.000',
      weight_kg: '28.000',
    })).toBe('55.000 متر');
  });
});
