import { db } from '../../../db/connection.js';
import type { ReportPdfOptions } from '../../../lib/reports/pdfExport.js';

export type StockByWarehouseRow = {
  warehouse: string;
  status: string;
  roll_count: number;
  total_weight_kg: string;
  total_length_m: string;
};

export type StockByWarehouseSummary = {
  warehouse: string;
  total_rolls: number;
  total_weight_kg: string;
  total_length_m: string;
};

export type StockByWarehouseResult = {
  rows: StockByWarehouseRow[];
  by_warehouse: StockByWarehouseSummary[];
  grand_total_rolls: number;
  grand_total_weight_kg: string;
};

const WAREHOUSE_LABELS: Record<string, string> = {
  shop: 'المحل',
  factory: 'المصنع',
  damaged_shop: 'تالف المحل',
};

const STATUS_LABELS: Record<string, string> = {
  in_stock: 'في المخزن',
  reserved: 'محجوز',
  sold: 'مُباع',
  damaged: 'تالف',
  sample: 'عينة',
  returned: 'مُرجَع',
  written_off: 'مُشطَب',
};

export async function getStockByWarehouse(): Promise<StockByWarehouseResult> {
  const rows = await db('rolls')
    .groupBy('warehouse', 'status')
    .orderBy(['warehouse', 'status'])
    .select(
      'warehouse',
      'status',
      db.raw('COUNT(*) as roll_count'),
      db.raw('COALESCE(SUM(weight_kg), 0) as total_weight_kg'),
      db.raw('COALESCE(SUM(length_m), 0) as total_length_m'),
    );

  const byWarehouse = await db('rolls')
    .groupBy('warehouse')
    .orderBy('warehouse')
    .select(
      'warehouse',
      db.raw('COUNT(*) as total_rolls'),
      db.raw('COALESCE(SUM(weight_kg), 0) as total_weight_kg'),
      db.raw('COALESCE(SUM(length_m), 0) as total_length_m'),
    );

  const grandTotalRolls = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r['roll_count']), 0);
  const grandTotalWeight = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r['total_weight_kg']), 0);

  return {
    rows: rows.map((r: Record<string, unknown>) => ({
      warehouse: WAREHOUSE_LABELS[String(r['warehouse'])] ?? String(r['warehouse']),
      status: STATUS_LABELS[String(r['status'])] ?? String(r['status']),
      roll_count: Number(r['roll_count']),
      total_weight_kg: Number(r['total_weight_kg']).toFixed(3),
      total_length_m: Number(r['total_length_m']).toFixed(2),
    })),
    by_warehouse: byWarehouse.map((r: Record<string, unknown>) => ({
      warehouse: WAREHOUSE_LABELS[String(r['warehouse'])] ?? String(r['warehouse']),
      total_rolls: Number(r['total_rolls']),
      total_weight_kg: Number(r['total_weight_kg']).toFixed(3),
      total_length_m: Number(r['total_length_m']).toFixed(2),
    })),
    grand_total_rolls: grandTotalRolls,
    grand_total_weight_kg: grandTotalWeight.toFixed(3),
  };
}

export function stockByWarehouseToExport(
  data: StockByWarehouseResult,
  generatedAt: string,
): ReportPdfOptions {
  return {
    titleAr: 'المخزون حسب المخزن',
    generatedAt,
    sections: [
      {
        titleAr: 'التوزيع حسب المخزن والحالة',
        columns: [
          { label: 'المخزن', key: 'warehouse', width: 'auto' },
          { label: 'الحالة', key: 'status', width: 'auto' },
          { label: 'عدد التوبات', key: 'roll_count', width: 'auto' },
          { label: 'الوزن الإجمالي (كجم)', key: 'total_weight_kg', width: 'auto' },
          { label: 'الطول الإجمالي (م)', key: 'total_length_m', width: 'auto' },
        ],
        rows: data.rows.map((r) => ({ ...r, roll_count: String(r.roll_count) })),
        totals: {
          warehouse: 'الإجمالي',
          roll_count: String(data.grand_total_rolls),
          total_weight_kg: data.grand_total_weight_kg,
        },
        emptyAr: 'لا توجد توبات',
      },
    ],
  };
}
