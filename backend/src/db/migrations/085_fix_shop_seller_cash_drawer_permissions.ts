import type { Knex } from 'knex';

/**
 * Migration 085 — Force-fix shop_seller cash_drawer read+write permissions.
 *
 * Prior migrations used onConflict.ignore(), which cannot heal a row that was
 * set to is_allowed=false after initial seeding (e.g. via the admin permissions
 * panel). This migration uses UPDATE (not ignore) to guarantee the correct value
 * is in the DB regardless of current state.
 */
export async function up(knex: Knex): Promise<void> {
  const actions = ['read', 'write'] as const;
  for (const action of actions) {
    const exists = await knex('role_permissions')
      .where({ role: 'shop_seller', resource: 'cash_drawer', action })
      .first();
    if (exists) {
      await knex('role_permissions')
        .where({ role: 'shop_seller', resource: 'cash_drawer', action })
        .update({ is_allowed: true });
    } else {
      await knex('role_permissions').insert({
        role: 'shop_seller',
        resource: 'cash_drawer',
        action,
        is_allowed: true,
      });
    }
  }
}

export async function down(_knex: Knex): Promise<void> {
  // Intentionally a no-op: reverting to false would break POS for shop_seller.
}
