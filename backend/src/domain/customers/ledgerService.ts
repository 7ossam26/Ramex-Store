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

    const [entryId] = await trx('customer_ledger_entries').insert({
      customer_id: customerId,
      entry_type: entryType,
      reference_type: referenceType ?? null,
      reference_id: referenceId ?? null,
      amount_egp: amountEgp,
      balance_after_egp: newBalance,
      notes_ar: notesAr ?? null,
      actor_user_id: actorUserId,
    });
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
