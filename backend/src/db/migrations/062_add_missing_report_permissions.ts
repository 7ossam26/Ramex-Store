import type { Knex } from 'knex';

/**
 * Several report keys introduced after migration 059 were never seeded into
 * role_permissions, so the `can()` check defaulted to false and returned 403
 * for owner-role users on those reports.
 *
 * Also adds the new reports.general permission.
 */
export async function up(knex: Knex): Promise<void> {
  type Perm = { role: string; resource: string; action: string; is_allowed: boolean };
  const rows: Perm[] = [];

  const ownerAllow = (resource: string) =>
    rows.push({ role: 'owner', resource, action: 'read', is_allowed: true });

  const sellerDeny = (resource: string) =>
    rows.push({ role: 'shop_seller', resource, action: 'read', is_allowed: false });

  const missing = [
    'reports.general',
    'reports.stockByWarehouse',
    'reports.agingInventory',
    'reports.shipmentsSummary',
    'reports.returnsReport',
    'reports.outstandingCheques',
    'reports.payrollSummary',
    'reports.hrAdjustments',
  ];

  for (const r of missing) {
    ownerAllow(r);
    sellerDeny(r);
  }

  await knex('role_permissions')
    .insert(rows)
    .onConflict(['role', 'resource', 'action'])
    .ignore();
}

export async function down(knex: Knex): Promise<void> {
  const missing = [
    'reports.general',
    'reports.stockByWarehouse',
    'reports.agingInventory',
    'reports.shipmentsSummary',
    'reports.returnsReport',
    'reports.outstandingCheques',
    'reports.payrollSummary',
    'reports.hrAdjustments',
  ];
  await knex('role_permissions').whereIn('resource', missing).delete();
}
