import { db } from '../../../db/connection.js';
import { formatCairo } from '../../../lib/datetime/cairo.js';
import type { ReportPdfOptions } from '../../../lib/reports/pdfExport.js';

export type ExpenseRow = {
  id: number;
  created_at: string;
  category: string;
  amount_egp: string;
  paid_from: string;
  status: string;
  notes_ar: string | null;
  photo_url: string | null;
  created_by: string;
};

export type ExpensesResult = {
  rows: ExpenseRow[];
  by_category: { category: string; total_egp: string }[];
  grand_total_egp: string;
};

export async function getExpenses(from: string, to: string): Promise<ExpensesResult> {
  const rows = await db('expenses as e')
    .join('users as u', 'e.created_by_user_id', 'u.id')
    .whereBetween('e.created_at', [from, to])
    .orderBy('e.created_at', 'asc')
    .select(
      'e.id',
      'e.created_at',
      'e.category',
      'e.amount_egp',
      'e.paid_from',
      'e.status',
      'e.notes_ar',
      'e.photo_path as photo_url',
      'u.username as created_by',
    );

  const byCatRows = await db('expenses')
    .whereBetween('created_at', [from, to])
    .groupBy('category')
    .orderBy('category')
    .select('category', db.raw('COALESCE(SUM(amount_egp), 0) as total_egp'));

  const grandTotal = rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r['amount_egp']), 0);

  return {
    rows: rows.map((r: Record<string, unknown>) => ({
      id: Number(r['id']),
      created_at: formatCairo(String(r['created_at'])),
      category: String(r['category']),
      amount_egp: Number(r['amount_egp']).toFixed(2),
      paid_from: String(r['paid_from']),
      status: String(r['status']),
      notes_ar: r['notes_ar'] as string | null,
      photo_url: r['photo_url'] as string | null,
      created_by: String(r['created_by']),
    })),
    by_category: byCatRows.map((r: Record<string, unknown>) => ({
      category: String(r['category']),
      total_egp: Number(r['total_egp']).toFixed(2),
    })),
    grand_total_egp: grandTotal.toFixed(2),
  };
}

export function expensesToExport(
  result: ExpensesResult,
  from: string,
  to: string,
  generatedAt: string,
): ReportPdfOptions {
  return {
    titleAr: 'المصروفات',
    subtitleAr: `من ${from} إلى ${to}`,
    generatedAt,
    sections: [
      {
        titleAr: 'ملخص حسب الفئة',
        columns: [
          { label: 'الفئة', key: 'category', width: '*' },
          { label: 'الإجمالي (ج.م)', key: 'total_egp', width: 'auto', bold: true },
        ],
        rows: result.by_category,
        totals: { category: 'الإجمالي الكلي', total_egp: result.grand_total_egp },
        emptyAr: 'لا توجد مصروفات في هذه الفترة',
      },
      {
        titleAr: 'تفاصيل المصروفات',
        columns: [
          { label: 'التاريخ', key: 'created_at', width: 'auto' },
          { label: 'الفئة', key: 'category', width: 'auto' },
          { label: 'المبلغ (ج.م)', key: 'amount_egp', width: 'auto' },
          { label: 'المصدر', key: 'paid_from', width: 'auto' },
          { label: 'الحالة', key: 'status', width: 'auto' },
          { label: 'بواسطة', key: 'created_by', width: 'auto' },
          { label: 'ملاحظات', key: 'notes_ar', width: '*' },
        ],
        rows: result.rows.map((r) => ({
          id: r.id,
          created_at: r.created_at,
          category: r.category,
          amount_egp: r.amount_egp,
          paid_from: r.paid_from,
          status: r.status,
          notes_ar: r.notes_ar ?? '',
          created_by: r.created_by,
        })),
        emptyAr: 'لا توجد مصروفات في هذه الفترة',
      },
    ],
  };
}
