import type { Knex } from 'knex';
import { db } from '../../../db/connection.js';
import type { SupplierInvoice, SupplierPayment, SupplierWithBalance } from './suppliers.types.js';
import type { CreateSupplierInvoiceInput, CreateSupplierPaymentInput } from './suppliers.schemas.js';

export async function listSuppliersWithBalance(): Promise<SupplierWithBalance[]> {
  const suppliers = await db('suppliers').where({ is_active: true }).select('id', 'arabic_name', 'english_name', 'phone', 'is_active').orderBy('arabic_name');

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
    return {
      id: s.id,
      arabic_name: s.arabic_name,
      english_name: s.english_name,
      phone: s.phone ?? null,
      is_active: s.is_active,
      total_invoiced_egp: invoiced,
      total_paid_egp: paid,
      balance_egp: invoiced - paid,
    };
  });
}

export async function getSupplierBalance(supplierId: number): Promise<{ total_invoiced_egp: number; total_paid_egp: number; balance_egp: number }> {
  const [{ inv }] = await db('supplier_invoices').where({ supplier_id: supplierId }).sum<[{ inv: string | null }]>('amount_egp as inv');
  const [{ paid }] = await db('supplier_payments').where({ supplier_id: supplierId }).sum<[{ paid: string | null }]>('amount_egp as paid');
  const invoiced = Number(inv ?? 0);
  const totalPaid = Number(paid ?? 0);
  return { total_invoiced_egp: invoiced, total_paid_egp: totalPaid, balance_egp: invoiced - totalPaid };
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

export async function insertInvoice(
  trxOrDb: Knex | Knex.Transaction,
  data: {
    supplier_id: number;
    invoice_no: string | null;
    invoice_date: string;
    amount_egp: number;
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
