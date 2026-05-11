import type { Knex } from 'knex';

export async function nextShipmentNo(trx: Knex.Transaction, year: number): Promise<string> {
  await trx.raw(
    `INSERT IGNORE INTO shipment_sequence (year, next_no) VALUES (?, 1)`,
    [year],
  );
  await trx.raw(
    `UPDATE shipment_sequence SET next_no = next_no + 1 WHERE year = ?`,
    [year],
  );
  const [rows] = await trx.raw<[Array<{ used_no: number }>]>(
    `SELECT next_no - 1 AS used_no FROM shipment_sequence WHERE year = ?`,
    [year],
  );
  const usedNo = Number(rows[0].used_no);
  return `SHP-${year}-${String(usedNo).padStart(6, '0')}`;
}
