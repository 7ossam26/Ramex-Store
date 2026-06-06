import type { Knex } from 'knex';

/**
 * Seeds the `shipments.approve` permission for shop_seller so the permissions
 * matrix gate on POST /shipments/:id/lines/:lineId/review and POST /shipments/:id/accept
 * matches the previous requireRole('shop_seller', ...) behaviour.
 *
 * factory_sender intentionally does NOT get shipments.approve — they create
 * shipments but never review/accept them (that is Ziad's job).
 */
export async function up(knex: Knex): Promise<void> {
  await knex('role_permissions')
    .insert({ role: 'shop_seller', resource: 'shipments', action: 'approve', is_allowed: true })
    .onConflict(['role', 'resource', 'action'])
    .merge(['is_allowed']);
}

export async function down(knex: Knex): Promise<void> {
  await knex('role_permissions')
    .where({ role: 'shop_seller', resource: 'shipments', action: 'approve' })
    .delete();
}
