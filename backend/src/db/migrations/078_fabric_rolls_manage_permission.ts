/**
 * Migration 078 — Seed fabric_rolls.manage permission for all operational roles.
 *
 * fabric_rolls.manage gates catalog write operations that are unsuitable for
 * shop_seller or accountant but must be available to factory_sender and owner:
 *   POST  /api/items/fabrics        — add a new material (خامة)
 *   PATCH /api/items/fabrics/:id    — edit a material
 *   POST  /api/items/colors         — add a new color (لون)
 *   PATCH /api/items/colors/:id     — edit a color
 *   POST  /api/items/fabric-color-prices — set suggested price per material+color
 *
 * These routes previously required requireRole('super_admin'); they now use
 * requirePermission('fabric_rolls', 'manage') so Super Admin can control them
 * from the permissions matrix screen.
 *
 * Role defaults:
 *   owner          → manage=true  (full operational access)
 *   factory_sender → manage=true  (needs to add fabrics/colors for AddTop wizard)
 *   shop_seller    → manage=false (daily ops only — no catalog management)
 *   accountant     → manage=false (read-only on rolls)
 *
 * Strategy: idempotent onConflict.ignore — existing customisations are preserved.
 */

import type { Knex } from 'knex';

type Perm = { resource: string; action: string; is_allowed: boolean };

const ROWS: Array<{ role: string; perm: Perm }> = [
  { role: 'owner',          perm: { resource: 'fabric_rolls', action: 'manage', is_allowed: true  } },
  { role: 'factory_sender', perm: { resource: 'fabric_rolls', action: 'manage', is_allowed: true  } },
  { role: 'shop_seller',    perm: { resource: 'fabric_rolls', action: 'manage', is_allowed: false } },
  { role: 'accountant',     perm: { resource: 'fabric_rolls', action: 'manage', is_allowed: false } },
];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTableIfNotExists('_seed_audit_078', (t) => {
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
      await knex('_seed_audit_078').insert({ role_permission_id: id });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const auditRows = await knex('_seed_audit_078').select('role_permission_id') as Array<{ role_permission_id: number }>;
  const ids = auditRows.map((r) => r.role_permission_id);
  if (ids.length > 0) {
    await knex('role_permissions').whereIn('id', ids).delete();
  }
  await knex.schema.dropTableIfExists('_seed_audit_078');
}
