import { describe, expect, it } from 'vitest';
import type { InvoiceDetail } from '../src/lib/sales-types';
import { mapInvoiceToDraft } from '../src/pages/invoices/DraftInvoicePrintPage';

function invoiceWithLines(lines: InvoiceDetail['lines']): InvoiceDetail {
  return {
    id: 8,
    invoice_no: 'INV-2026-000004',
    customer_id: 1,
    cashier_user_id: 1,
    status: 'completed',
    fulfillment_destination: 'shop',
    subtotal_egp: '14700.00',
    cart_discount_egp: '0.00',
    final_discount_egp: '0.00',
    tax_egp: '0.00',
    rounding_egp: '0.00',
    total_egp: '14700.00',
    paid_egp: '14700.00',
    balance_egp: '0.00',
    notes_ar: null,
    created_at: '2026-09-06T10:00:00.000Z',
    closed_at: '2026-09-06T10:00:00.000Z',
    pickup_at: '2026-09-06T10:00:00.000Z',
    cancelled_at: null,
    cancelled_reason_ar: null,
    customer_name_ar: 'عميل الاختبار',
    customer_phone: '01012345678',
    customer_code: 'C-000001',
    customer_address_ar: null,
    cashier_username: 'seller',
    lines,
    payments: [],
  };
}

function line(
  id: number,
  itemType: 'roll' | 'accessory',
  quantity: number,
  unitPrice: number,
  weightKg = quantity,
): InvoiceDetail['lines'][number] {
  return {
    id,
    invoice_id: 8,
    item_type: itemType,
    roll_id: itemType === 'roll' ? id : null,
    accessory_id: itemType === 'accessory' ? id : null,
    qty_pieces: itemType === 'accessory' ? quantity : null,
    sold_quantity: itemType === 'roll' ? quantity.toFixed(3) : null,
    sold_unit: itemType === 'roll' ? 'meter' : null,
    selling_price_egp: (quantity * unitPrice).toFixed(2),
    line_discount_egp: '0.00',
    line_total_egp: (quantity * unitPrice).toFixed(2),
    final_price_per_unit: unitPrice.toFixed(2),
    fabric_name_ar: itemType === 'roll' ? `قماش ${id}` : null,
    fabric_unit: itemType === 'roll' ? 'meter' : null,
    color_name_ar: itemType === 'roll' ? 'أحمر' : null,
    color_code: itemType === 'roll' ? 'RED' : null,
    roll_sr_no: itemType === 'roll' ? `ROLL-${id}` : null,
    weight_kg: itemType === 'roll' ? weightKg.toFixed(3) : null,
    length_m: itemType === 'roll' ? quantity.toFixed(3) : null,
    reference_price_per_unit: null,
    accessory_name_ar: itemType === 'accessory' ? `إكسسوار ${id}` : null,
    internal_barcode: `ITEM-${id}`,
  };
}

describe('invoice print line quantities', () => {
  it('prints metre fabric from length and accessories from piece count', () => {
    const result = mapInvoiceToDraft(invoiceWithLines([
      line(1, 'roll', 55, 180, 28),
      line(2, 'accessory', 120, 40),
    ]));

    expect(result.lines[0]).toMatchObject({
      quantity: 55,
      quantityUnit: 'متر',
      unitPrice: 180,
      amount: 9900,
    });
    expect(result.lines[1]).toMatchObject({
      quantity: 120,
      quantityUnit: 'قطعة',
      unitPrice: 40,
      amount: 4800,
    });
  });
});
