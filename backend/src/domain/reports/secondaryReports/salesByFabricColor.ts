import { db } from '../../../db/connection.js';
import { SALE_REALIZED_STATUSES } from '../../sales/sales.types.js';
import type { ReportPdfOptions } from '../../../lib/reports/pdfExport.js';

export type SalesByFabricColorRow = {
  fabric_name_ar: string;
  color_name_ar: string;
  roll_count: number;
  total_weight_kg: string;
  total_revenue_egp: string;
  avg_price_per_kg: string;
};

export async function getSalesByFabricColor(
  from: string,
  to: string,
  fabricId?: number,
  colorId?: number,
): Promise<SalesByFabricColorRow[]> {
  const rows = await db('invoice_lines as il')
    .join('invoices as i', 'il.invoice_id', 'i.id')
    .join('rolls as r', 'il.roll_id', 'r.id')
    .join('fabrics as f', 'r.fabric_id', 'f.id')
    .join('colors as c', 'r.color_id', 'c.id')
    .whereIn('i.status', SALE_REALIZED_STATUSES as unknown as string[])
    .whereBetween('i.created_at', [from, to])
    .modify((qb) => {
      if (fabricId) qb.where('f.id', fabricId);
      if (colorId) qb.where('c.id', colorId);
    })
    .groupBy('f.name_ar', 'c.name_ar')
    .orderBy(['f.name_ar', 'c.name_ar'])
    .select(
      'f.name_ar as fabric_name_ar',
      'c.name_ar as color_name_ar',
      db.raw('COUNT(*) as roll_count'),
      db.raw('COALESCE(SUM(r.weight_kg), 0) as total_weight_kg'),
      db.raw('COALESCE(SUM(il.line_total_egp), 0) as total_revenue_egp'),
      db.raw(
        'CASE WHEN COALESCE(SUM(r.weight_kg), 0) = 0 THEN 0 ELSE ROUND(COALESCE(SUM(il.line_total_egp), 0) / SUM(r.weight_kg), 2) END as avg_price_per_kg',
      ),
    );

  return rows.map((r: Record<string, unknown>) => ({
    fabric_name_ar: String(r['fabric_name_ar']),
    color_name_ar: String(r['color_name_ar']),
    roll_count: Number(r['roll_count']),
    total_weight_kg: Number(r['total_weight_kg']).toFixed(3),
    total_revenue_egp: Number(r['total_revenue_egp']).toFixed(2),
    avg_price_per_kg: Number(r['avg_price_per_kg']).toFixed(2),
  }));
}

export function salesByFabricColorToExport(
  rows: SalesByFabricColorRow[],
  from: string,
  to: string,
  generatedAt: string,
): ReportPdfOptions {
  const totRevenue = rows.reduce((s, r) => s + Number(r.total_revenue_egp), 0);
  const totWeight = rows.reduce((s, r) => s + Number(r.total_weight_kg), 0);

  return {
    titleAr: 'مبيعات حسب الخامة واللون',
    subtitleAr: `من ${from} إلى ${to}`,
    generatedAt,
    sections: [
      {
        titleAr: 'مبيعات حسب الخامة واللون',
        columns: [
          { label: 'الخامة', key: 'fabric_name_ar', width: '*' },
          { label: 'اللون', key: 'color_name_ar', width: 'auto' },
          { label: 'عدد الاتواب', key: 'roll_count', width: 'auto' },
          { label: 'الوزن الإجمالي (كجم)', key: 'total_weight_kg', width: 'auto' },
          { label: 'الإيراد الإجمالي (ج.م)', key: 'total_revenue_egp', width: 'auto' },
          { label: 'متوسط السعر/كجم', key: 'avg_price_per_kg', width: 'auto' },
        ],
        rows: rows.map((r) => ({ ...r, roll_count: String(r.roll_count) })),
        totals: {
          fabric_name_ar: 'الإجمالي',
          total_weight_kg: totWeight.toFixed(3),
          total_revenue_egp: totRevenue.toFixed(2),
        },
        emptyAr: 'لا توجد مبيعات في هذه الفترة',
      },
    ],
  };
}
