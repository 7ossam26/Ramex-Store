import { buildInvoicePdf } from '../dist/lib/pdf/invoice.js';
import { db } from '../dist/db/connection.js';

const fakeInvoice = {
  id: 999999, invoice_no: 'INV-2026-999999',
  customer_id: 1, cashier_user_id: 1, status: 'completed',
  subtotal_egp: '500.00', cart_discount_egp: '50.00', tax_egp: '0.00',
  rounding_egp: '0.00', total_egp: '450.00', paid_egp: '450.00', balance_egp: '0.00',
  notes_ar: 'ملاحظة تجريبية', created_at: new Date().toISOString(),
  closed_at: new Date().toISOString(), pickup_at: null,
  cancelled_at: null, cancelled_reason_ar: null,
  customer_name_ar: 'أحمد إيهاب', customer_phone: '01012345678',
  customer_code: 'C-000001', customer_address_ar: 'القاهرة', cashier_username: 'ziad',
  lines: [
    { id: 1, invoice_id: 999999, roll_id: 1, selling_price_egp: '250.00',
      line_discount_egp: '0.00', line_total_egp: '250.00',
      fabric_name_ar: 'قطن', color_name_ar: 'أزرق', color_code: 'BLU',
      roll_sr_no: 'RS-1', weight_kg: '5.000', internal_barcode: 'RMX-R-000001' },
  ],
  payments: [
    { id: 1, invoice_id: 999999, method: 'cash', amount_egp: '450.00',
      payment_kind: 'final', bank_account_id: null, notes_ar: null,
      actor_user_id: 1, created_at: new Date().toISOString() },
  ],
};

try {
  const buf = await buildInvoicePdf(fakeInvoice, 'original');
  console.log('PDF size:', buf.length, 'bytes');
  if (buf.length < 1000) {
    console.error('FAIL: PDF too small');
    process.exit(1);
  }
  console.log('OK');
} catch (e) {
  console.error('FAIL:', e);
  process.exit(1);
} finally {
  await db.destroy();
}
