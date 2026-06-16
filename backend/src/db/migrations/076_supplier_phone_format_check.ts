import type { Knex } from 'knex';

export async function up(db: Knex): Promise<void> {
  // First, clean up any existing invalid phone numbers (set them to NULL)
  await db.raw(
    `UPDATE suppliers SET phone = NULL WHERE phone IS NOT NULL AND phone !~ '^01[0125][0-9]{8}$'`,
  );

  // Then add the constraint
  await db.raw(
    `ALTER TABLE suppliers ADD CONSTRAINT suppliers_phone_format_check CHECK (
      phone IS NULL OR phone ~ '^01[0125][0-9]{8}$'
    )`,
  );
}

export async function down(db: Knex): Promise<void> {
  await db.raw('ALTER TABLE suppliers DROP CONSTRAINT suppliers_phone_format_check');
}
