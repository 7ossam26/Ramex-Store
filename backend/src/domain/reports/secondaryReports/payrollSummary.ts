import { db } from '../../../db/connection.js';
import type { ReportPdfOptions } from '../../../lib/reports/pdfExport.js';

export type PayrollSummaryRow = {
  month: string;
  employee_count: number;
  total_gross_egp: string;
  total_adjustments_egp: string;
  total_net_egp: string;
  by_method: string;
};

export type PayrollDetailRow = {
  month: string;
  employee_name_ar: string;
  role_ar: string;
  gross_egp: string;
  adjustments_egp: string;
  net_egp: string;
  paid_via: string;
};

export type PayrollSummaryResult = {
  rows: PayrollDetailRow[];
  by_month: PayrollSummaryRow[];
  total_gross_egp: string;
  total_net_egp: string;
};

const VIA_LABELS: Record<string, string> = {
  cash: 'نقدي',
  instapay: 'انستاباي',
  bank_transfer: 'تحويل بنكي',
};

export async function getPayrollSummary(from: string, to: string): Promise<PayrollSummaryResult> {
  const rows = await db('hr_salary_disbursements as d')
    .join('hr_employees as e', 'd.employee_id', 'e.id')
    .whereBetween('d.month', [from.slice(0, 7), to.slice(0, 7)])
    .orderBy(['d.month', 'e.name_ar'])
    .select(
      'd.month',
      'e.name_ar as employee_name_ar',
      'e.role_ar',
      'd.gross_egp',
      'd.adjustments_egp',
      'd.net_egp',
      'd.paid_via',
    );

  const byMonth = await db('hr_salary_disbursements')
    .whereBetween('month', [from.slice(0, 7), to.slice(0, 7)])
    .groupBy('month')
    .orderBy('month')
    .select(
      'month',
      db.raw('COUNT(*) as employee_count'),
      db.raw('COALESCE(SUM(gross_egp), 0) as total_gross_egp'),
      db.raw('COALESCE(SUM(adjustments_egp), 0) as total_adjustments_egp'),
      db.raw('COALESCE(SUM(net_egp), 0) as total_net_egp'),
    );

  const totalGross = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r['gross_egp']), 0);
  const totalNet = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r['net_egp']), 0);

  return {
    rows: rows.map((r: Record<string, unknown>) => ({
      month: String(r['month']),
      employee_name_ar: String(r['employee_name_ar']),
      role_ar: String(r['role_ar']),
      gross_egp: Number(r['gross_egp']).toFixed(2),
      adjustments_egp: Number(r['adjustments_egp']).toFixed(2),
      net_egp: Number(r['net_egp']).toFixed(2),
      paid_via: VIA_LABELS[String(r['paid_via'])] ?? String(r['paid_via']),
    })),
    by_month: byMonth.map((r: Record<string, unknown>) => ({
      month: String(r['month']),
      employee_count: Number(r['employee_count']),
      total_gross_egp: Number(r['total_gross_egp']).toFixed(2),
      total_adjustments_egp: Number(r['total_adjustments_egp']).toFixed(2),
      total_net_egp: Number(r['total_net_egp']).toFixed(2),
      by_method: '',
    })),
    total_gross_egp: totalGross.toFixed(2),
    total_net_egp: totalNet.toFixed(2),
  };
}

export function payrollSummaryToExport(
  data: PayrollSummaryResult,
  from: string,
  to: string,
  generatedAt: string,
): ReportPdfOptions {
  return {
    titleAr: 'ملخص الرواتب',
    subtitleAr: `من ${from} إلى ${to}`,
    generatedAt,
    sections: [
      {
        titleAr: 'تفاصيل الرواتب المصروفة',
        columns: [
          { label: 'الشهر', key: 'month', width: 'auto' },
          { label: 'الموظف', key: 'employee_name_ar', width: '*' },
          { label: 'الوظيفة', key: 'role_ar', width: 'auto' },
          { label: 'الراتب الأساسي (ج.م)', key: 'gross_egp', width: 'auto' },
          { label: 'التسويات (ج.م)', key: 'adjustments_egp', width: 'auto' },
          { label: 'الصافي (ج.م)', key: 'net_egp', width: 'auto' },
          { label: 'طريقة الصرف', key: 'paid_via', width: 'auto' },
        ],
        rows: data.rows,
        totals: {
          month: 'الإجمالي',
          gross_egp: data.total_gross_egp,
          net_egp: data.total_net_egp,
        },
        emptyAr: 'لا توجد رواتب مصروفة في هذه الفترة',
      },
    ],
  };
}
