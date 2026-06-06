/**
 * Migration 073 — Seed cash_drawer.approve for all operational roles.
 *
 * cash_drawer.approve gates admin-level finance operations that are unsuitable
 * for shop_seller (who has cash_drawer.write=true for daily operations):
 *   POST /cash/opening-balance    — set initial cash balance
 *   POST /cash/owner-withdrawal   — owner withdrawal
 *   POST /banks                   — create bank account
 *   PATCH /banks/:id              — edit bank account
 *   GET  /treasuries-overview     — aggregated management view
 *   POST /expenses/:id/approve    — approve an expense
 *   POST /expenses/:id/reject     — reject an expense
 *
 * Role defaults:
 *   owner          → approve=true  (full admin access)
 *   shop_seller    → approve=false (daily ops only)
 *   factory_sender → approve=false (irrelevant)
 *   accountant     → approve=false (records expenses, does not approve them)
 *
 * Strategy: same idempotent pattern as migration 072.
 */

import type { Knex } from 'knex';

type Perm = { resource: string; action: string; is_allowed: boolean };

const ROWS: Array<{ role: string; perm: Perm }> = [
  { role: 'owner',          perm: { resource: 'cash_drawer', action: 'approve', is_allowed: true  } },
  { role: 'shop_seller',    perm: { resource: 'cash_drawer', action: 'approve', is_allowed: false } },
  { role: 'factory_sender', perm: { resource: 'cash_drawer', action: 'approve', is_allowed: false } },
  { role: 'accountant',     perm: { resource: 'cash_drawer', action: 'approve', is_allowed: false } },
];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTableIfNotExists('_seed_audit_073', (t) => {
    t.bigIncrements('id');
    t.bigInteger('role_permission_id').notNullable();
  });

  for (const { role, perm } of ROWS) {
    const inserted = await knex('role_permissions')
      .insert({ role, resource: perm.resource, action: perm.action, is_allowed: perm.is_allowed })
      .onConflict(['role', 'resource', 'action'])
      .ignore()
      .returning('id');

    if (inserted.length > 0 && inserted[0]) {
      const insertedId = inserted[0] as { id: number } | number;
      const id = typeof insertedId === 'object' ? insertedId.id : insertedId;
      await knex('_seed_audit_073').insert({ role_permission_id: id });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const auditRows = await knex('_seed_audit_073').select('role_permission_id') as Array<{ role_permission_id: number }>;
  const ids = auditRows.map((r) => r.role_permission_id);
  if (ids.length > 0) {
    await knex('role_permissions').whereIn('id', ids).delete();
  }
  await knex.schema.dropTableIfExists('_seed_audit_073');
}
