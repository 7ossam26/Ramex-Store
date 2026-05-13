import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  // Sync roll_barcode_seq to the actual max barcode number in the rolls table.
  // Necessary when the sequence counter falls behind (e.g. after a DB restore
  // that kept roll rows but reset the sequences table).
  await db.raw(`
    UPDATE db_sequences
    SET last_value = (
      SELECT COALESCE(
        MAX(CAST(SUBSTRING(internal_barcode FROM 7) AS INTEGER)),
        0
      )
      FROM rolls
      WHERE internal_barcode ~ '^RMX-R-[0-9]+$'
    )
    WHERE name = 'roll_barcode_seq'
  `);
}

export async function down(_db: Knex): Promise<void> {
  // No safe rollback — sequence values are one-directional.
}
