import { db } from '../../../db/connection.js';
import { formatCairo } from '../../../lib/datetime/cairo.js';
import type { ReportPdfOptions } from '../../../lib/reports/pdfExport.js';

export type DamageLossRow = {
  id: number;
  created_at: string;
  reason_code: string;
  disposition: string;
  fabric_name_ar: string;
  color_name_ar: string;
  roll_sr_no: string | null;
  weight_kg: string;
  valuation_egp: string;
  notes_ar: string | null;
  recorded_by: string;
};

export type DamageLossResult = {
  rows: DamageLossRow[];
  by_reason: { reason_code: string; count: number; total_valuation_egp: string }[];
  grand_total_egp: string;
};

export async function getDamageLoss(from: string, to: string): Promise<DamageLossResult> {
  const rows = await db('damage_events as de')
    .join('rolls as r', 'de.roll_id', 'r.id')
    .join('fabrics as f', 'r.fabric_id', 'f.id')
    .join('colors as c', 'r.color_id', 'c.id')
    .join('users as u', 'de.recorded_by_user_id', 'u.id')
    .whereBetween('de.created_at', [from, to])
    .orderBy('de.created_at', 'asc')
    .select(
      'de.id',
      'de.created_at',
      'de.reason_code',
      'de.disposition',
      'f.name_ar as fabric_name_ar',
      'c.name_ar as color_name_ar',
      'r.roll_sr_no',
      'r.weight_kg',
      'de.valuation_egp',
      'de.notes_ar',
      'u.username as recorded_by',
    );

  const byReason = await db('damage_events')
    .whereBetween('created_at', [from, to])
    .groupBy('reason_code')
    .orderBy('reason_code')
    .select(
      'reason_code',
      db.raw('COUNT(*) as count'),
      db.raw('COALESCE(SUM(valuation_egp), 0) as total_valuation_egp'),
    );

  const grandTotal = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r['valuation_egp']), 0);

  return {
    rows: rows.map((r: Record<string, unknown>) => ({
      id: Number(r['id']),
      created_at: formatCairo(String(r['created_at'])),
      reason_code: String(r['reason_code']),
      disposition: String(r['disposition']),
      fabric_name_ar: String(r['fabric_name_ar']),
      color_name_ar: String(r['color_name_ar']),
      roll_sr_no: r['roll_sr_no'] as string | null,
      weight_kg: Number(r['weight_kg']).toFixed(3),
      valuation_egp: Number(r['valuation_egp']).toFixed(2),
      notes_ar: r['notes_ar'] as string | null,
      recorded_by: String(r['recorded_by']),
    })),
    by_reason: byReason.map((r: Record<string, unknown>) => ({
      reason_code: String(r['reason_code']),
      count: Number(r['count']),
      total_valuation_egp: Number(r['total_valuation_egp']).toFixed(2),
    })),
    grand_total_egp: grandTotal.toFixed(2),
  };
}

export function damageLossToExport(
  result: DamageLossResult,
  from: string,
  to: string,
  generatedAt: string,
): ReportPdfOptions {
  return {
    titleAr: 'التلف والفقد',
    subtitleAr: `من ${from} إلى ${to}`,
    generatedAt,
    sections: [
      {
        titleAr: 'ملخص حسب السبب',
        columns: [
          { label: 'السبب', key: 'reason_code', width: '*' },
          { label: 'العدد', key: 'count', width: 'auto' },
          { label: 'إجمالي التقييم (ج.م)', key: 'total_valuation_egp', width: 'auto', bold: true },
        ],
        rows: result.by_reason.map((r) => ({ ...r, count: String(r.count) })),
        totals: { reason_code: 'الإجمالي', total_valuation_egp: result.grand_total_egp },
        emptyAr: 'لا توجد أحداث تلف في هذه الفترة',
      },
      {
        titleAr: 'تفاصيل أحداث التلف والفقد',
        columns: [
          { label: 'التاريخ', key: 'created_at', width: 'auto' },
          { label: 'السبب', key: 'reason_code', width: 'auto' },
          { label: 'التصرف', key: 'disposition', width: 'auto' },
          { label: 'الخامة', key: 'fabric_name_ar', width: '*' },
          { label: 'اللون', key: 'color_name_ar', width: 'auto' },
          { label: 'رقم التوب', key: 'roll_sr_no', width: 'auto' },
          { label: 'الوزن (كجم)', key: 'weight_kg', width: 'auto' },
          { label: 'التقييم (ج.م)', key: 'valuation_egp', width: 'auto' },
          { label: 'ملاحظات', key: 'notes_ar', width: '*' },
        ],
        rows: result.rows.map((r) => ({ ...r, roll_sr_no: r.roll_sr_no ?? '', notes_ar: r.notes_ar ?? '' })),
        emptyAr: 'لا توجد أحداث تلف في هذه الفترة',
      },
    ],
  };
}
