import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.raw(`CREATE TYPE audit_severity AS ENUM ('low', 'medium', 'high', 'critical')`);

  await db.schema.createTable('audit_log', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.string('action', 64).notNullable();
    t.string('entity', 64).notNullable();
    t.string('entity_id', 64).nullable();
    t.jsonb('before_json').nullable();
    t.jsonb('after_json').nullable();
    t.string('ip', 45).nullable();
    t.string('user_agent', 255).nullable();
    t.specificType('severity', 'audit_severity').notNullable().defaultTo('low');
    t.string('tag', 32).nullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(db.fn.now());

    t.index(['entity', 'entity_id']);
    t.index(['user_id']);
    t.index(['created_at']);
  });
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('audit_log');
  await db.raw(`DROP TYPE IF EXISTS audit_severity`);
}
