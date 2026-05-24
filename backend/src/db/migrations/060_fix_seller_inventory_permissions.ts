import type { Knex } from 'knex';

/**
 * Sellers (shop_seller) should not have access to inventory by default.
 * Migration 037 seeded inventory read+write as true for shop_seller,
 * but the intended design is that inventory is an owner/admin-only section.
 * Super admin can re-enable it per-role via the permissions panel if needed.
 */
export async function up(knex: Knex): Promise<void> {
  await knex('role_permissions')
    .where({ role: 'shop_seller', resource: 'inventory' })
    .update({ is_allowed: false });
}

export async function down(knex: Knex): Promise<void> {
  await knex('role_permissions')
    .where({ role: 'shop_seller', resource: 'inventory' })
    .update({ is_allowed: true });
}
