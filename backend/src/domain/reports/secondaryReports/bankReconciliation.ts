import { db } from '../../../db/connection.js';
import { formatCairo } from '../../../lib/datetime/cairo.js';
import type { ReportPdfOptions } from '../../../lib/reports/pdfExport.js';

export type ReconciliationRow = {
  reconciliation_id: number;
  bank_name_ar: string;
  reconciled_at: string;
  expected_balance_egp: string;
  actual_balance_egp: string;
  variance_egp: string;
  notes_ar: string | null;
  performed_by: string;
};

export async function getBankReconciliation(
  from: string,
  to: string,
): Promise<ReconciliationRow[]> {
  const rows = await db('reconciliations as rec')
    .join('bank_accounts as ba', 'rec.bank_account_id', 'ba.id')
    .join('users as u', 'rec.performed_by_user_id', 'u.id')
    .whereBetween('rec.created_at', [from, to])
    .orderBy('rec.created_at', 'desc')
    .select(
      'rec.id as reconciliation_id',
      'ba.name_ar as bank_name_ar',
      'rec.created_at as reconciled_at',
      'rec.expected_balance_egp',
      'rec.actual_balance_egp',
      db.raw('rec.actual_balance_egp - rec.expected_balance_egp as variance_egp'),
      'rec.notes_ar',
      'u.username as performed_by',
    );

  return rows.map((r: Record<string, unknown>) => ({
    reconciliation_id: Number(r['reconciliation_id']),
    bank_name_ar: String(r['bank_name_ar']),
    reconciled_at: formatCairo(String(r['reconciled_at'])),
    expected_balance_egp: Number(r['expected_balance_egp']).toFixed(2),
    actual_balance_egp: Number(r['actual_balance_egp']).toFixed(2),
    variance_egp: Number(r['variance_egp']).toFixed(2),
    notes_ar: r['notes_ar'] as string | null,
    performed_by: String(r['performed_by']),
  }));
}

export function bankReconciliationToExport(
  rows: ReconciliationRow[],
  from: string,
  to: string,
  generatedAt: string,
): ReportPdfOptions {
  return {
    titleAr: 'تسوية البنوك',
    subtitleAr: `من ${from} إلى ${to}`,
    generatedAt,
    sections: [
      {
        titleAr: 'سجل التسويات',
        columns: [
          { label: 'البنك', key: 'bank_name_ar', width: '*' },
          { label: 'تاريخ التسوية', key: 'reconciled_at', width: 'auto' },
          { label: 'الرصيد المتوقع', key: 'expected_balance_egp', width: 'auto' },
          { label: 'الرصيد الفعلي', key: 'actual_balance_egp', width: 'auto' },
          { label: 'الفرق (ج.م)', key: 'variance_egp', width: 'auto', bold: true },
          { label: 'بواسطة', key: 'performed_by', width: 'auto' },
          { label: 'ملاحظات', key: 'notes_ar', width: '*' },
        ],
        rows: rows.map((r) => ({ ...r, notes_ar: r.notes_ar ?? '' })),
        emptyAr: 'لا توجد تسويات في هذه الفترة',
      },
    ],
  };
}
