import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('sessions', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    t.string('jwt_jti', 64).notNullable().unique();
    t.string('device_info', 255).nullable();
    t.string('ip', 45).nullable();
    t.datetime('created_at').notNullable().defaultTo(db.fn.now());
    t.datetime('last_seen_at').notNullable().defaultTo(db.fn.now());
    t.datetime('revoked_at').nullable();
  });

  await db.raw(`CREATE INDEX sessions_user_active_idx ON sessions(user_id, revoked_at)`);
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('sessions');
}
