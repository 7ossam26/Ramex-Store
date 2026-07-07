import { db } from '../../../db/connection.js';
import { auditFromService } from '../../inventory/audit.helper.js';
import * as repo from './suppliers.repository.js';
import type { Supplier, SupplierInvoice, SupplierPayment, SupplierWithBalance } from './suppliers.types.js';
import type {
  CreateSupplierInput,
  CreateSupplierInvoiceInput,
  CreateSupplierPaymentInput,
  UpdateSupplierInput,
  UpdateSupplierPaymentInput,
} from './suppliers.schemas.js';

export class SupplierValidationError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 422) {
    super(message);
  }
}

// ─── Suppliers CRUD ─────────────────────────────────────────────────────────

export async function listSuppliersWithBalance(): Promise<SupplierWithBalance[]> {
  return repo.listSuppliersWithBalance();
}

export async function getSupplierBalance(supplierId: number) {
  return repo.getSupplierBalance(supplierId);
}

export async function createSupplier(
  data: CreateSupplierInput,
  actorUserId: number,
): Promise<Supplier> {
  const supplier = await repo.createSupplier({
    arabic_name: data.arabic_name.trim(),
    english_name: data.english_name?.trim() || null,
    phone: data.phone?.trim() || null,
    currency: data.currency,
    opening_balance: data.opening_balance ?? 0,
    opening_balance_date: data.opening_balance_date ?? null,
    created_by_user_id: actorUserId,
  });

  await auditFromService(db, {
    actorUserId,
    action: 'supplier_created',
    entity: 'supplier',
    entityId: supplier.id,
    after: {
      arabic_name: supplier.arabic_name,
      currency: supplier.currency,
      opening_balance: supplier.opening_balance,
    },
    severity: 'medium',
  });

  return supplier;
}

export async function updateSupplier(
  id: number,
  patch: UpdateSupplierInput,
  actorUserId: number,
): Promise<Supplier> {
  const before = await repo.getSupplier(id);
  if (!before) throw new SupplierValidationError('SUPPLIER_NOT_FOUND', 'المورد غير موجود', 404);

  // Currency is immutable once any invoice or payment exists; changing it silently
  // would corrupt the meaning of every stored amount. Reject clearly.
  if (patch.currency && patch.currency !== before.currency) {
    if (await repo.supplierHasTransactions(id)) {
      throw new SupplierValidationError(
        'SUPPLIER_CURRENCY_LOCKED',
        'لا يمكن تغيير عملة المورد بعد تسجيل فواتير أو دفعات',
      );
    }
  }

  const dbPatch: Parameters<typeof repo.updateSupplier>[1] = {};
  if (patch.arabic_name !== undefined) dbPatch.arabic_name = patch.arabic_name.trim();
  if (patch.english_name !== undefined) dbPatch.english_name = patch.english_name?.trim() || null;
  if (patch.phone !== undefined) dbPatch.phone = patch.phone?.trim() || null;
  if (patch.currency !== undefined) dbPatch.currency = patch.currency;
  if (patch.opening_balance !== undefined) dbPatch.opening_balance = patch.opening_balance;
  if (patch.opening_balance_date !== undefined) dbPatch.opening_balance_date = patch.opening_balance_date;

  const after = await repo.updateSupplier(id, dbPatch);

  await auditFromService(db, {
    actorUserId,
    action: 'supplier_updated',
    entity: 'supplier',
    entityId: id,
    before,
    after,
    severity: 'medium',
  });

  return after as Supplier;
}

export async function deactivateSupplier(id: number, actorUserId: number): Promise<void> {
  const before = await repo.getSupplier(id);
  if (!before) throw new SupplierValidationError('SUPPLIER_NOT_FOUND', 'المورد غير موجود', 404);

  await repo.deactivateSupplier(id);

  await auditFromService(db, {
    actorUserId,
    action: 'supplier_deactivated',
    entity: 'supplier',
    entityId: id,
    before,
    after: { ...before, is_active: false },
    severity: 'medium',
  });
}

// ─── Ledger ─────────────────────────────────────────────────────────────────

export async function getLedger(supplierId: number) {
  const [supplier, invoices, payments, balance] = await Promise.all([
    repo.getSupplier(supplierId),
    repo.listInvoices(supplierId),
    repo.listPayments(supplierId),
    repo.getSupplierBalance(supplierId),
  ]);
  return { supplier, invoices, payments, balance };
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

export async function createInvoice(
  data: CreateSupplierInvoiceInput,
  actorUserId: number,
): Promise<SupplierInvoice> {
  const supplier = await repo.getSupplier(data.supplier_id);
  if (!supplier) throw new SupplierValidationError('SUPPLIER_NOT_FOUND', 'المورد غير موجود', 404);

  const invoice = await repo.insertInvoice(db, {
    supplier_id: data.supplier_id,
    invoice_no: data.invoice_no ?? null,
    invoice_date: data.invoice_date,
    amount_egp: data.amount_egp,
    currency: supplier.currency,
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
    after: { supplier_id: data.supplier_id, amount_egp: data.amount_egp, currency: supplier.currency, source: 'manual' },
    severity: 'medium',
  });

  return invoice;
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export async function recordPayment(
  data: CreateSupplierPaymentInput,
  actorUserId: number,
): Promise<SupplierPayment> {
  const supplier = await repo.getSupplier(data.supplier_id);
  if (!supplier) throw new SupplierValidationError('SUPPLIER_NOT_FOUND', 'المورد غير موجود', 404);

  return db.transaction(async (trx) => {
    const paidAt = data.paid_at ?? new Date().toISOString();

    const payment = await repo.insertPayment(trx, {
      supplier_id: data.supplier_id,
      amount_egp: data.amount_egp,
      currency: supplier.currency,
      paid_at: paidAt,
      method: data.method,
      bank_account_id: data.bank_account_id ?? null,
      notes_ar: data.notes_ar ?? null,
      actor_user_id: actorUserId,
    });

    // Supplier payments are off-treasury: no cash drawer / bank debit.
    // `method` and `bank_account_id` are retained as informational only.

    await auditFromService(trx, {
      actorUserId,
      action: 'supplier_payment_recorded',
      entity: 'supplier_payment',
      entityId: payment.id,
      after: { supplier_id: data.supplier_id, amount_egp: data.amount_egp, currency: supplier.currency, method: data.method },
      severity: 'high',
    });

    return payment;
  });
}

export async function updatePayment(
  id: number,
  patch: UpdateSupplierPaymentInput,
  actorUserId: number,
): Promise<SupplierPayment> {
  const before = await repo.getPayment(id);
  if (!before) throw new SupplierValidationError('PAYMENT_NOT_FOUND', 'الدفعة غير موجودة', 404);

  // Non-cash methods require a bank account (informational).
  const method = patch.method ?? before.method;
  const bankAccountId = patch.bank_account_id !== undefined ? patch.bank_account_id : before.bank_account_id;
  if (method !== 'cash' && bankAccountId == null) {
    throw new SupplierValidationError('BANK_ACCOUNT_REQUIRED', 'الحساب البنكي مطلوب لطرق الدفع غير النقدي', 400);
  }

  return db.transaction(async (trx) => {
    const dbPatch: Parameters<typeof repo.updatePayment>[2] = {};
    if (patch.amount_egp !== undefined) dbPatch.amount_egp = patch.amount_egp;
    if (patch.paid_at !== undefined) dbPatch.paid_at = patch.paid_at;
    if (patch.method !== undefined) dbPatch.method = patch.method;
    if (patch.bank_account_id !== undefined) dbPatch.bank_account_id = patch.bank_account_id;
    if (patch.notes_ar !== undefined) dbPatch.notes_ar = patch.notes_ar;
    // Cash payments never carry a bank account.
    if (method === 'cash') dbPatch.bank_account_id = null;

    const after = await repo.updatePayment(trx, id, dbPatch);

    // Off-treasury: editing a payment moves no cash/bank money.
    await auditFromService(trx, {
      actorUserId,
      action: 'supplier_payment_updated',
      entity: 'supplier_payment',
      entityId: id,
      before,
      after,
      severity: 'high',
    });

    return after;
  });
}

export async function deletePayment(id: number, actorUserId: number): Promise<void> {
  const before = await repo.getPayment(id);
  if (!before) throw new SupplierValidationError('PAYMENT_NOT_FOUND', 'الدفعة غير موجودة', 404);

  await db.transaction(async (trx) => {
    await repo.deletePayment(trx, id);

    // Off-treasury: deleting a payment reverses no cash/bank movement.
    await auditFromService(trx, {
      actorUserId,
      action: 'supplier_payment_deleted',
      entity: 'supplier_payment',
      entityId: id,
      before,
      severity: 'high',
    });
  });
}
