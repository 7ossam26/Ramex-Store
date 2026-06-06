import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Add advance_repayment_egp column to hr_salary_disbursements
  await knex.schema.alterTable('hr_salary_disbursements', (t) => {
    t.decimal('advance_repayment_egp', 12, 2).notNullable().defaultTo(0);
  });

  // Create advance repayments ledger table
  await knex.schema.createTable('hr_advance_repayments', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('employee_id').notNullable().references('id').inTable('hr_employees');
    t.bigInteger('disbursement_id').notNullable().references('id').inTable('hr_salary_disbursements');
    t.decimal('amount_egp', 12, 2).notNullable();
    t.bigInteger('actor_user_id').notNullable().references('id').inTable('users');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['disbursement_id'], { indexName: 'hr_advance_repayments_disbursement_unique' });
  });

  await knex.schema.raw(
    'ALTER TABLE hr_advance_repayments ADD CONSTRAINT hr_advance_repayments_amount_positive CHECK (amount_egp > 0)',
  );
  await knex.schema.raw(
    'CREATE INDEX hr_advance_repayments_employee_idx ON hr_advance_repayments(employee_id)',
  );

  // Backfill: for every existing advance adjustment that has a corresponding disbursement
  // for the same employee in the same month, create a repayment row.
  // This reflects that old behavior auto-deducted the advance at disbursement time.
  await knex.raw(`
    INSERT INTO hr_advance_repayments (employee_id, disbursement_id, amount_egp, actor_user_id, created_at)
    SELECT
      a.employee_id,
      d.id AS disbursement_id,
      a.amount_egp,
      a.actor_user_id,
      d.created_at
    FROM hr_salary_adjustments a
    JOIN hr_salary_disbursements d
      ON d.employee_id = a.employee_id
      AND d.month = a.salary_month
    WHERE a.kind = 'advance'
    ON CONFLICT (disbursement_id) DO NOTHING
  `);

  // Sync advance_repayment_egp on existing disbursement rows
  await knex.raw(`
    UPDATE hr_salary_disbursements d
    SET advance_repayment_egp = COALESCE((
      SELECT SUM(r.amount_egp)
      FROM hr_advance_repayments r
      WHERE r.disbursement_id = d.id
    ), 0)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('hr_advance_repayments');
  await knex.schema.alterTable('hr_salary_disbursements', (t) => {
    t.dropColumn('advance_repayment_egp');
  });
}
