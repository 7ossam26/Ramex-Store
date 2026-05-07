import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('bank_accounts', (t) => {
    t.string('bank_name_ar', 64).nullable();
    t.string('branch_ar', 64).nullable();
    t.string('iban', 64).nullable();
    t.text('notes_ar').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('bank_accounts', (t) => {
    t.dropColumn('bank_name_ar');
    t.dropColumn('branch_ar');
    t.dropColumn('iban');
    t.dropColumn('notes_ar');
  });
}
