import type { Knex } from 'knex';

/**
 * Atomically allocates the next shipment number for a given year using the
 * `shipment_sequence(year, next_no)` table. Concurrency-safe: relies on
 * Postgres row-level locks taken by INSERT ... ON CONFLICT and UPDATE.
 *
 * Returns SHP-YYYY-NNNNNN with NNNNNN zero-padded to 6 digits.
 */
export async function nextShipmentNo(trx: Knex.Transaction, year: number): Promise<string> {
  // Ensure a row exists for this year (next_no=1 means "1 will be the next allocation").
  await trx.raw(
    `INSERT INTO shipment_sequence (year, next_no) VALUES (?, 1) ON CONFLICT (year) DO NOTHING`,
    [year],
  );
  // Atomically increment and return the value that was just allocated.
  const result = await trx.raw<{ rows: Array<{ used_no: number }> }>(
    `UPDATE shipment_sequence SET next_no = next_no + 1 WHERE year = ? RETURNING (next_no - 1) AS used_no`,
    [year],
  );
  const usedNo = Number(result.rows[0].used_no);
  return `SHP-${year}-${String(usedNo).padStart(6, '0')}`;
}
