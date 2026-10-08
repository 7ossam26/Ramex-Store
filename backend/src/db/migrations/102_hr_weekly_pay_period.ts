import type { Knex } from 'knex';

/**
 * Weekly salaries. Salaries are now paid every Thursday: new disbursements
 * store the Thursday pay date in `month` (so the existing unique
 * (employee_id, month) index means one payment per employee per week) and
 * are tagged pay_period = 'week'. Pre-existing rows default to 'month'.
 */
export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable('hr_salary_disbursements', (t) => {
    t.string('pay_period', 8).notNullable().defaultTo('month');
  });
  await db.raw(`
    ALTER TABLE hr_salary_disbursements
    ADD CONSTRAINT hr_salary_disbursements_pay_period_check
    CHECK (pay_period IN ('month', 'week'))
  `);
}

export async function down(db: Knex): Promise<void> {
  await db.raw('ALTER TABLE hr_salary_disbursements DROP CONSTRAINT IF EXISTS hr_salary_disbursements_pay_period_check');
  await db.schema.alterTable('hr_salary_disbursements', (t) => {
    t.dropColumn('pay_period');
  });
}
