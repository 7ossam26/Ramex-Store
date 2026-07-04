import { db } from '../../db/connection.js';
import type { ReportPdfOptions } from '../../lib/reports/pdfExport.js';

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

const WAREHOUSE_LABEL: Record<string, string> = {
  shop: 'المعرض',
  factory: 'المصنع',
  damaged_shop: 'مخزن التالف',
};

export function stockSummaryToExport(
  rows: StockSummaryRow[],
  warehouse: string | undefined,
  generatedAt: string,
): ReportPdfOptions {
  const totalInStock = rows.reduce((s, r) => s + r.count_in_stock, 0);
  const totalReserved = rows.reduce((s, r) => s + r.count_reserved, 0);
  const totalWeight = rows.reduce((s, r) => s + r.weight_kg_in_stock, 0);

  return {
    titleAr: 'ملخص المخزون',
    subtitleAr: warehouse ? WAREHOUSE_LABEL[warehouse] ?? warehouse : 'كل المخازن',
    generatedAt,
    sections: [
      {
        titleAr: 'ملخص المخزون',
        columns: [
          { label: 'الخامة', key: 'fabric_name_ar', width: 22 },
          { label: 'كود الخامة', key: 'fabric_code', width: 14 },
          { label: 'اللون', key: 'color_name_ar', width: 18 },
          { label: 'كود اللون', key: 'color_code', width: 12 },
          { label: 'في المخزون (توب)', key: 'count_in_stock', width: 16 },
          { label: 'محجوز (توب)', key: 'count_reserved', width: 14 },
          { label: 'الوزن المتاح (كجم)', key: 'weight_kg_in_stock', width: 18 },
          { label: 'متوسط السعر المرجعي', key: 'avg_reference_price_per_unit', width: 20 },
          { label: 'آخر سعر مرجعي', key: 'last_reference_price_per_unit', width: 18 },
          { label: 'سعر البيع', key: 'selling_price_egp', width: 14 },
          { label: 'الحد الأدنى (توب)', key: 'min_quantity_rolls', width: 16 },
        ],
        rows: rows.map((r) => ({
          fabric_name_ar: r.fabric_name_ar,
          fabric_code: r.fabric_code,
          color_name_ar: r.color_name_ar,
          color_code: r.color_code,
          count_in_stock: String(r.count_in_stock),
          count_reserved: String(r.count_reserved),
          weight_kg_in_stock: r.weight_kg_in_stock.toFixed(3),
          avg_reference_price_per_unit: r.avg_reference_price_per_unit.toFixed(2),
          last_reference_price_per_unit: r.last_reference_price_per_unit.toFixed(2),
          selling_price_egp: r.selling_price_egp.toFixed(2),
          min_quantity_rolls: String(r.min_quantity_rolls),
        })),
        totals: {
          fabric_name_ar: 'الإجمالي',
          count_in_stock: String(totalInStock),
          count_reserved: String(totalReserved),
          weight_kg_in_stock: totalWeight.toFixed(3),
        },
        emptyAr: 'لا توجد أصناف في هذا المخزون',
      },
    ],
  };
}
