/**
 * Migration 072 — Seed full role_permissions for all operational roles.
 *
 * DATA SOURCE: shared/permissions/catalog.ts (ROLE_DEFAULTS).
 * The data below is intentionally inlined to stay within the backend's TypeScript
 * rootDir boundary. The parity script (backend/scripts/audit-routes.ts) detects
 * any drift between this migration's data and the shared catalog.
 *
 * Strategy:
 *   - onConflict(['role','resource','action']).ignore()
 *     → Existing rows (including admin customisations) are NEVER overwritten.
 *     → Only missing rows are inserted.
 *   - Inserted IDs are recorded in _seed_audit_072 for safe rollback.
 *   - down() deletes only the rows this migration inserted, then drops the audit table.
 *
 * Also adds inventory.approve rows (new action, approved in the permissions restructuring).
 */

import type { Knex } from 'knex';

type Perm = { resource: string; action: string; is_allowed: boolean };

// ─── Role defaults ─────────────────────────────────────────────────────────────
// Keep in sync with shared/permissions/catalog.ts ROLE_DEFAULTS.
// The parity script will report any divergence.

const OWNER_PERMS: Perm[] = [
  { resource: 'customers',    action: 'read',    is_allowed: true  },
  { resource: 'customers',    action: 'write',   is_allowed: true  },
  { resource: 'invoices',     action: 'read',    is_allowed: true  },
  { resource: 'invoices',     action: 'write',   is_allowed: true  },
  { resource: 'invoices',     action: 'approve', is_allowed: true  },
  { resource: 'returns',      action: 'read',    is_allowed: true  },
  { resource: 'returns',      action: 'write',   is_allowed: true  },
  { resource: 'returns',      action: 'approve', is_allowed: true  },
  { resource: 'fabric_rolls', action: 'read',    is_allowed: true  },
  { resource: 'fabric_rolls', action: 'write',   is_allowed: true  },
  { resource: 'inventory',    action: 'read',    is_allowed: true  },
  { resource: 'inventory',    action: 'write',   is_allowed: true  },
  { resource: 'inventory',    action: 'approve', is_allowed: true  },
  { resource: 'shipments',    action: 'read',    is_allowed: true  },
  { resource: 'shipments',    action: 'write',   is_allowed: true  },
  { resource: 'shipments',    action: 'approve', is_allowed: true  },
  { resource: 'cash_drawer',  action: 'read',    is_allowed: true  },
  { resource: 'cash_drawer',  action: 'write',   is_allowed: true  },
  { resource: 'hr',           action: 'view',             is_allowed: true  },
  { resource: 'hr',           action: 'manage',           is_allowed: true  },
  { resource: 'hr',           action: 'salary.disburse',  is_allowed: true  },
  { resource: 'hr',           action: 'advance.create',   is_allowed: true  },
  { resource: 'hr',           action: 'deduction.create', is_allowed: true  },
  { resource: 'suppliers',    action: 'view',           is_allowed: true  },
  { resource: 'suppliers',    action: 'write',          is_allowed: true  },
  { resource: 'suppliers',    action: 'payments.write', is_allowed: true  },
  { resource: 'reports.general',                 action: 'read', is_allowed: true  },
  { resource: 'reports.daily',                   action: 'read', is_allowed: true  },
  { resource: 'reports.salesByPaymentMethod',    action: 'read', is_allowed: true  },
  { resource: 'reports.customerLedger',          action: 'read', is_allowed: true  },
  { resource: 'reports.outstandingOpenInvoices', action: 'read', is_allowed: true  },
  { resource: 'reports.salesByFabricColor',      action: 'read', is_allowed: true  },
  { resource: 'reports.stocktakeInventory',      action: 'read', is_allowed: true  },
  { resource: 'reports.stockByWarehouse',        action: 'read', is_allowed: true  },
  { resource: 'reports.agingInventory',          action: 'read', is_allowed: true  },
  { resource: 'reports.shipmentsSummary',        action: 'read', is_allowed: true  },
  { resource: 'reports.returnsReport',           action: 'read', is_allowed: true  },
  { resource: 'reports.outstandingCheques',      action: 'read', is_allowed: true  },
  { resource: 'reports.cashFlow',                action: 'read', is_allowed: true  },
  { resource: 'reports.bankReconciliation',      action: 'read', is_allowed: true  },
  { resource: 'reports.expenses',                action: 'read', is_allowed: true  },
  { resource: 'reports.payrollSummary',          action: 'read', is_allowed: true  },
  { resource: 'reports.hrAdjustments',           action: 'read', is_allowed: true  },
  { resource: 'reports.auditLog',                action: 'read', is_allowed: true  },
  { resource: 'settings', action: 'read',  is_allowed: false },
  { resource: 'settings', action: 'write', is_allowed: false },
  { resource: 'users',    action: 'read',  is_allowed: false },
  { resource: 'users',    action: 'write', is_allowed: false },
];

const SHOP_SELLER_PERMS: Perm[] = [
  { resource: 'customers',    action: 'read',    is_allowed: true  },
  { resource: 'customers',    action: 'write',   is_allowed: true  },
  { resource: 'invoices',     action: 'read',    is_allowed: true  },
  { resource: 'invoices',     action: 'write',   is_allowed: true  },
  { resource: 'invoices',     action: 'approve', is_allowed: true  },
  { resource: 'returns',      action: 'read',    is_allowed: true  },
  { resource: 'returns',      action: 'write',   is_allowed: true  },
  { resource: 'returns',      action: 'approve', is_allowed: false },
  { resource: 'fabric_rolls', action: 'read',    is_allowed: true  },
  { resource: 'fabric_rolls', action: 'write',   is_allowed: true  },
  { resource: 'inventory',    action: 'read',    is_allowed: true  },
  { resource: 'inventory',    action: 'write',   is_allowed: true  },
  { resource: 'inventory',    action: 'approve', is_allowed: false },
  { resource: 'shipments',    action: 'read',    is_allowed: true  },
  { resource: 'shipments',    action: 'write',   is_allowed: false },
  { resource: 'shipments',    action: 'approve', is_allowed: true  },
  { resource: 'cash_drawer',  action: 'read',    is_allowed: true  },
  { resource: 'cash_drawer',  action: 'write',   is_allowed: true  },
  { resource: 'hr',           action: 'view',             is_allowed: false },
  { resource: 'hr',           action: 'manage',           is_allowed: false },
  { resource: 'hr',           action: 'salary.disburse',  is_allowed: false },
  { resource: 'hr',           action: 'advance.create',   is_allowed: false },
  { resource: 'hr',           action: 'deduction.create', is_allowed: false },
  { resource: 'suppliers',    action: 'view',           is_allowed: false },
  { resource: 'suppliers',    action: 'write',          is_allowed: false },
  { resource: 'suppliers',    action: 'payments.write', is_allowed: false },
  { resource: 'reports.general',                 action: 'read', is_allowed: false },
  { resource: 'reports.daily',                   action: 'read', is_allowed: true  },
  { resource: 'reports.salesByPaymentMethod',    action: 'read', is_allowed: true  },
  { resource: 'reports.customerLedger',          action: 'read', is_allowed: true  },
  { resource: 'reports.outstandingOpenInvoices', action: 'read', is_allowed: true  },
  { resource: 'reports.salesByFabricColor',      action: 'read', is_allowed: false },
  { resource: 'reports.stocktakeInventory',      action: 'read', is_allowed: true  },
  { resource: 'reports.stockByWarehouse',        action: 'read', is_allowed: true  },
  { resource: 'reports.agingInventory',          action: 'read', is_allowed: false },
  { resource: 'reports.shipmentsSummary',        action: 'read', is_allowed: false },
  { resource: 'reports.returnsReport',           action: 'read', is_allowed: true  },
  { resource: 'reports.outstandingCheques',      action: 'read', is_allowed: true  },
  { resource: 'reports.cashFlow',                action: 'read', is_allowed: false },
  { resource: 'reports.bankReconciliation',      action: 'read', is_allowed: false },
  { resource: 'reports.expenses',                action: 'read', is_allowed: false },
  { resource: 'reports.payrollSummary',          action: 'read', is_allowed: false },
  { resource: 'reports.hrAdjustments',           action: 'read', is_allowed: false },
  { resource: 'reports.auditLog',                action: 'read', is_allowed: false },
  { resource: 'settings', action: 'read',  is_allowed: false },
  { resource: 'settings', action: 'write', is_allowed: false },
  { resource: 'users',    action: 'read',  is_allowed: false },
  { resource: 'users',    action: 'write', is_allowed: false },
];

const FACTORY_SENDER_PERMS: Perm[] = [
  { resource: 'customers',    action: 'read',    is_allowed: false },
  { resource: 'customers',    action: 'write',   is_allowed: false },
  { resource: 'invoices',     action: 'read',    is_allowed: false },
  { resource: 'invoices',     action: 'write',   is_allowed: false },
  { resource: 'invoices',     action: 'approve', is_allowed: false },
  { resource: 'returns',      action: 'read',    is_allowed: false },
  { resource: 'returns',      action: 'write',   is_allowed: false },
  { resource: 'returns',      action: 'approve', is_allowed: false },
  { resource: 'fabric_rolls', action: 'read',    is_allowed: true  },
  { resource: 'fabric_rolls', action: 'write',   is_allowed: true  },
  { resource: 'inventory',    action: 'read',    is_allowed: true  },
  { resource: 'inventory',    action: 'write',   is_allowed: false },
  { resource: 'inventory',    action: 'approve', is_allowed: false },
  { resource: 'shipments',    action: 'read',    is_allowed: true  },
  { resource: 'shipments',    action: 'write',   is_allowed: true  },
  { resource: 'shipments',    action: 'approve', is_allowed: false },
  { resource: 'cash_drawer',  action: 'read',    is_allowed: false },
  { resource: 'cash_drawer',  action: 'write',   is_allowed: false },
  { resource: 'hr',           action: 'view',             is_allowed: false },
  { resource: 'hr',           action: 'manage',           is_allowed: false },
  { resource: 'hr',           action: 'salary.disburse',  is_allowed: false },
  { resource: 'hr',           action: 'advance.create',   is_allowed: false },
  { resource: 'hr',           action: 'deduction.create', is_allowed: false },
  { resource: 'suppliers',    action: 'view',           is_allowed: false },
  { resource: 'suppliers',    action: 'write',          is_allowed: false },
  { resource: 'suppliers',    action: 'payments.write', is_allowed: false },
  { resource: 'reports.general',                 action: 'read', is_allowed: false },
  { resource: 'reports.daily',                   action: 'read', is_allowed: false },
  { resource: 'reports.salesByPaymentMethod',    action: 'read', is_allowed: false },
  { resource: 'reports.customerLedger',          action: 'read', is_allowed: false },
  { resource: 'reports.outstandingOpenInvoices', action: 'read', is_allowed: false },
  { resource: 'reports.salesByFabricColor',      action: 'read', is_allowed: false },
  { resource: 'reports.stocktakeInventory',      action: 'read', is_allowed: false },
  { resource: 'reports.stockByWarehouse',        action: 'read', is_allowed: false },
  { resource: 'reports.agingInventory',          action: 'read', is_allowed: false },
  { resource: 'reports.shipmentsSummary',        action: 'read', is_allowed: false },
  { resource: 'reports.returnsReport',           action: 'read', is_allowed: false },
  { resource: 'reports.outstandingCheques',      action: 'read', is_allowed: false },
  { resource: 'reports.cashFlow',                action: 'read', is_allowed: false },
  { resource: 'reports.bankReconciliation',      action: 'read', is_allowed: false },
  { resource: 'reports.expenses',                action: 'read', is_allowed: false },
  { resource: 'reports.payrollSummary',          action: 'read', is_allowed: false },
  { resource: 'reports.hrAdjustments',           action: 'read', is_allowed: false },
  { resource: 'reports.auditLog',                action: 'read', is_allowed: false },
  { resource: 'settings', action: 'read',  is_allowed: false },
  { resource: 'settings', action: 'write', is_allowed: false },
  { resource: 'users',    action: 'read',  is_allowed: false },
  { resource: 'users',    action: 'write', is_allowed: false },
];

// Accountant already seeded in migration 070, but we include inventory.approve
// which is a new row not present in 070. onConflict.ignore() handles the rest.
const ACCOUNTANT_NEW_PERMS: Perm[] = [
  { resource: 'inventory', action: 'approve', is_allowed: false },
];

const ALL_ROLE_PERMS: Array<{ role: string; perms: Perm[] }> = [
  { role: 'owner',          perms: OWNER_PERMS },
  { role: 'shop_seller',    perms: SHOP_SELLER_PERMS },
  { role: 'factory_sender', perms: FACTORY_SENDER_PERMS },
  { role: 'accountant',     perms: ACCOUNTANT_NEW_PERMS },
];

export async function up(knex: Knex): Promise<void> {
  // Create audit table to track which rows this migration inserted (for safe rollback).
  await knex.schema.createTableIfNotExists('_seed_audit_072', (t) => {
    t.bigIncrements('id');
    t.bigInteger('role_permission_id').notNullable();
  });

  for (const { role, perms } of ALL_ROLE_PERMS) {
    const rows = perms.map((p) => ({ role, resource: p.resource, action: p.action, is_allowed: p.is_allowed }));

    // For each row, attempt insert and record its ID only if it was actually inserted.
    // onConflict.ignore() returns 0 rows for conflicts (existing rows are untouched).
    for (const row of rows) {
      const inserted = await knex('role_permissions')
        .insert(row)
        .onConflict(['role', 'resource', 'action'])
        .ignore()
        .returning('id');

      if (inserted.length > 0 && inserted[0]) {
        const insertedId = (inserted[0] as { id: number } | number);
        const id = typeof insertedId === 'object' ? insertedId.id : insertedId;
        await knex('_seed_audit_072').insert({ role_permission_id: id });
      }
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  // Delete only the rows this migration inserted (preserves any admin customisations).
  const auditRows = await knex('_seed_audit_072').select('role_permission_id') as Array<{ role_permission_id: number }>;
  const ids = auditRows.map((r) => r.role_permission_id);
  if (ids.length > 0) {
    await knex('role_permissions').whereIn('id', ids).delete();
  }
  await knex.schema.dropTableIfExists('_seed_audit_072');
}
