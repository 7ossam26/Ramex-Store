import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('hr_employees', (t) => {
    t.bigIncrements('id').primary();
    t.string('name_ar', 128).notNullable();
    t.string('phone', 16).nullable();
    t.string('role_ar', 64).nullable();
    t.decimal('base_salary_egp', 12, 2).notNullable().defaultTo(0);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('hr_salary_disbursements', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('employee_id').notNullable().references('id').inTable('hr_employees');
    t.date('month').notNullable();
    t.decimal('gross_egp', 12, 2).notNullable();
    t.decimal('adjustments_egp', 12, 2).notNullable().defaultTo(0);
    t.decimal('net_egp', 12, 2).notNullable();
    t.string('paid_via', 32).notNullable()
      .checkIn(['cash', 'instapay', 'bank_transfer'], 'hr_salary_disbursements_paid_via_check');
    t.bigInteger('bank_account_id').nullable().references('id').inTable('bank_accounts');
    t.text('notes_ar').nullable();
    t.bigInteger('actor_user_id').notNullable().references('id').inTable('users');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['employee_id', 'month'], { indexName: 'hr_salary_disbursements_employee_month_unique' });
  });

  await knex.schema.createTable('hr_salary_adjustments', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('employee_id').notNullable().references('id').inTable('hr_employees');
    t.string('kind', 16).notNullable()
      .checkIn(['advance', 'deduction'], 'hr_salary_adjustments_kind_check');
    t.decimal('amount_egp', 12, 2).notNullable();
    t.date('salary_month').notNullable();
    t.text('reason_ar').nullable();
    t.bigInteger('actor_user_id').notNullable().references('id').inTable('users');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(
    'ALTER TABLE hr_salary_adjustments ADD CONSTRAINT hr_salary_adjustments_amount_positive CHECK (amount_egp > 0)',
  );

  await knex.schema.raw(
    'CREATE INDEX hr_salary_adjustments_employee_month_idx ON hr_salary_adjustments(employee_id, salary_month)',
  );

  // Widen the action check constraint to allow HR-specific action names.
  await knex.schema.raw(`
    ALTER TABLE role_permissions
      DROP CONSTRAINT role_permissions_action_check,
      ADD CONSTRAINT role_permissions_action_check
        CHECK (action = ANY (ARRAY[
          'read', 'write', 'approve',
          'view', 'manage', 'salary.disburse', 'advance.create', 'deduction.create'
        ]))
  `);

  // Seed HR permissions for non-owner roles (owner is hardcoded to pass in can()).
  const hrPermissions: Array<{ role: string; resource: string; action: string; is_allowed: boolean }> = [];
  for (const role of ['shop_seller', 'factory_sender']) {
    for (const action of ['view', 'manage', 'salary.disburse', 'advance.create', 'deduction.create']) {
      hrPermissions.push({ role, resource: 'hr', action, is_allowed: false });
    }
  }
  await knex('role_permissions').insert(hrPermissions).onConflict(['role', 'resource', 'action']).ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex('role_permissions').where({ resource: 'hr' }).delete();

  // Restore original narrow action check constraint.
  await knex.schema.raw(`
    ALTER TABLE role_permissions
      DROP CONSTRAINT role_permissions_action_check,
      ADD CONSTRAINT role_permissions_action_check
        CHECK (action = ANY (ARRAY['read', 'write', 'approve']))
  `);

  await knex.schema.dropTableIfExists('hr_salary_adjustments');
  await knex.schema.dropTableIfExists('hr_salary_disbursements');
  await knex.schema.dropTableIfExists('hr_employees');
}
