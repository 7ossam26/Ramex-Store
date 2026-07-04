import { db } from '../../db/connection.js';
import { auditFromService } from '../inventory/audit.helper.js';

/**
 * Exact phrase the super admin must type to confirm a database reset.
 * The frontend mirrors this constant for the confirmation field — keep them
 * in sync (frontend: SettingsPage.tsx `RESET_CONFIRM_PHRASE`). The backend is
 * authoritative; the frontend copy only gates the button for UX.
 */
export const RESET_CONFIRM_PHRASE = 'تصفير قاعدة البيانات';

/**
 * Tables wiped on reset. Only auth and system-config tables are preserved
 * (so the super admin can still log in and the settings rows survive); all
 * operational AND catalog/master data is cleared per the user-facing
 * description, which only promises to keep users, permissions, and settings.
 *
 *   KEEP: users, sessions, settings, settings_versions, role_permissions,
 *         user_permission_overrides.
 *
 * `audit_log` is wiped last; a fresh "reset" entry is written immediately
 * after so the cleared log starts with a record of who reset it.
 *
 * Wipe order is children-before-parents where possible, but `TRUNCATE …
 * CASCADE` handles any straggling FK so the operation is robust to future
 * schema additions.
 */
const WIPE_TABLES = [
  // sales / invoices
  'payments',
  'invoice_status_history',
  'invoice_lines',
  'invoices',
  // returns
  'return_lines',
  'returns',
  // damage / stocktake
  'damage_events',
  'stocktake_lines',
  'stocktakes',
  // inventory movements + shipments
  'stock_movements',
  'shipment_lines',
  'shipments',
  'rolls',
  'lots',
  // customers
  'customer_ledger_entries',
  'customers',
  // finance / treasury
  'cash_movements',
  'bank_movements',
  'expenses',
  'reconciliations',
  'cheques',
  'supplier_payments',
  'supplier_invoices',
  // HR
  'hr_salary_adjustments',
  'hr_salary_disbursements',
  'hr_advance_repayments',
  'hr_employees',
  // catalog / master data (children before parents)
  'fabric_color_prices',
  'fabrics',
  'colors',
  'brands',
  'suppliers',
  'compositions',
  'fabric_grades',
  // shifts + notifications
  'shifts',
  'notifications',
  // audit log (wiped last, then re-seeded with the reset entry)
  'audit_log',
] as const;

// Year-based counter tables — truncating restarts numbering (INV-YYYY-000001 …).
const SEQUENCE_TABLES = ['invoice_sequence', 'shipment_sequence', 'return_sequence'] as const;

export type ResetResult = { wipedTables: number };

/**
 * Wipes all operational data in a single transaction, resets sequence
 * counters and running balances to a fresh-install state, and records the
 * reset in the (now empty) audit log. Throws on any failure — the
 * transaction rolls back so the database is never left half-wiped.
 */
export async function resetOperationalData(actorUserId: number): Promise<ResetResult> {
  const wiped: string[] = [];

  await db.transaction(async (trx) => {
    for (const t of WIPE_TABLES) {
      if (await trx.schema.hasTable(t)) {
        await trx.raw(`TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE`);
        wiped.push(t);
      }
    }

    // Restart year-based invoice/shipment/return numbering.
    for (const t of SEQUENCE_TABLES) {
      if (await trx.schema.hasTable(t)) {
        await trx.raw(`TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE`);
      }
    }

    // Named counters (roll barcodes, customer codes, …) are read by name, so
    // reset their values rather than dropping the rows.
    if (await trx.schema.hasTable('db_sequences')) {
      await trx('db_sequences').update({ last_value: 0 });
    }

    // Cash drawer back to fresh-install state (config row kept).
    if (await trx.schema.hasTable('cash_drawer')) {
      await trx('cash_drawer').update({
        current_balance_egp: 0,
        opening_balance_egp: 0,
        opening_set_at: null,
        last_movement_at: null,
      });
    }

    // Keep configured bank accounts but zero their running balances.
    if (await trx.schema.hasTable('bank_accounts')) {
      await trx('bank_accounts').update({ current_balance_egp: 0 });
    }

    // First entry in the freshly-cleared audit log.
    await auditFromService(trx, {
      actorUserId,
      action: 'admin_database_reset',
      entity: 'system',
      entityId: null,
      after: { wiped_tables: wiped.length },
      severity: 'critical',
    });
  });

  return { wipedTables: wiped.length };
}

export const PARTIAL_RESET_CONFIRM_PHRASE_A = 'تصفير الأرصدة والمبيعات';
export const PARTIAL_RESET_CONFIRM_PHRASE_B = 'تصفير الأرصدة والمبيعات وذمم العملاء';

/** Zeros bank accounts, cash drawer, and resets the invoice sequence for the current year only. */
export async function resetBalancesAndSales(actorUserId: number): Promise<{ ok: true }> {
  await db.transaction(async (trx) => {
    if (await trx.schema.hasTable('bank_accounts')) {
      await trx('bank_accounts').update({ current_balance_egp: 0 });
    }
    if (await trx.schema.hasTable('cash_drawer')) {
      await trx('cash_drawer').update({
        current_balance_egp: 0,
        opening_balance_egp: 0,
        opening_set_at: null,
        last_movement_at: null,
      });
    }
    const year = new Date().getFullYear();
    if (await trx.schema.hasTable('invoice_sequence')) {
      await trx('invoice_sequence').where({ year }).update({ next_no: 1 });
    }
    await auditFromService(trx, {
      actorUserId,
      action: 'admin_partial_reset_balances_sales',
      entity: 'system',
      entityId: null,
      after: { reset_bank_accounts: true, reset_cash_drawer: true, reset_invoice_sequence_year: year },
      severity: 'critical',
    });
  });
  return { ok: true };
}

/** Same as resetBalancesAndSales but also zeros customer current_balance_egp and lifetime_volume_egp. */
export async function resetBalancesSalesAndCustomers(actorUserId: number): Promise<{ ok: true }> {
  await db.transaction(async (trx) => {
    if (await trx.schema.hasTable('bank_accounts')) {
      await trx('bank_accounts').update({ current_balance_egp: 0 });
    }
    if (await trx.schema.hasTable('cash_drawer')) {
      await trx('cash_drawer').update({
        current_balance_egp: 0,
        opening_balance_egp: 0,
        opening_set_at: null,
        last_movement_at: null,
      });
    }
    const year = new Date().getFullYear();
    if (await trx.schema.hasTable('invoice_sequence')) {
      await trx('invoice_sequence').where({ year }).update({ next_no: 1 });
    }
    if (await trx.schema.hasTable('customers')) {
      await trx('customers').update({ current_balance_egp: 0, lifetime_volume_egp: 0 });
    }
    await auditFromService(trx, {
      actorUserId,
      action: 'admin_partial_reset_balances_sales_customers',
      entity: 'system',
      entityId: null,
      after: {
        reset_bank_accounts: true,
        reset_cash_drawer: true,
        reset_invoice_sequence_year: year,
        reset_customer_balances: true,
      },
      severity: 'critical',
    });
  });
  return { ok: true };
}
