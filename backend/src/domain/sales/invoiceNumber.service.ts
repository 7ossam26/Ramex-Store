import type { Knex } from 'knex';

/**
 * Atomically allocates the next invoice number for a given year using the
 * `invoice_sequence(year, next_no)` table. Concurrency-safe: relies on
 * the row-level lock taken by the UPDATE.
 *
 * Sequence resets every January 1st (per CORE_PLAN §6 Module 8).
 *
 * Returns INV-YYYY-NNNNNN with NNNNNN zero-padded to 6 digits.
 */
export async function nextInvoiceNo(trx: Knex.Transaction, year: number): Promise<string> {
  await trx.raw(
    `INSERT INTO invoice_sequence (year, next_no) VALUES (?, 1) ON CONFLICT (year) DO NOTHING`,
    [year],
  );
  const result = await trx.raw<{ rows: Array<{ used_no: number }> }>(
    `UPDATE invoice_sequence SET next_no = next_no + 1 WHERE year = ? RETURNING (next_no - 1) AS used_no`,
    [year],
  );
  const usedNo = Number(result.rows[0].used_no);
  return `INV-${year}-${String(usedNo).padStart(6, '0')}`;
}
