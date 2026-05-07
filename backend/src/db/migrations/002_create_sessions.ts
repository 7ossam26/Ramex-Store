import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('sessions', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    t.string('jwt_jti', 64).notNullable().unique();
    t.string('device_info', 255).nullable();
    t.string('ip', 45).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(db.fn.now());
    t.timestamp('last_seen_at', { useTz: true }).notNullable().defaultTo(db.fn.now());
    t.timestamp('revoked_at', { useTz: true }).nullable();
  });

  await db.raw(`CREATE INDEX sessions_user_active_idx ON sessions(user_id) WHERE revoked_at IS NULL`);
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('sessions');
}
