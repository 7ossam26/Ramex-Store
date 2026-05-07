import { db } from '../../../db/connection.js';
import type { ReportPdfOptions } from '../../../lib/reports/pdfExport.js';

export type StocktakeRow = {
  warehouse: string;
  fabric_name_ar: string;
  color_name_ar: string;
  roll_sr_no: string | null;
  internal_barcode: string;
  weight_kg: string;
  status: string;
  selling_price_egp: string;
  valuation_egp: string;
};

export type StocktakeSummary = {
  rows: StocktakeRow[];
  total_rolls: number;
  total_weight_kg: string;
  total_valuation_egp: string;
};

export async function getStocktakeInventory(): Promise<StocktakeSummary> {
  const rows = await db('rolls as r')
    .join('fabrics as f', 'r.fabric_id', 'f.id')
    .join('colors as c', 'r.color_id', 'c.id')
    .whereIn('r.status', ['in_stock', 'reserved', 'sample'])
    .orderBy(['r.warehouse', 'f.name_ar', 'c.name_ar'])
    .select(
      'r.warehouse',
      'f.name_ar as fabric_name_ar',
      'c.name_ar as color_name_ar',
      'r.roll_sr_no',
      'r.internal_barcode',
      'r.weight_kg',
      'r.status',
      'r.selling_price_egp',
      db.raw('r.weight_kg * r.selling_price_egp as valuation_egp'),
    );

  const mapped: StocktakeRow[] = rows.map((r: Record<string, unknown>) => ({
    warehouse: String(r['warehouse']),
    fabric_name_ar: String(r['fabric_name_ar']),
    color_name_ar: String(r['color_name_ar']),
    roll_sr_no: r['roll_sr_no'] as string | null,
    internal_barcode: String(r['internal_barcode']),
    weight_kg: Number(r['weight_kg']).toFixed(3),
    status: String(r['status']),
    selling_price_egp: Number(r['selling_price_egp']).toFixed(2),
    valuation_egp: Number(r['valuation_egp']).toFixed(2),
  }));

  const totalWeight = mapped.reduce((s, r) => s + Number(r.weight_kg), 0);
  const totalVal = mapped.reduce((s, r) => s + Number(r.valuation_egp), 0);

  return {
    rows: mapped,
    total_rolls: mapped.length,
    total_weight_kg: totalWeight.toFixed(3),
    total_valuation_egp: totalVal.toFixed(2),
  };
}

export function stocktakeInventoryToExport(
  summary: StocktakeSummary,
  generatedAt: string,
): ReportPdfOptions {
  return {
    titleAr: 'جرد المخزون',
    generatedAt,
    sections: [
      {
        titleAr: 'قائمة التوبات المتاحة',
        columns: [
          { label: 'المخزن', key: 'warehouse', width: 'auto' },
          { label: 'الخامة', key: 'fabric_name_ar', width: '*' },
          { label: 'اللون', key: 'color_name_ar', width: 'auto' },
          { label: 'رقم التوب', key: 'roll_sr_no', width: 'auto' },
          { label: 'الباركود', key: 'internal_barcode', width: 'auto' },
          { label: 'الوزن (كجم)', key: 'weight_kg', width: 'auto' },
          { label: 'الحالة', key: 'status', width: 'auto' },
          { label: 'السعر/كجم', key: 'selling_price_egp', width: 'auto' },
          { label: 'التقييم (ج.م)', key: 'valuation_egp', width: 'auto', bold: true },
        ],
        rows: summary.rows.map((r) => ({ ...r, roll_sr_no: r.roll_sr_no ?? '' })),
        totals: {
          warehouse: 'الإجمالي',
          weight_kg: summary.total_weight_kg,
          valuation_egp: summary.total_valuation_egp,
        },
        emptyAr: 'لا توجد توبات في المخزون',
      },
    ],
  };
}
