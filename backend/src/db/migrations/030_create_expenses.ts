import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('expenses', (t) => {
    t.bigIncrements('id').primary();
    t.string('category', 32).notNullable();
    t.decimal('amount_egp', 12, 2).notNullable();
    t.text('notes_ar').nullable();
    t.string('photo_path', 255).nullable();
    t.boolean('requires_approval').notNullable().defaultTo(false);
    t.bigInteger('approved_by_user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.timestamp('approved_at', { useTz: true }).nullable();
    t.enu('paid_from', ['cash', 'bank'], { useNative: false, enumName: 'expenses_paid_from_check' }).notNullable();
    t.bigInteger('bank_account_id').unsigned().nullable()
      .references('id').inTable('bank_accounts').onDelete('RESTRICT');
    t.bigInteger('actor_user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('RESTRICT');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('expenses');
}
