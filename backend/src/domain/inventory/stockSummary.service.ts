import { db } from '../../db/connection.js';

export type WarehouseFilter = 'shop' | 'factory' | 'damaged_shop';

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
  weight_kg_in_stock: number;
  avg_reference_price_per_unit: number;
  last_reference_price_per_unit: number;
  selling_price_egp: number;
  min_quantity_rolls: number;
};

const ALLOWED_WAREHOUSES: WarehouseFilter[] = ['shop', 'factory', 'damaged_shop'];

export async function getStockSummary(warehouse?: WarehouseFilter): Promise<StockSummaryRow[]> {
  const wh: WarehouseFilter | null =
    warehouse && ALLOWED_WAREHOUSES.includes(warehouse) ? warehouse : null;
  const whBoundClause = wh ? `AND r.warehouse = '${wh}'` : '';

  const rows = await db('rolls as r')
    .join('fabrics as f', 'f.id', 'r.fabric_id')
    .join('colors as c', 'c.id', 'r.color_id')
    .select(
      'f.id as fabric_id',
      'f.name_ar as fabric_name_ar',
      'f.code as fabric_code',
      'f.min_quantity_rolls as min_quantity_rolls',
      'c.id as color_id',
      'c.name_ar as color_name_ar',
      'c.code as color_code',
      db.raw(`COUNT(*) FILTER (WHERE r.status = 'in_stock' ${whBoundClause}) AS count_in_stock`),
      db.raw(`COUNT(*) FILTER (WHERE r.status = 'reserved') AS count_reserved`),
      db.raw(`COUNT(*) FILTER (WHERE r.status = 'sold') AS count_sold`),
      db.raw(`COUNT(*) AS count_total`),
      db.raw(`COALESCE(SUM(r.weight_kg) FILTER (WHERE r.status = 'in_stock' ${whBoundClause}), 0) AS weight_kg_in_stock`),
      db.raw(`COALESCE(AVG(r.reference_price_per_unit) FILTER (WHERE r.status = 'in_stock' ${whBoundClause}), 0) AS avg_reference_price_per_unit`),
      db.raw(`COALESCE(AVG(r.selling_price_egp) FILTER (WHERE r.status = 'in_stock' ${whBoundClause}), 0) AS selling_price_egp`),
      db.raw(`(
        SELECT r2.reference_price_per_unit
        FROM rolls r2
        WHERE r2.fabric_id = f.id AND r2.color_id = c.id AND r2.reference_price_per_unit IS NOT NULL
        ORDER BY r2.received_at DESC NULLS LAST, r2.id DESC
        LIMIT 1
      ) AS last_reference_price_per_unit`),
    )
    .groupBy('f.id', 'f.name_ar', 'f.code', 'f.min_quantity_rolls', 'c.id', 'c.name_ar', 'c.code')
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
    weight_kg_in_stock: Number(r.weight_kg_in_stock),
    avg_reference_price_per_unit: Number(r.avg_reference_price_per_unit),
    last_reference_price_per_unit: Number(r.last_reference_price_per_unit ?? 0),
    selling_price_egp: Number(r.selling_price_egp),
    min_quantity_rolls: Number(r.min_quantity_rolls),
  }));
}
