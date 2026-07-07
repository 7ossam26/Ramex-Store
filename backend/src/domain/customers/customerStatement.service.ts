import { db } from '../../db/connection.js';
import {
  buildStatement,
  statementToExport,
  type StatementAccount,
  type StatementEntry,
  type StatementLineItem,
  type StatementResult,
} from '../../lib/statements/statement.js';
import type { ReportPdfOptions } from '../../lib/reports/pdfExport.js';

/**
 * Cairo-local calendar date (`YYYY-MM-DD`) of a stored timestamp. The customer
 * ledger stores `created_at` as a UTC-ish datetime; we bucket each entry by its
 * Cairo calendar day so a near-midnight transaction lands in the right day.
 */
function cairoDate(ts: string | Date): string {
  return new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
}

function toIso(ts: string | Date): string {
  return new Date(ts).toISOString();
}

type LedgerRow = {
  id: number;
  entry_type: 'sale' | 'refund' | 'payment' | 'deposit' | 'adjustment';
  reference_type: string | null;
  reference_id: number | null;
  amount_egp: string;
  notes_ar: string | null;
  created_at: string;
};

/** A joined invoice-line row used to expand a sale in the detailed variant. */
type LineRow = {
  invoice_id: number;
  item_type: 'roll' | 'accessory';
  qty_pieces: number | null;
  selling_price_egp: string;
  line_total_egp: string;
  fabric_name_ar: string | null;
  fabric_unit: 'kg' | 'meter' | null;
  color_name_ar: string | null;
  roll_sr_no: string | null;
  weight_kg: string | null;
  length_m: string | null;
  accessory_name_ar: string | null;
};

/** Arabic description + posting kind for a ledger entry, by type/reference. */
function describe(row: LedgerRow, invoiceNo: string | null): { kind: StatementEntry['kind']; description: string; ref: string } {
  const note = row.notes_ar ? ` · ${row.notes_ar}` : '';
  if (row.reference_type === 'opening_balance') {
    return { kind: 'opening', description: 'رصيد افتتاحي', ref: '' };
  }
  switch (row.entry_type) {
    case 'sale':
      return { kind: 'invoice', description: `فاتورة مبيعات${note}`, ref: invoiceNo ?? '' };
    case 'deposit':
      return { kind: 'payment', description: `عربون${note}`, ref: invoiceNo ?? '' };
    case 'payment':
      return row.reference_type === 'standalone'
        ? { kind: 'payment', description: `سند قبض${note}`, ref: '' }
        : { kind: 'payment', description: `دفعة${note}`, ref: invoiceNo ?? '' };
    case 'refund':
      return { kind: 'adjustment', description: `مرتجع${note}`, ref: invoiceNo ?? '' };
    default:
      return { kind: 'adjustment', description: `تسوية${note}`, ref: invoiceNo ?? '' };
  }
}

/** Map one joined invoice line into the engine's line-item shape. */
function toLineItem(l: LineRow): StatementLineItem {
  if (l.item_type === 'accessory') {
    return {
      description: l.accessory_name_ar ?? 'إكسسوار',
      quantity: Number(l.qty_pieces ?? 0),
      unit: 'piece',
      unit_price: Number(l.selling_price_egp),
      line_total: Number(l.line_total_egp),
    };
  }
  const meter = l.fabric_unit === 'meter';
  const parts = [l.fabric_name_ar ?? 'خامة'];
  if (l.color_name_ar) parts.push(l.color_name_ar);
  if (l.roll_sr_no) parts.push(`#${l.roll_sr_no}`);
  return {
    description: parts.join(' - '),
    quantity: Number((meter ? l.length_m : l.weight_kg) ?? 0),
    unit: meter ? 'meter' : 'kg',
    unit_price: Number(l.selling_price_egp),
    line_total: Number(l.line_total_egp),
  };
}

/**
 * Load a customer and map their entire ledger timeline into the currency-agnostic
 * {@link StatementAccount} the Phase 3 engine consumes. The customer side is
 * **EGP-only** and reuses `customer_ledger_entries` verbatim.
 *
 * Sign convention (established by the sales/payment code and the frontend):
 * `amount_egp < 0` means the customer owes us more (a **debit** on the
 * statement); `amount_egp > 0` reduces what they owe (a **credit**). This is the
 * inverse of the supplier adapter, so brought-forward / closing read as a
 * positive "amount owed" figure.
 */
export async function loadCustomerAccount(customerId: number): Promise<StatementAccount> {
  const customer = await db('customers').where({ id: customerId }).first();
  if (!customer) throw new Error('CUSTOMER_NOT_FOUND');

  const entriesRaw = (await db('customer_ledger_entries')
    .where({ customer_id: customerId })
    .orderBy('created_at', 'asc')
    .orderBy('id', 'asc')
    .select('id', 'entry_type', 'reference_type', 'reference_id', 'amount_egp', 'notes_ar', 'created_at')) as LedgerRow[];

  // Invoice numbers (for ref) + line items (for the detailed variant), batched
  // over every invoice this customer's ledger references.
  const invoiceIds = Array.from(
    new Set(
      entriesRaw
        .filter((e) => e.reference_type === 'invoice' && e.reference_id != null)
        .map((e) => Number(e.reference_id)),
    ),
  );

  const invoiceNoById = new Map<number, string>();
  const linesByInvoice = new Map<number, StatementLineItem[]>();
  if (invoiceIds.length > 0) {
    const invoices = await db('invoices').whereIn('id', invoiceIds).select('id', 'invoice_no');
    for (const inv of invoices) invoiceNoById.set(Number(inv.id), inv.invoice_no as string);

    const lines = (await db('invoice_lines as il')
      .whereIn('il.invoice_id', invoiceIds)
      .leftJoin('rolls as r', 'il.roll_id', 'r.id')
      .leftJoin('fabrics as f', 'r.fabric_id', 'f.id')
      .leftJoin('colors as col', 'r.color_id', 'col.id')
      .leftJoin('accessories as a', 'il.accessory_id', 'a.id')
      .select(
        'il.invoice_id',
        'il.item_type',
        'il.qty_pieces',
        'il.selling_price_egp',
        'il.line_total_egp',
        'f.name_ar as fabric_name_ar',
        'f.unit as fabric_unit',
        'col.name_ar as color_name_ar',
        'r.roll_sr_no',
        'r.weight_kg',
        'r.length_m',
        'a.name_ar as accessory_name_ar',
      )
      .orderBy('il.id', 'asc')) as LineRow[];
    for (const l of lines) {
      const list = linesByInvoice.get(Number(l.invoice_id)) ?? [];
      list.push(toLineItem(l));
      linesByInvoice.set(Number(l.invoice_id), list);
    }
  }

  const entries: StatementEntry[] = entriesRaw.map((row) => {
    const amount = Number(row.amount_egp);
    const invoiceNo = row.reference_type === 'invoice' && row.reference_id != null
      ? invoiceNoById.get(Number(row.reference_id)) ?? null
      : null;
    const { kind, description, ref } = describe(row, invoiceNo);
    const lineItems = row.entry_type === 'sale' && row.reference_type === 'invoice' && row.reference_id != null
      ? linesByInvoice.get(Number(row.reference_id))
      : undefined;
    return {
      date: cairoDate(row.created_at),
      createdAt: toIso(row.created_at),
      kind,
      description,
      // amount < 0 → owes more → debit; amount > 0 → paid → credit.
      debit: amount < 0 ? -amount : 0,
      credit: amount > 0 ? amount : 0,
      ref,
      ...(lineItems && lineItems.length > 0 ? { lineItems } : {}),
    };
  });

  return {
    titleAr: `كشف حساب عميل: ${customer.name_ar}`,
    currency: 'EGP',
    // The opening balance lives in the ledger as an `opening_balance` entry, so it
    // flows through `entries` above — no separate opening field here.
    openingBalance: 0,
    openingDate: null,
    entries,
  };
}

/** Build the customer statement for the on-screen preview (`json`). */
export async function getCustomerStatement(
  customerId: number,
  from: string,
  to: string,
): Promise<StatementResult> {
  const account = await loadCustomerAccount(customerId);
  return buildStatement(account, from, to);
}

/** Build the customer statement mapped to the shared exporter options. */
export async function getCustomerStatementExport(
  customerId: number,
  from: string,
  to: string,
  variant: 'summary' | 'detailed',
  generatedAt: string,
): Promise<ReportPdfOptions> {
  const result = await getCustomerStatement(customerId, from, to);
  return statementToExport(result, variant, generatedAt);
}
