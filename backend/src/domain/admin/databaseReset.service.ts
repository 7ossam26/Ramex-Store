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
 * Operational / transactional tables wiped on reset. Auth, config, catalog
 * master data, and lookup-code tables are intentionally preserved per the
 * super-admin "wipe operational data only" scope (see CORE_PLAN §4/§14):
 *
 *   KEEP: users, sessions, settings, settings_versions, role_permissions,
 *         user_permission_overrides, fabric_grades, compositions, brands,
 *         fabrics, colors, fabric_color_prices.
 *
 * `audit_log` is wiped last; a fresh "reset" entry is written immediately
 * after so the cleared log starts with a record of who reset it.
 *
 * `suppliers` is wiped separately at the end (not via TRUNCATE CASCADE) so
 * the brand→supplier FK can be NULLed first without taking `brands` down
 * with it.
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

    // Suppliers: detach the brand→supplier link (brands is master data and
    // must survive), then delete supplier rows and restart the id sequence.
    // TRUNCATE CASCADE would drag brands with it because of the RESTRICT FK.
    if (await trx.schema.hasTable('suppliers')) {
      if (await trx.schema.hasTable('brands')) {
        await trx('brands').whereNotNull('supplier_id').update({ supplier_id: null });
      }
      await trx.raw('DELETE FROM "suppliers"');
      await trx.raw(
        `SELECT setval(pg_get_serial_sequence('suppliers', 'id'), 1, false)`,
      );
      wiped.push('suppliers');
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
