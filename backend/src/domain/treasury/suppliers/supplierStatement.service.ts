import * as repo from './suppliers.repository.js';
import { SupplierValidationError } from './suppliers.service.js';
import {
  buildStatement,
  statementToExport,
  type StatementAccount,
  type StatementEntry,
  type StatementResult,
} from '../../../lib/statements/statement.js';
import type { ReportPdfOptions } from '../../../lib/reports/pdfExport.js';

const METHOD_AR: Record<string, string> = {
  cash: 'نقدي',
  instapay: 'انستاباي',
  bank_transfer: 'تحويل بنكي',
};

/** Cairo-local calendar date (`YYYY-MM-DD`) of a UTC timestamp. */
function cairoDate(ts: string | Date): string {
  return new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
}

function toIso(ts: string | Date): string {
  return new Date(ts).toISOString();
}

/**
 * Load a supplier and map its opening balance, invoices (with lines) and
 * payments into the currency-agnostic {@link StatementAccount} the engine
 * consumes. Invoices are debits (invoice_date), payments are credits (paid_at,
 * converted to its Cairo calendar day so a near-midnight payment lands in the
 * right day).
 */
export async function loadSupplierAccount(supplierId: number): Promise<StatementAccount> {
  const supplier = await repo.getSupplier(supplierId);
  if (!supplier) throw new SupplierValidationError('SUPPLIER_NOT_FOUND', 'المورد غير موجود', 404);

  const [invoices, payments] = await Promise.all([
    repo.listInvoicesWithLines(supplierId),
    repo.listPayments(supplierId),
  ]);

  const entries: StatementEntry[] = [];

  for (const inv of invoices) {
    const debit = Number(inv.total ?? inv.amount_egp ?? 0);
    entries.push({
      date: inv.invoice_date, // `date` column → already Cairo-local `YYYY-MM-DD`
      createdAt: toIso(inv.created_at),
      kind: 'invoice',
      description: 'فاتورة مشتريات',
      debit,
      credit: 0,
      ref: inv.internal_no ?? inv.invoice_no ?? '',
      lineItems: inv.lines.map((l) => ({
        description: l.description,
        quantity: Number(l.quantity),
        unit: l.unit,
        unit_price: Number(l.unit_price),
        line_total: Number(l.line_total),
      })),
    });
  }

  for (const p of payments) {
    const methodAr = METHOD_AR[p.method] ?? p.method;
    const desc = p.bank_name_ar ? `سداد — ${methodAr} / ${p.bank_name_ar}` : `سداد — ${methodAr}`;
    entries.push({
      date: cairoDate(p.paid_at),
      createdAt: toIso(p.created_at),
      kind: 'payment',
      description: p.notes_ar ? `${desc} · ${p.notes_ar}` : desc,
      debit: 0,
      credit: Number(p.amount_egp),
      ref: '',
    });
  }

  return {
    titleAr: `كشف حساب مورد: ${supplier.arabic_name}`,
    currency: supplier.currency,
    openingBalance: Number(supplier.opening_balance ?? 0),
    openingDate: supplier.opening_balance_date ?? null,
    entries,
  };
}

/** Build the supplier statement for the on-screen preview (`json`). */
export async function getSupplierStatement(
  supplierId: number,
  from: string,
  to: string,
): Promise<StatementResult> {
  const account = await loadSupplierAccount(supplierId);
  return buildStatement(account, from, to);
}

/** Build the supplier statement mapped to the shared exporter options. */
export async function getSupplierStatementExport(
  supplierId: number,
  from: string,
  to: string,
  variant: 'summary' | 'detailed',
  generatedAt: string,
): Promise<ReportPdfOptions> {
  const result = await getSupplierStatement(supplierId, from, to);
  return statementToExport(result, variant, generatedAt);
}
