import type { Knex } from 'knex';

/**
 * Atomically allocates the next purchase-return number for a given year using the
 * `supplier_return_sequence(year, next_no)` table. Concurrency-safe: relies on
 * the row-level lock taken by the UPDATE. Mirrors `purchaseInvoiceNumber.service.ts`.
 *
 * Sequence resets every January 1st.
 *
 * Returns PRET-YYYY-NNNNNN with NNNNNN zero-padded to 6 digits.
 */
export async function nextPurchaseReturnNo(trx: Knex.Transaction, year: number): Promise<string> {
  await trx.raw(
    `INSERT INTO supplier_return_sequence (year, next_no) VALUES (?, 1) ON CONFLICT (year) DO NOTHING`,
    [year],
  );
  const result = await trx.raw<{ rows: Array<{ used_no: number }> }>(
    `UPDATE supplier_return_sequence SET next_no = next_no + 1 WHERE year = ? RETURNING (next_no - 1) AS used_no`,
    [year],
  );
  const usedNo = Number(result.rows[0].used_no);
  return `PRET-${year}-${String(usedNo).padStart(6, '0')}`;
}
