import type { Knex } from 'knex';
import { db } from '../../../db/connection.js';
import type {
  ComputedLine,
  Currency,
  Supplier,
  SupplierBalance,
  SupplierInvoice,
  SupplierInvoiceLine,
  SupplierInvoiceWithLines,
  SupplierPayment,
  SupplierWithBalance,
} from './suppliers.types.js';

const SUPPLIER_COLS = [
  'id',
  'arabic_name',
  'english_name',
  'phone',
  'currency',
  'opening_balance',
  'opening_balance_date',
  'is_active',
  'created_by_user_id',
  'created_at',
  'updated_at',
] as const;

export async function getSupplier(id: number): Promise<Supplier | undefined> {
  return db('suppliers').where({ id }).select(...SUPPLIER_COLS).first() as Promise<Supplier | undefined>;
}

export async function listSuppliersWithBalance(): Promise<SupplierWithBalance[]> {
  const suppliers = await db('suppliers')
    .where({ is_active: true })
    .select('id', 'arabic_name', 'english_name', 'phone', 'currency', 'opening_balance', 'opening_balance_date', 'is_active')
    .orderBy('arabic_name');

  if (suppliers.length === 0) return [];

  const invoiceTotals = await db('supplier_invoices')
    .groupBy('supplier_id')
    .select('supplier_id')
    .sum('amount_egp as total');

  const paymentTotals = await db('supplier_payments')
    .groupBy('supplier_id')
    .select('supplier_id')
    .sum('amount_egp as total');

  const invoiceMap = new Map(invoiceTotals.map((r) => [Number(r.supplier_id), Number(r.total ?? 0)]));
  const paymentMap = new Map(paymentTotals.map((r) => [Number(r.supplier_id), Number(r.total ?? 0)]));

  return suppliers.map((s) => {
    const invoiced = invoiceMap.get(s.id) ?? 0;
    const paid = paymentMap.get(s.id) ?? 0;
    const opening = Number(s.opening_balance ?? 0);
    return {
      id: s.id,
      arabic_name: s.arabic_name,
      english_name: s.english_name,
      phone: s.phone ?? null,
      currency: s.currency as Currency,
      opening_balance: opening,
      opening_balance_date: s.opening_balance_date ?? null,
      is_active: s.is_active,
      total_invoiced_egp: invoiced,
      total_paid_egp: paid,
      balance_egp: opening + invoiced - paid,
    };
  });
}

export async function getSupplierBalance(supplierId: number): Promise<SupplierBalance> {
  const supplier = await db('suppliers')
    .where({ id: supplierId })
    .select('currency', 'opening_balance')
    .first();
  const [{ inv }] = await db('supplier_invoices').where({ supplier_id: supplierId }).sum<[{ inv: string | null }]>('amount_egp as inv');
  const [{ paid }] = await db('supplier_payments').where({ supplier_id: supplierId }).sum<[{ paid: string | null }]>('amount_egp as paid');
  const invoiced = Number(inv ?? 0);
  const totalPaid = Number(paid ?? 0);
  const opening = Number(supplier?.opening_balance ?? 0);
  return {
    currency: (supplier?.currency ?? 'EGP') as Currency,
    opening_balance: opening,
    total_invoiced_egp: invoiced,
    total_paid_egp: totalPaid,
    balance_egp: opening + invoiced - totalPaid,
  };
}

export async function supplierHasTransactions(supplierId: number): Promise<boolean> {
  const inv = await db('supplier_invoices').where({ supplier_id: supplierId }).first('id');
  if (inv) return true;
  const pay = await db('supplier_payments').where({ supplier_id: supplierId }).first('id');
  return !!pay;
}

export async function createSupplier(
  data: {
    arabic_name: string;
    english_name: string | null;
    phone: string | null;
    currency: Currency;
    opening_balance: number;
    opening_balance_date: string | null;
    created_by_user_id: number;
  },
): Promise<Supplier> {
  const [{ id }] = await db('suppliers').insert(data).returning('id');
  return getSupplier(Number(id)) as Promise<Supplier>;
}

export async function updateSupplier(
  id: number,
  patch: Partial<{
    arabic_name: string;
    english_name: string | null;
    phone: string | null;
    currency: Currency;
    opening_balance: number;
    opening_balance_date: string | null;
  }>,
): Promise<Supplier | undefined> {
  await db('suppliers').where({ id }).update({ ...patch, updated_at: db.fn.now() });
  return getSupplier(id);
}

export async function deactivateSupplier(id: number): Promise<void> {
  await db('suppliers').where({ id }).update({ is_active: false, updated_at: db.fn.now() });
}

export async function listInvoices(supplierId: number): Promise<SupplierInvoice[]> {
  return db('supplier_invoices as si')
    .leftJoin('suppliers as s', 'si.supplier_id', 's.id')
    .where('si.supplier_id', supplierId)
    .select('si.*', 's.arabic_name as supplier_name')
    .orderBy('si.invoice_date', 'desc')
    .orderBy('si.created_at', 'desc') as Promise<SupplierInvoice[]>;
}

/** All invoices for a supplier, each with its line items — for the statement engine. */
export async function listInvoicesWithLines(supplierId: number): Promise<SupplierInvoiceWithLines[]> {
  const invoices = (await db('supplier_invoices')
    .where({ supplier_id: supplierId })
    .orderBy('invoice_date', 'asc')
    .orderBy('created_at', 'asc')
    .select('*')) as SupplierInvoice[];
  if (invoices.length === 0) return [];

  const ids = invoices.map((i) => i.id);
  const lines = (await db('supplier_invoice_lines')
    .whereIn('supplier_invoice_id', ids)
    .orderBy('id')
    .select('*')) as SupplierInvoiceLine[];

  const byInvoice = new Map<number, SupplierInvoiceLine[]>();
  for (const l of lines) {
    const arr = byInvoice.get(l.supplier_invoice_id);
    if (arr) arr.push(l);
    else byInvoice.set(l.supplier_invoice_id, [l]);
  }

  return invoices.map((inv) => ({ ...inv, lines: byInvoice.get(inv.id) ?? [] }));
}

export async function listPayments(supplierId: number): Promise<SupplierPayment[]> {
  return db('supplier_payments as sp')
    .leftJoin('suppliers as s', 'sp.supplier_id', 's.id')
    .leftJoin('bank_accounts as b', 'sp.bank_account_id', 'b.id')
    .leftJoin('users as u', 'sp.actor_user_id', 'u.id')
    .where('sp.supplier_id', supplierId)
    .select('sp.*', 's.arabic_name as supplier_name', 'b.name_ar as bank_name_ar', 'u.username as actor_username')
    .orderBy('sp.paid_at', 'desc')
    .orderBy('sp.created_at', 'desc') as Promise<SupplierPayment[]>;
}

export async function getPayment(id: number): Promise<SupplierPayment | undefined> {
  return db('supplier_payments as sp')
    .leftJoin('bank_accounts as b', 'sp.bank_account_id', 'b.id')
    .leftJoin('users as u', 'sp.actor_user_id', 'u.id')
    .where('sp.id', id)
    .select('sp.*', 'b.name_ar as bank_name_ar', 'u.username as actor_username')
    .first() as Promise<SupplierPayment | undefined>;
}

export async function insertInvoice(
  trxOrDb: Knex | Knex.Transaction,
  data: {
    supplier_id: number;
    invoice_no: string | null;
    internal_no: string | null;
    invoice_date: string;
    due_date: string | null;
    amount_egp: number;
    subtotal: number;
    extra_charges: number;
    total: number;
    currency: Currency;
    notes_ar: string | null;
    source: 'manual' | 'shipment_receive';
    source_ref: number | null;
    created_by_user_id: number;
  },
): Promise<SupplierInvoice> {
  const [{ id }] = await trxOrDb('supplier_invoices').insert(data).returning('id');
  return trxOrDb('supplier_invoices').where({ id }).first() as Promise<SupplierInvoice>;
}

export async function updateInvoiceRow(
  trx: Knex.Transaction,
  id: number,
  patch: Partial<{
    invoice_no: string | null;
    invoice_date: string;
    due_date: string | null;
    amount_egp: number;
    subtotal: number;
    extra_charges: number;
    total: number;
    notes_ar: string | null;
  }>,
): Promise<void> {
  await trx('supplier_invoices').where({ id }).update(patch);
}

export async function deleteInvoice(trx: Knex.Transaction, id: number): Promise<void> {
  // Lines cascade via the ON DELETE CASCADE FK.
  await trx('supplier_invoices').where({ id }).delete();
}

export async function listLines(
  trxOrDb: Knex | Knex.Transaction,
  invoiceId: number,
): Promise<SupplierInvoiceLine[]> {
  return trxOrDb('supplier_invoice_lines')
    .where({ supplier_invoice_id: invoiceId })
    .orderBy('id')
    .select('*') as Promise<SupplierInvoiceLine[]>;
}

export async function insertLines(
  trx: Knex.Transaction,
  invoiceId: number,
  lines: ComputedLine[],
): Promise<void> {
  if (lines.length === 0) return;
  await trx('supplier_invoice_lines').insert(
    lines.map((l) => ({
      supplier_invoice_id: invoiceId,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unit_price: l.unit_price,
      line_total: l.line_total,
    })),
  );
}

export async function deleteLines(trx: Knex.Transaction, invoiceId: number): Promise<void> {
  await trx('supplier_invoice_lines').where({ supplier_invoice_id: invoiceId }).delete();
}

export async function getInvoiceWithLines(
  trxOrDb: Knex | Knex.Transaction,
  id: number,
): Promise<SupplierInvoiceWithLines | undefined> {
  const invoice = (await trxOrDb('supplier_invoices as si')
    .leftJoin('suppliers as s', 'si.supplier_id', 's.id')
    .where('si.id', id)
    .select('si.*', 's.arabic_name as supplier_name')
    .first()) as SupplierInvoice | undefined;
  if (!invoice) return undefined;
  const lines = await listLines(trxOrDb, id);
  return { ...invoice, lines };
}

export async function insertPayment(
  trx: Knex.Transaction,
  data: {
    supplier_id: number;
    amount_egp: number;
    currency: Currency;
    paid_at: string;
    method: 'cash' | 'instapay' | 'bank_transfer';
    bank_account_id: number | null;
    notes_ar: string | null;
    actor_user_id: number;
  },
): Promise<SupplierPayment> {
  const [{ id }] = await trx('supplier_payments').insert(data).returning('id');
  return trx('supplier_payments as sp')
    .leftJoin('bank_accounts as b', 'sp.bank_account_id', 'b.id')
    .leftJoin('users as u', 'sp.actor_user_id', 'u.id')
    .where('sp.id', id)
    .select('sp.*', 'b.name_ar as bank_name_ar', 'u.username as actor_username')
    .first() as Promise<SupplierPayment>;
}

export async function updatePayment(
  trx: Knex.Transaction,
  id: number,
  patch: Partial<{
    amount_egp: number;
    paid_at: string;
    method: 'cash' | 'instapay' | 'bank_transfer';
    bank_account_id: number | null;
    notes_ar: string | null;
  }>,
): Promise<SupplierPayment> {
  await trx('supplier_payments').where({ id }).update(patch);
  return trx('supplier_payments as sp')
    .leftJoin('bank_accounts as b', 'sp.bank_account_id', 'b.id')
    .leftJoin('users as u', 'sp.actor_user_id', 'u.id')
    .where('sp.id', id)
    .select('sp.*', 'b.name_ar as bank_name_ar', 'u.username as actor_username')
    .first() as Promise<SupplierPayment>;
}

export async function deletePayment(trx: Knex.Transaction, id: number): Promise<void> {
  await trx('supplier_payments').where({ id }).delete();
}
