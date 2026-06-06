import type { Knex } from 'knex';

/**
 * Business-critical fix: factory_sender must NEVER be able to approve shipments.
 *
 * 1. Upserts factory_sender + shipments + approve = false in role_permissions so the
 *    role-default is definitively denied regardless of what previous migrations wrote.
 *
 * 2. Purges any user_permission_overrides rows that granted shipments.approve = true
 *    to a user whose current role is factory_sender.  These rows are invalid and their
 *    existence allowed the bypass observed in QA.
 */
export async function up(knex: Knex): Promise<void> {
  // 1. Hard-deny the role default — upsert to guarantee the row is false.
  await knex('role_permissions')
    .insert({ role: 'factory_sender', resource: 'shipments', action: 'approve', is_allowed: false })
    .onConflict(['role', 'resource', 'action'])
    .merge({ is_allowed: false });

  // 2. Remove any per-user overrides that granted factory_sender users shipments.approve.
  await knex('user_permission_overrides')
    .whereIn(
      'user_id',
      knex('users').select('id').where({ role: 'factory_sender' }),
    )
    .where({ resource: 'shipments', action: 'approve' })
    .delete();
}

export async function down(knex: Knex): Promise<void> {
  // Restore the row to the value set by migration 063 (shop_seller got true; factory_sender
  // was not seeded in 063, so we simply delete the row to return to the no-row / false state).
  await knex('role_permissions')
    .where({ role: 'factory_sender', resource: 'shipments', action: 'approve' })
    .delete();
  // Purged overrides are not restored — they were invalid data.
}
