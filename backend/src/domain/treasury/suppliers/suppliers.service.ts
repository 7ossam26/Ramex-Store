import { db } from '../../../db/connection.js';
import { auditFromService } from '../../inventory/audit.helper.js';
import { recordMovement as cashRecordMovement } from '../../finance/cashDrawerService.js';
import { recordMovement as bankRecordMovement } from '../../finance/bankService.js';
import * as repo from './suppliers.repository.js';
import type { SupplierInvoice, SupplierPayment, SupplierWithBalance } from './suppliers.types.js';
import type { CreateSupplierInvoiceInput, CreateSupplierPaymentInput } from './suppliers.schemas.js';

export async function listSuppliersWithBalance(): Promise<SupplierWithBalance[]> {
  return repo.listSuppliersWithBalance();
}

export async function getSupplierBalance(supplierId: number) {
  return repo.getSupplierBalance(supplierId);
}

export async function getLedger(supplierId: number) {
  const [invoices, payments, balance] = await Promise.all([
    repo.listInvoices(supplierId),
    repo.listPayments(supplierId),
    repo.getSupplierBalance(supplierId),
  ]);
  return { invoices, payments, balance };
}

export async function createInvoice(
  data: CreateSupplierInvoiceInput,
  actorUserId: number,
): Promise<SupplierInvoice> {
  const invoice = await repo.insertInvoice(db, {
    supplier_id: data.supplier_id,
    invoice_no: data.invoice_no ?? null,
    invoice_date: data.invoice_date,
    amount_egp: data.amount_egp,
    notes_ar: data.notes_ar ?? null,
    source: 'manual',
    source_ref: null,
    created_by_user_id: actorUserId,
  });

  await auditFromService(db, {
    actorUserId,
    action: 'supplier_invoice_created',
    entity: 'supplier_invoice',
    entityId: invoice.id,
    after: { supplier_id: data.supplier_id, amount_egp: data.amount_egp, source: 'manual' },
    severity: 'medium',
  });

  return invoice;
}

export async function recordPayment(
  data: CreateSupplierPaymentInput,
  actorUserId: number,
): Promise<SupplierPayment> {
  return db.transaction(async (trx) => {
    const paidAt = data.paid_at ?? new Date().toISOString();

    const payment = await repo.insertPayment(trx, {
      supplier_id: data.supplier_id,
      amount_egp: data.amount_egp,
      paid_at: paidAt,
      method: data.method,
      bank_account_id: data.bank_account_id ?? null,
      notes_ar: data.notes_ar ?? null,
      actor_user_id: actorUserId,
    });

    // Debit cash drawer or bank account
    const supplierRow = await trx('suppliers').where({ id: data.supplier_id }).first() as { arabic_name: string } | undefined;
    const supplierName = supplierRow?.arabic_name ?? `#${data.supplier_id}`;

    if (data.method === 'cash') {
      await cashRecordMovement(
        trx, 'out', 'expense', data.amount_egp, actorUserId,
        'supplier_payment', payment.id,
        `دفعة مورد: ${supplierName}`,
      );
    } else if (data.bank_account_id) {
      await bankRecordMovement(
        trx, data.bank_account_id, 'out', 'other_out', data.amount_egp, actorUserId,
        'supplier_payment', payment.id,
        `دفعة مورد: ${supplierName}`,
      );
    }

    await auditFromService(trx, {
      actorUserId,
      action: 'supplier_payment_recorded',
      entity: 'supplier_payment',
      entityId: payment.id,
      after: { supplier_id: data.supplier_id, amount_egp: data.amount_egp, method: data.method },
      severity: 'high',
    });

    return payment;
  });
}
