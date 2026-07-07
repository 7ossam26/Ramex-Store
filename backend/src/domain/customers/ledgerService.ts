import type { Knex } from 'knex';
import { db } from '../../db/connection.js';
import { auditFromService } from '../inventory/audit.helper.js';
import type { Customer, LedgerEntry, LedgerEntryType } from './customers.types.js';

export async function appendEntry(
  customerId: number,
  actorUserId: number,
  entryType: LedgerEntryType,
  amountEgp: number,
  referenceType?: string | null,
  referenceId?: number | null,
  notesAr?: string | null,
): Promise<{ customer: Customer; entry: LedgerEntry }> {
  return db.transaction(async (trx) => {
    const customer = await trx('customers').where({ id: customerId }).forUpdate().first();
    if (!customer) throw new Error('CUSTOMER_NOT_FOUND');

    const prevBalance = Number(customer.current_balance_egp);
    const prevLifetime = Number(customer.lifetime_volume_egp);

    const newBalance = prevBalance + amountEgp;
    const newLifetime =
      entryType === 'sale' || entryType === 'refund'
        ? prevLifetime + amountEgp
        : prevLifetime;

    const [{ id: entryId }] = await trx('customer_ledger_entries').insert({
      customer_id: customerId,
      entry_type: entryType,
      reference_type: referenceType ?? null,
      reference_id: referenceId ?? null,
      amount_egp: amountEgp,
      balance_after_egp: newBalance,
      notes_ar: notesAr ?? null,
      actor_user_id: actorUserId,
    }).returning('id');
    const entry = await trx('customer_ledger_entries').where({ id: entryId }).first();

    await trx('customers').where({ id: customerId }).update({
      current_balance_egp: newBalance,
      lifetime_volume_egp: newLifetime,
      updated_at: trx.fn.now(),
    });
    const updated = await trx('customers').where({ id: customerId }).first();

    await auditFromService(trx, {
      actorUserId,
      action: 'append_ledger_entry',
      entity: 'customer',
      entityId: customerId,
      before: { current_balance_egp: prevBalance, lifetime_volume_egp: prevLifetime },
      after: {
        current_balance_egp: newBalance,
        lifetime_volume_egp: newLifetime,
        entry_type: entryType,
        amount_egp: amountEgp,
      },
      severity: 'low',
    });

    return { customer: updated as Customer, entry: entry as LedgerEntry };
  });
}

/**
 * Record a **standalone receipt** — a payment collected outside a specific POS
 * sale (e.g. the customer walks in to pay down old debt). Reuses {@link appendEntry}
 * so it updates `current_balance_egp`, writes `balance_after_egp`, and audits under
 * a row lock. A `'payment'` entry does not inflate `lifetime_volume_egp`.
 *
 * `amount` is a positive figure; it is posted as a positive ledger amount, exactly
 * like an invoice payment (`invoices.service.ts`), so it **reduces** what the
 * customer owes (their balance moves toward / above zero).
 */
export async function recordStandaloneReceipt(
  customerId: number,
  amount: number,
  notesAr: string | null,
  actorUserId: number,
): Promise<{ customer: Customer; entry: LedgerEntry }> {
  return appendEntry(customerId, actorUserId, 'payment', amount, 'standalone', null, notesAr);
}

/**
 * Recompute `balance_after_egp` for every ledger entry of a customer in
 * chronological order and reconcile `current_balance_egp`. Used after an opening
 * balance is inserted/edited (it is back-dated and shifts the running balance of
 * later rows). Leaves `lifetime_volume_egp` untouched.
 */
async function recomputeBalances(trx: Knex.Transaction, customerId: number): Promise<number> {
  const rows = (await trx('customer_ledger_entries')
    .where({ customer_id: customerId })
    .orderBy('created_at', 'asc')
    .orderBy('id', 'asc')
    .select('id', 'amount_egp')) as Array<{ id: number; amount_egp: string }>;

  let running = 0;
  for (const r of rows) {
    running = Math.round((running + Number(r.amount_egp) + Number.EPSILON) * 100) / 100;
    await trx('customer_ledger_entries').where({ id: r.id }).update({ balance_after_egp: running });
  }
  await trx('customers').where({ id: customerId }).update({
    current_balance_egp: running,
    updated_at: trx.fn.now(),
  });
  return running;
}

/**
 * Set (or update) a customer's one-time **opening balance** as a synthetic ledger
 * entry (`entry_type='adjustment'`, `reference_type='opening_balance'`) back-dated
 * to `asOfDate`. `signedAmount` follows the ledger convention: **negative = the
 * customer owes us** (مدين), positive = the customer has credit (دائن). If an
 * opening entry already exists it is updated in place (and re-audited). All ledger
 * balances are recomputed so the entry rolls into the statement's brought-forward
 * line and the ledger tab stays consistent.
 */
export async function setCustomerOpeningBalance(
  customerId: number,
  signedAmount: number,
  asOfDate: string,
  actorUserId: number,
  notesAr?: string | null,
): Promise<{ customer: Customer; entry: LedgerEntry }> {
  // Noon UTC keeps the Cairo calendar day equal to `asOfDate` (no midnight edge).
  const createdAt = new Date(`${asOfDate}T12:00:00.000Z`);

  return db.transaction(async (trx) => {
    const customer = await trx('customers').where({ id: customerId }).forUpdate().first();
    if (!customer) throw new Error('CUSTOMER_NOT_FOUND');

    const existing = await trx('customer_ledger_entries')
      .where({ customer_id: customerId, reference_type: 'opening_balance' })
      .first();

    let entryId: number;
    if (existing) {
      await trx('customer_ledger_entries').where({ id: existing.id }).update({
        amount_egp: signedAmount,
        notes_ar: notesAr ?? null,
        actor_user_id: actorUserId,
        created_at: createdAt,
      });
      entryId = existing.id;
    } else {
      const [inserted] = await trx('customer_ledger_entries').insert({
        customer_id: customerId,
        entry_type: 'adjustment',
        reference_type: 'opening_balance',
        reference_id: null,
        amount_egp: signedAmount,
        balance_after_egp: 0, // reconciled by recomputeBalances below
        notes_ar: notesAr ?? null,
        actor_user_id: actorUserId,
        created_at: createdAt,
      }).returning('id');
      entryId = Number(inserted.id ?? inserted);
    }

    const newBalance = await recomputeBalances(trx, customerId);
    const entry = await trx('customer_ledger_entries').where({ id: entryId }).first();
    const updated = await trx('customers').where({ id: customerId }).first();

    await auditFromService(trx, {
      actorUserId,
      action: existing ? 'update_opening_balance' : 'set_opening_balance',
      entity: 'customer',
      entityId: customerId,
      before: existing ? { amount_egp: Number(existing.amount_egp) } : undefined,
      after: { amount_egp: signedAmount, as_of_date: asOfDate, current_balance_egp: newBalance },
      severity: 'medium',
    });

    return { customer: updated as Customer, entry: entry as LedgerEntry };
  });
}
