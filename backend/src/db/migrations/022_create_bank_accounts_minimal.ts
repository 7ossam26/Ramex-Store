import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('bank_accounts', (t) => {
    t.bigIncrements('id').primary();
    t.string('name_ar', 64).notNullable();
    t.string('account_number', 64).nullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.boolean('is_default').notNullable().defaultTo(false);
    t.decimal('current_balance_egp', 14, 2).notNullable().defaultTo(0);
    t.timestamps(true, true);
  });

  await db.raw(
    `ALTER TABLE payments
       ADD CONSTRAINT payments_bank_account_id_foreign
       FOREIGN KEY (bank_account_id)
       REFERENCES bank_accounts(id)
       ON DELETE RESTRICT`,
  );

  await db('bank_accounts').insert({
    name_ar: 'البنك الافتراضي',
    is_default: true,
    is_active: true,
    current_balance_egp: 0,
  });
}

export async function down(db: Knex): Promise<void> {
  await db.raw(`ALTER TABLE payments DROP CONSTRAINT payments_bank_account_id_foreign`);
  await db.schema.dropTableIfExists('bank_accounts');
}
