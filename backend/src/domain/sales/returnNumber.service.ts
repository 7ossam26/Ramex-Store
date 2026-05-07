import type { Knex } from 'knex';

export async function nextReturnNo(trx: Knex.Transaction, year: number): Promise<string> {
  await trx.raw(
    `INSERT INTO return_sequence (year, next_no) VALUES (?, 1) ON CONFLICT (year) DO NOTHING`,
    [year],
  );
  const result = await trx.raw<{ rows: Array<{ used_no: number }> }>(
    `UPDATE return_sequence SET next_no = next_no + 1 WHERE year = ? RETURNING (next_no - 1) AS used_no`,
    [year],
  );
  const usedNo = Number(result.rows[0].used_no);
  return `RET-${year}-${String(usedNo).padStart(6, '0')}`;
}
