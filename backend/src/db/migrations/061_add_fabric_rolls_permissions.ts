import type { Knex } from 'knex';

/**
 * Adds fabric_rolls permission rows for shop_seller and factory_sender.
 * fabric_rolls controls access to the الأصناف section (rolls, fabrics, labels).
 * The owner rows were already seeded in migration 059.
 *
 * Defaults:
 *   shop_seller     — read only (can browse catalog; cannot add/edit rolls)
 *   factory_sender  — read + write (receives goods, creates roll records)
 */
export async function up(knex: Knex): Promise<void> {
  const rows = [
    { role: 'shop_seller',    resource: 'fabric_rolls', action: 'read',  is_allowed: true  },
    { role: 'shop_seller',    resource: 'fabric_rolls', action: 'write', is_allowed: false },
    { role: 'factory_sender', resource: 'fabric_rolls', action: 'read',  is_allowed: true  },
    { role: 'factory_sender', resource: 'fabric_rolls', action: 'write', is_allowed: true  },
  ];

  await knex('role_permissions')
    .insert(rows)
    .onConflict(['role', 'resource', 'action'])
    .ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex('role_permissions')
    .whereIn('role', ['shop_seller', 'factory_sender'])
    .where({ resource: 'fabric_rolls' })
    .delete();
}
