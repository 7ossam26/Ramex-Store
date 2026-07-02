import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  await db.schema.alterTable('return_lines', (t) => {
    // Make roll_id nullable so accessory return lines can omit it
    t.bigInteger('roll_id').unsigned().nullable().alter();

    // Discriminator — 'roll' or 'accessory'
    t.string('item_type', 16).notNullable().defaultTo('roll').after('roll_id');

    // FK to accessories table (null for roll lines)
    t.bigInteger('accessory_id').unsigned().nullable()
      .references('id').inTable('accessories').onDelete('RESTRICT')
      .after('item_type');

    // Piece count (populated only for accessory lines)
    t.integer('qty_pieces').nullable().after('accessory_id');

    t.index(['accessory_id']);
  });

  // Add a check constraint so roll lines always have roll_id
  // and accessory lines always have accessory_id + qty_pieces.
  await db.raw(`
    ALTER TABLE return_lines
    ADD CONSTRAINT chk_return_lines_item_type CHECK (
      (item_type = 'roll'      AND roll_id IS NOT NULL AND accessory_id IS NULL  AND qty_pieces IS NULL)
      OR
      (item_type = 'accessory' AND accessory_id IS NOT NULL AND roll_id IS NULL  AND qty_pieces IS NOT NULL AND qty_pieces > 0)
    )
  `);
}

export async function down(db: Knex): Promise<void> {
  await db.raw(`ALTER TABLE return_lines DROP CONSTRAINT IF EXISTS chk_return_lines_item_type`);

  await db.schema.alterTable('return_lines', (t) => {
    t.dropIndex(['accessory_id']);
    t.dropColumn('qty_pieces');
    t.dropColumn('accessory_id');
    t.dropColumn('item_type');
    // Restore NOT NULL on roll_id
    t.bigInteger('roll_id').unsigned().notNullable().alter();
  });
}
