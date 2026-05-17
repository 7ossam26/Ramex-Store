import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db('db_sequences').insert([
    { name: 'fabric_code_seq', last_value: 0 },
    { name: 'color_code_seq', last_value: 0 },
  ]);
}

export async function down(db: Knex): Promise<void> {
  await db('db_sequences').whereIn('name', ['fabric_code_seq', 'color_code_seq']).delete();
}
