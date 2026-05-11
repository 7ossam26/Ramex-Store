import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.createTable('notifications', (t) => {
    t.bigIncrements('id').primary();

    t.bigInteger('recipient_user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('CASCADE');
    t.string('recipient_role', 32).nullable();

    t.string('event_type', 64).notNullable();
    t.string('severity', 16).notNullable().defaultTo('low');
    t.string('tag', 32).nullable();
    t.string('title_ar', 128).notNullable();
    t.text('body_ar').notNullable();
    t.json('payload_jsonb').nullable();

    t.boolean('is_blocking').notNullable().defaultTo(false);
    t.json('blocked_action_payload_jsonb').nullable();

    t.datetime('read_at').nullable();
    t.datetime('archived_at').nullable();
    t.datetime('resolved_at').nullable();
    t.bigInteger('resolved_by_user_id').unsigned().nullable()
      .references('id').inTable('users').onDelete('SET NULL');
    t.text('resolution').nullable();

    t.datetime('created_at').notNullable().defaultTo(db.fn.now());

    t.index(['recipient_user_id', 'read_at']);
    t.index(['recipient_role', 'read_at']);
    t.index(['created_at']);
    t.index(['event_type', 'created_at']);
    t.index(['severity', 'created_at']);
  });

  // XOR: exactly one of recipient_user_id or recipient_role must be set
  await db.raw(`
    ALTER TABLE notifications
    ADD CONSTRAINT notifications_recipient_xor
    CHECK ((recipient_user_id IS NULL) XOR (recipient_role IS NULL))
  `);

  await db.raw(`
    ALTER TABLE notifications
    ADD CONSTRAINT notifications_severity_check
    CHECK (severity IN ('low', 'medium', 'high', 'critical'))
  `);

  await db.raw(`
    ALTER TABLE notifications
    ADD CONSTRAINT notifications_recipient_role_check
    CHECK (recipient_role IN ('owner', 'shop_seller', 'factory_sender'))
  `);

  await db.raw(`
    ALTER TABLE notifications
    ADD CONSTRAINT notifications_resolution_check
    CHECK (resolution IN ('approved', 'rejected', 'acknowledged'))
  `);
}

export async function down(db: Knex): Promise<void> {
  await db.schema.dropTableIfExists('notifications');
}
