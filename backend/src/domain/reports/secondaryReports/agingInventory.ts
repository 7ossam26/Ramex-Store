import { db } from '../../../db/connection.js';
import type { ReportPdfOptions } from '../../../lib/reports/pdfExport.js';

export type AgingInventoryRow = {
  fabric_name_ar: string;
  color_name_ar: string;
  warehouse: string;
  roll_sr_no: string;
  weight_kg: string;
  age_days: number;
  bucket: string;
};

export type AgingBucket = {
  bucket: string;
  roll_count: number;
  total_weight_kg: string;
};

export type AgingInventoryResult = {
  rows: AgingInventoryRow[];
  by_bucket: AgingBucket[];
  grand_total_rolls: number;
  grand_total_weight_kg: string;
};

function ageBucket(days: number): string {
  if (days <= 30) return '0–30 يوم';
  if (days <= 60) return '31–60 يوم';
  if (days <= 90) return '61–90 يوم';
  return 'أكثر من 90 يوم';
}

const WAREHOUSE_LABELS: Record<string, string> = {
  shop: 'المحل',
  factory: 'المصنع',
  damaged_shop: 'تالف المحل',
};

export async function getAgingInventory(): Promise<AgingInventoryResult> {
  const rows = await db('rolls as r')
    .join('fabrics as f', 'r.fabric_id', 'f.id')
    .join('colors as c', 'r.color_id', 'c.id')
    .where('r.status', 'in_stock')
    .orderByRaw('COALESCE(r.received_at, r.created_at) ASC')
    .select(
      'f.name_ar as fabric_name_ar',
      'c.name_ar as color_name_ar',
      'r.warehouse',
      'r.roll_sr_no',
      'r.weight_kg',
      db.raw("EXTRACT(DAY FROM (NOW() - COALESCE(r.received_at, r.created_at)))::INTEGER as age_days"),
    );

  const mapped: AgingInventoryRow[] = rows.map((r: Record<string, unknown>) => ({
    fabric_name_ar: String(r['fabric_name_ar']),
    color_name_ar: String(r['color_name_ar']),
    warehouse: WAREHOUSE_LABELS[String(r['warehouse'])] ?? String(r['warehouse']),
    roll_sr_no: String(r['roll_sr_no'] ?? ''),
    weight_kg: Number(r['weight_kg'] ?? 0).toFixed(3),
    age_days: Number(r['age_days']),
    bucket: ageBucket(Number(r['age_days'])),
  }));

  const bucketOrder = ['0–30 يوم', '31–60 يوم', '61–90 يوم', 'أكثر من 90 يوم'];
  const bucketMap = new Map<string, { count: number; weight: number }>();
  for (const b of bucketOrder) bucketMap.set(b, { count: 0, weight: 0 });
  for (const r of mapped) {
    const b = bucketMap.get(r.bucket)!;
    b.count += 1;
    b.weight += Number(r.weight_kg);
  }

  const byBucket: AgingBucket[] = bucketOrder.map((b) => ({
    bucket: b,
    roll_count: bucketMap.get(b)!.count,
    total_weight_kg: bucketMap.get(b)!.weight.toFixed(3),
  }));

  const grandTotalWeight = mapped.reduce((s, r) => s + Number(r.weight_kg), 0);

  return {
    rows: mapped,
    by_bucket: byBucket,
    grand_total_rolls: mapped.length,
    grand_total_weight_kg: grandTotalWeight.toFixed(3),
  };
}

export function agingInventoryToExport(
  data: AgingInventoryResult,
  generatedAt: string,
): ReportPdfOptions {
  return {
    titleAr: 'الاتواب الراكدة في المخزن',
    generatedAt,
    sections: [
      {
        titleAr: 'التوزيع حسب فترة التخزين',
        columns: [
          { label: 'الخامة', key: 'fabric_name_ar', width: '*' },
          { label: 'اللون', key: 'color_name_ar', width: 'auto' },
          { label: 'المخزن', key: 'warehouse', width: 'auto' },
          { label: 'رقم التوب', key: 'roll_sr_no', width: 'auto' },
          { label: 'الوزن (كجم)', key: 'weight_kg', width: 'auto' },
          { label: 'الأيام', key: 'age_days', width: 'auto' },
          { label: 'الفترة', key: 'bucket', width: 'auto' },
        ],
        rows: data.rows.map((r) => ({ ...r, age_days: String(r.age_days) })),
        totals: {
          fabric_name_ar: 'الإجمالي',
          weight_kg: data.grand_total_weight_kg,
        },
        emptyAr: 'لا توجد اتواب في المخزن',
      },
    ],
  };
}
