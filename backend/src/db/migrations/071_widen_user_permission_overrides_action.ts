import type { Knex } from 'knex';

// Mirror the action set that role_permissions accepts (widened progressively by
// migrations 037, 052, 068). The override table's CHECK was created in 057 with only
// the original three actions and was never carried along.
const ACTIONS = "'read', 'write', 'approve', 'view', 'manage', 'salary.disburse', 'advance.create', 'deduction.create', 'payments.write'";
const OLD_ACTIONS = "'read', 'write', 'approve'";

export async function up(db: Knex): Promise<void> {
  await db.raw('ALTER TABLE user_permission_overrides DROP CONSTRAINT IF EXISTS user_permission_overrides_action_check');
  await db.raw(`ALTER TABLE user_permission_overrides ADD CONSTRAINT user_permission_overrides_action_check CHECK (action IN (${ACTIONS}))`);
}

export async function down(db: Knex): Promise<void> {
  // Drop any rows that hold the newer actions so the narrower constraint can be reapplied
  await db('user_permission_overrides').whereNotIn('action', ['read', 'write', 'approve']).delete();
  await db.raw('ALTER TABLE user_permission_overrides DROP CONSTRAINT IF EXISTS user_permission_overrides_action_check');
  await db.raw(`ALTER TABLE user_permission_overrides ADD CONSTRAINT user_permission_overrides_action_check CHECK (action IN (${OLD_ACTIONS}))`);
}
