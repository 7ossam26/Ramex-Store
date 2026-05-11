import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('customers', (t) => {
    t.bigIncrements('id').primary();
    t.string('customer_code', 16).notNullable().unique();
    t.string('name_ar', 128).notNullable();
    t.string('phone', 16).notNullable().unique();
    t.string('phone_secondary', 16).nullable();
    t.text('address_ar').nullable();
    t.string('tax_no', 32).nullable();
    t.text('notes_ar').nullable();
    t.decimal('lifetime_volume_egp', 14, 2).notNullable().defaultTo(0);
    t.decimal('current_balance_egp', 14, 2).notNullable().defaultTo(0);
    t.bigInteger('created_by_user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.timestamps(true, true);

    t.index(['name_ar']);
    t.index(['phone']);
  });

  await db.raw(
    `ALTER TABLE customers ADD CONSTRAINT customers_phone_format_check CHECK (phone REGEXP '^01[0125][0-9]{8}$')`,
  );
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('customers');
}
