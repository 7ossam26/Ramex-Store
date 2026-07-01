/**
 * Migration 083 — Seed role_permissions for the new 'accessories' resource.
 *
 * accessories.read  — list/search accessories, view in POS grid, scan barcode
 * accessories.write — create new accessory SKUs (Add Accessory wizard)
 *
 * Role defaults:
 *   owner          → read=true,  write=true
 *   shop_seller    → read=true,  write=true   (also sells them via POS)
 *   accountant     → read=true,  write=false
 *   factory_sender → read=false, write=false
 *
 * Strategy: idempotent onConflict.ignore — existing customisations are preserved.
 */

import type { Knex } from 'knex';

type Perm = { resource: string; action: string; is_allowed: boolean };

const ROWS: Array<{ role: string; perm: Perm }> = [
  { role: 'owner',          perm: { resource: 'accessories', action: 'read',  is_allowed: true  } },
  { role: 'owner',          perm: { resource: 'accessories', action: 'write', is_allowed: true  } },
  { role: 'shop_seller',    perm: { resource: 'accessories', action: 'read',  is_allowed: true  } },
  { role: 'shop_seller',    perm: { resource: 'accessories', action: 'write', is_allowed: true  } },
  { role: 'accountant',     perm: { resource: 'accessories', action: 'read',  is_allowed: true  } },
  { role: 'accountant',     perm: { resource: 'accessories', action: 'write', is_allowed: false } },
  { role: 'factory_sender', perm: { resource: 'accessories', action: 'read',  is_allowed: false } },
  { role: 'factory_sender', perm: { resource: 'accessories', action: 'write', is_allowed: false } },
];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTableIfNotExists('_seed_audit_083', (t) => {
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
      await knex('_seed_audit_083').insert({ role_permission_id: id });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const auditRows = await knex('_seed_audit_083').select('role_permission_id') as Array<{ role_permission_id: number }>;
  const ids = auditRows.map((r) => r.role_permission_id);
  if (ids.length > 0) {
    await knex('role_permissions').whereIn('id', ids).delete();
  }
  await knex.schema.dropTableIfExists('_seed_audit_083');
}
