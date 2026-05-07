import { db } from '../../../db/connection.js';
import { formatCairo } from '../../../lib/datetime/cairo.js';
import type { ReportPdfOptions } from '../../../lib/reports/pdfExport.js';

export type CustomerLedgerEntry = {
  created_at: string;
  entry_type: string;
  amount_egp: string;
  direction: string;
  invoice_no: string | null;
  notes_ar: string | null;
  running_balance_egp: string;
};

export type CustomerLedgerResult = {
  customer_name_ar: string;
  customer_code: string;
  customer_phone: string;
  opening_balance_egp: string;
  closing_balance_egp: string;
  entries: CustomerLedgerEntry[];
};

export async function getCustomerLedger(
  customerId: number,
  from: string,
  to: string,
): Promise<CustomerLedgerResult> {
  const customer = await db('customers').where({ id: customerId }).first() as Record<string, unknown> | undefined;
  if (!customer) throw new Error('CUSTOMER_NOT_FOUND');

  // Balance before the period
  const preAgg = await db('customer_ledger_entries')
    .where('customer_id', customerId)
    .where('created_at', '<', from)
    .select(
      db.raw(
        "COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_egp ELSE -amount_egp END), 0) as net",
      ),
    )
    .first() as { net: string } | undefined;
  const openingBal = Number(preAgg?.net ?? 0);

  const entries = await db('customer_ledger_entries as cle')
    .leftJoin('invoices as i', 'cle.invoice_id', 'i.id')
    .where('cle.customer_id', customerId)
    .whereBetween('cle.created_at', [from, to])
    .orderBy('cle.created_at', 'asc')
    .select(
      'cle.created_at',
      'cle.entry_type',
      'cle.amount_egp',
      'cle.direction',
      'i.invoice_no',
      'cle.notes_ar',
    );

  let running = openingBal;
  const mapped: CustomerLedgerEntry[] = entries.map((e: Record<string, unknown>) => {
    const amt = Number(e['amount_egp']);
    if (e['direction'] === 'credit') running += amt;
    else running -= amt;
    return {
      created_at: formatCairo(String(e['created_at'])),
      entry_type: String(e['entry_type']),
      amount_egp: amt.toFixed(2),
      direction: e['direction'] === 'credit' ? 'دائن' : 'مدين',
      invoice_no: e['invoice_no'] as string | null,
      notes_ar: e['notes_ar'] as string | null,
      running_balance_egp: running.toFixed(2),
    };
  });

  return {
    customer_name_ar: String(customer['name_ar']),
    customer_code: String(customer['customer_code']),
    customer_phone: String(customer['phone']),
    opening_balance_egp: openingBal.toFixed(2),
    closing_balance_egp: running.toFixed(2),
    entries: mapped,
  };
}

export function customerLedgerToExport(
  result: CustomerLedgerResult,
  from: string,
  to: string,
  generatedAt: string,
): ReportPdfOptions {
  return {
    titleAr: 'سجل العميل',
    subtitleAr: `${result.customer_name_ar} (${result.customer_code}) | من ${from} إلى ${to}`,
    generatedAt,
    sections: [
      {
        titleAr: 'ملخص',
        columns: [
          { label: 'البيان', key: 'label', width: '*' },
          { label: 'القيمة (ج.م)', key: 'value', width: 'auto' },
        ],
        rows: [
          { label: 'الرصيد الافتتاحي', value: result.opening_balance_egp },
          { label: 'الرصيد الختامي', value: result.closing_balance_egp },
        ],
      },
      {
        titleAr: 'تفاصيل الحركات',
        columns: [
          { label: 'التاريخ', key: 'created_at', width: 'auto' },
          { label: 'النوع', key: 'entry_type', width: 'auto' },
          { label: 'الاتجاه', key: 'direction', width: 'auto' },
          { label: 'المبلغ (ج.م)', key: 'amount_egp', width: 'auto' },
          { label: 'رقم الفاتورة', key: 'invoice_no', width: 'auto' },
          { label: 'الرصيد المتراكم', key: 'running_balance_egp', width: 'auto', bold: true },
          { label: 'ملاحظات', key: 'notes_ar', width: '*' },
        ],
        rows: result.entries.map((e) => ({ ...e, invoice_no: e.invoice_no ?? '', notes_ar: e.notes_ar ?? '' })),
        emptyAr: 'لا توجد حركات في هذه الفترة',
      },
    ],
  };
}
