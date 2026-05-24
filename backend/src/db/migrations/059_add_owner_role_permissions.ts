import type { Knex } from 'knex';

/**
 * Seeds the 'owner' role in role_permissions so its access is DB-controlled
 * (all resources enabled by default) rather than hardcoded in permissionsService.
 * This lets super_admin restrict individual owner-role users via the matrix.
 */
export async function up(knex: Knex): Promise<void> {
  type Perm = { role: string; resource: string; action: string; is_allowed: boolean };

  const rows: Perm[] = [];

  function add(resource: string, actions: string[]): void {
    for (const action of actions) {
      rows.push({ role: 'owner', resource, action, is_allowed: true });
    }
  }

  // Core resources
  add('customers',   ['read', 'write']);
  add('invoices',    ['read', 'write', 'approve']);
  add('inventory',   ['read', 'write']);
  add('shipments',   ['read', 'write', 'approve']);
  add('cash_drawer', ['read', 'write']);
  add('returns',     ['read', 'write', 'approve']);

  // Reports
  add('reports.daily',                   ['read']);
  add('reports.salesByPaymentMethod',    ['read']);
  add('reports.customerLedger',          ['read']);
  add('reports.outstandingOpenInvoices', ['read']);
  add('reports.salesByFabricColor',      ['read']);
  add('reports.stocktakeInventory',      ['read']);
  add('reports.cashFlow',                ['read']);
  add('reports.bankReconciliation',      ['read']);
  add('reports.expenses',                ['read']);
  add('reports.damageLoss',              ['read']);
  add('reports.auditLog',                ['read']);

  // Admin
  add('settings', ['read', 'write']);
  add('users',    ['read', 'write']);

  // Codes / rolls (migration 042)
  add('codes',        ['read', 'write']);
  add('fabric_rolls', ['read', 'write']);

  // HR module (migration 052 — uses extended action names)
  add('hr', ['view', 'manage', 'salary.disburse', 'advance.create', 'deduction.create']);

  await knex('role_permissions')
    .insert(rows)
    .onConflict(['role', 'resource', 'action'])
    .ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex('role_permissions').where({ role: 'owner' }).delete();
}
