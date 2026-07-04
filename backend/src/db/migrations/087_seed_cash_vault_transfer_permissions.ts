/**
 * Migration 087 — Seed role_permissions for the new 'cash_vault_transfer' resource.
 *
 * Splits the Cash Vault Transfer feature off from 'cash_drawer' so it can be
 * granted/revoked independently in the access-control screens.
 *
 * Role defaults mirror the effective access the feature already had via
 * cash_drawer (read/write/approve), so nobody's access changes:
 *   owner          → read=true,  write=true,  approve=true
 *   shop_seller    → read=true,  write=true,  approve=false
 *   accountant     → read=true,  write=false, approve=false
 *   factory_sender → read=false, write=false, approve=false
 *
 * Strategy: idempotent onConflict.ignore — existing customisations are preserved.
 */

import type { Knex } from 'knex';

type Perm = { resource: string; action: string; is_allowed: boolean };

const ROWS: Array<{ role: string; perm: Perm }> = [
  { role: 'owner',          perm: { resource: 'cash_vault_transfer', action: 'read',    is_allowed: true  } },
  { role: 'owner',          perm: { resource: 'cash_vault_transfer', action: 'write',   is_allowed: true  } },
  { role: 'owner',          perm: { resource: 'cash_vault_transfer', action: 'approve', is_allowed: true  } },
  { role: 'shop_seller',    perm: { resource: 'cash_vault_transfer', action: 'read',    is_allowed: true  } },
  { role: 'shop_seller',    perm: { resource: 'cash_vault_transfer', action: 'write',   is_allowed: true  } },
  { role: 'shop_seller',    perm: { resource: 'cash_vault_transfer', action: 'approve', is_allowed: false } },
  { role: 'accountant',     perm: { resource: 'cash_vault_transfer', action: 'read',    is_allowed: true  } },
  { role: 'accountant',     perm: { resource: 'cash_vault_transfer', action: 'write',   is_allowed: false } },
  { role: 'accountant',     perm: { resource: 'cash_vault_transfer', action: 'approve', is_allowed: false } },
  { role: 'factory_sender', perm: { resource: 'cash_vault_transfer', action: 'read',    is_allowed: false } },
  { role: 'factory_sender', perm: { resource: 'cash_vault_transfer', action: 'write',   is_allowed: false } },
  { role: 'factory_sender', perm: { resource: 'cash_vault_transfer', action: 'approve', is_allowed: false } },
];

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTableIfNotExists('_seed_audit_087', (t) => {
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
      await knex('_seed_audit_087').insert({ role_permission_id: id });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  const auditRows = await knex('_seed_audit_087').select('role_permission_id') as Array<{ role_permission_id: number }>;
  const ids = auditRows.map((r) => r.role_permission_id);
  if (ids.length > 0) {
    await knex('role_permissions').whereIn('id', ids).delete();
  }
  await knex.schema.dropTableIfExists('_seed_audit_087');
}
