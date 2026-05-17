import { db } from '../../db/connection.js';

export type StockSummaryRow = {
  fabric_id: number;
  fabric_name_ar: string;
  fabric_code: string;
  color_id: number;
  color_name_ar: string;
  color_code: string;
  count_in_stock: number;
  count_reserved: number;
  count_sold: number;
  count_total: number;
};

export async function getStockSummary(): Promise<StockSummaryRow[]> {
  const rows = await db('rolls as r')
    .join('fabrics as f', 'f.id', 'r.fabric_id')
    .join('colors as c', 'c.id', 'r.color_id')
    .select(
      'f.id as fabric_id',
      'f.name_ar as fabric_name_ar',
      'f.code as fabric_code',
      'c.id as color_id',
      'c.name_ar as color_name_ar',
      'c.code as color_code',
      db.raw(`COUNT(*) FILTER (WHERE r.status = 'in_stock' AND r.warehouse = 'shop') AS count_in_stock`),
      db.raw(`COUNT(*) FILTER (WHERE r.status = 'reserved') AS count_reserved`),
      db.raw(`COUNT(*) FILTER (WHERE r.status = 'sold') AS count_sold`),
      db.raw(`COUNT(*) AS count_total`),
    )
    .groupBy('f.id', 'f.name_ar', 'f.code', 'c.id', 'c.name_ar', 'c.code')
    .orderBy('f.name_ar')
    .orderBy('c.name_ar');

  return rows.map((r) => ({
    fabric_id: Number(r.fabric_id),
    fabric_name_ar: r.fabric_name_ar as string,
    fabric_code: r.fabric_code as string,
    color_id: Number(r.color_id),
    color_name_ar: r.color_name_ar as string,
    color_code: r.color_code as string,
    count_in_stock: Number(r.count_in_stock),
    count_reserved: Number(r.count_reserved),
    count_sold: Number(r.count_sold),
    count_total: Number(r.count_total),
  }));
}
