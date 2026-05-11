import type { Knex } from 'knex';

// MySQL replacement for PostgreSQL sequences.
// Application code uses LAST_INSERT_ID() trick for atomic increments.
export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('db_sequences', (t) => {
    t.string('name', 64).primary();
    t.bigInteger('last_value').notNullable().defaultTo(0);
  });

  await db('db_sequences').insert([
    { name: 'roll_barcode_seq', last_value: 0 },
    { name: 'customers_code_seq', last_value: 0 },
  ]);
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('db_sequences');
}
