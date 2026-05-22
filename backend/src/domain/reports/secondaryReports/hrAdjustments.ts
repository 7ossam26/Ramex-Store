import { db } from '../../../db/connection.js';
import type { ReportPdfOptions } from '../../../lib/reports/pdfExport.js';

export type HrAdjustmentsRow = {
  employee_name_ar: string;
  role_ar: string;
  kind: string;
  salary_month: string;
  amount_egp: string;
  notes_ar: string | null;
};

export type HrAdjustmentsByEmployee = {
  employee_name_ar: string;
  total_advances_egp: string;
  total_deductions_egp: string;
  net_egp: string;
};

export type HrAdjustmentsResult = {
  rows: HrAdjustmentsRow[];
  by_employee: HrAdjustmentsByEmployee[];
  total_advances_egp: string;
  total_deductions_egp: string;
};

const KIND_LABELS: Record<string, string> = {
  advance: 'سلفة',
  deduction: 'خصم',
};

export async function getHrAdjustments(from: string, to: string): Promise<HrAdjustmentsResult> {
  const rows = await db('hr_salary_adjustments as a')
    .join('hr_employees as e', 'a.employee_id', 'e.id')
    .whereBetween('a.salary_month', [from.slice(0, 7), to.slice(0, 7)])
    .orderBy(['a.salary_month', 'e.name_ar', 'a.kind'])
    .select(
      'e.name_ar as employee_name_ar',
      'e.role_ar',
      'a.kind',
      'a.salary_month',
      'a.amount_egp',
      'a.notes_ar',
    );

  const byEmployee = await db('hr_salary_adjustments as a')
    .join('hr_employees as e', 'a.employee_id', 'e.id')
    .whereBetween('a.salary_month', [from.slice(0, 7), to.slice(0, 7)])
    .groupBy('e.id', 'e.name_ar')
    .orderBy('e.name_ar')
    .select(
      'e.name_ar as employee_name_ar',
      db.raw("COALESCE(SUM(CASE WHEN a.kind = 'advance' THEN a.amount_egp ELSE 0 END), 0) as total_advances_egp"),
      db.raw("COALESCE(SUM(CASE WHEN a.kind = 'deduction' THEN a.amount_egp ELSE 0 END), 0) as total_deductions_egp"),
    );

  const totalAdvances = rows
    .filter((r: Record<string, unknown>) => r['kind'] === 'advance')
    .reduce((s: number, r: Record<string, unknown>) => s + Number(r['amount_egp']), 0);
  const totalDeductions = rows
    .filter((r: Record<string, unknown>) => r['kind'] === 'deduction')
    .reduce((s: number, r: Record<string, unknown>) => s + Number(r['amount_egp']), 0);

  return {
    rows: rows.map((r: Record<string, unknown>) => ({
      employee_name_ar: String(r['employee_name_ar']),
      role_ar: String(r['role_ar']),
      kind: KIND_LABELS[String(r['kind'])] ?? String(r['kind']),
      salary_month: String(r['salary_month']),
      amount_egp: Number(r['amount_egp']).toFixed(2),
      notes_ar: r['notes_ar'] ? String(r['notes_ar']) : null,
    })),
    by_employee: byEmployee.map((r: Record<string, unknown>) => {
      const adv = Number(r['total_advances_egp']);
      const ded = Number(r['total_deductions_egp']);
      return {
        employee_name_ar: String(r['employee_name_ar']),
        total_advances_egp: adv.toFixed(2),
        total_deductions_egp: ded.toFixed(2),
        net_egp: (ded - adv).toFixed(2),
      };
    }),
    total_advances_egp: totalAdvances.toFixed(2),
    total_deductions_egp: totalDeductions.toFixed(2),
  };
}

export function hrAdjustmentsToExport(
  data: HrAdjustmentsResult,
  from: string,
  to: string,
  generatedAt: string,
): ReportPdfOptions {
  return {
    titleAr: 'السُّلف والخصومات',
    subtitleAr: `من ${from} إلى ${to}`,
    generatedAt,
    sections: [
      {
        titleAr: 'تفاصيل السُّلف والخصومات',
        columns: [
          { label: 'الموظف', key: 'employee_name_ar', width: '*' },
          { label: 'الوظيفة', key: 'role_ar', width: 'auto' },
          { label: 'النوع', key: 'kind', width: 'auto' },
          { label: 'الشهر', key: 'salary_month', width: 'auto' },
          { label: 'المبلغ (ج.م)', key: 'amount_egp', width: 'auto' },
        ],
        rows: data.rows.map((r) => ({ ...r, notes_ar: r.notes_ar ?? '' })),
        totals: {
          employee_name_ar: 'الإجمالي',
          amount_egp: (Number(data.total_advances_egp) + Number(data.total_deductions_egp)).toFixed(2),
        },
        emptyAr: 'لا توجد سُلف أو خصومات في هذه الفترة',
      },
    ],
  };
}
