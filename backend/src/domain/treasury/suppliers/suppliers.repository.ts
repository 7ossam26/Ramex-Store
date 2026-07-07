import type { Knex } from 'knex';
import { db } from '../../../db/connection.js';
import type {
  Currency,
  Supplier,
  SupplierBalance,
  SupplierInvoice,
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
    invoice_date: string;
    amount_egp: number;
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
