import type { ReportPdfOptions, ReportSection } from '../../../lib/reports/pdfExport.js';
import type { Currency, StatementAccount, StatementEntry } from '../../../lib/statements/statement.js';

/**
 * Supplier-only fabric-ledger statement — a line-level export matching the
 * shop's paper ledger (رقم الاذن · التاريخ · البيان · اللون · الكمية · السعر ·
 * القيمة · كمية المرتجع · قيمة المرتجع · الدفعات · الرصيد).
 *
 * Unlike the shared debit/credit {@link StatementAccount} engine (still used by
 * the customer statement), every invoice/return line item becomes its own row
 * with a running balance, and permit no / date are only shown on the first row
 * of each document (blank on continuation rows, mirroring the paper ledger's
 * merged cells).
 */

/** Round to 2 decimals (money) — avoids binary FP drift on running sums. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type SupplierLedgerRow = {
  permitNo: string;
  date: string;
  description: string;
  color: string;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  value: number | null;
  returnQty: number | null;
  returnValue: number | null;
  payment: number | null;
  balance: number;
};

export type SupplierLedgerResult = {
  titleAr: string;
  currency: Currency;
  from: string;
  to: string;
  broughtForward: number;
  rows: SupplierLedgerRow[];
  totalValue: number;
  totalReturnValue: number;
  totalPayment: number;
  closing: number;
};

/** Synthesise the opening balance as a timeline entry, same convention as the shared engine. */
function openingEntry(account: StatementAccount): StatementEntry | null {
  if (account.openingBalance === 0 && !account.openingDate) return null;
  const bal = account.openingBalance;
  return {
    date: account.openingDate,
    createdAt: account.openingDate ? `${account.openingDate}T00:00:00.000Z` : '',
    kind: 'opening',
    description: 'رصيد افتتاحي',
    debit: bal > 0 ? bal : 0,
    credit: bal < 0 ? -bal : 0,
  };
}

export function buildSupplierLedger(
  account: StatementAccount,
  from: string,
  to: string,
): SupplierLedgerResult {
  const opening = openingEntry(account);
  const timeline: StatementEntry[] = opening ? [opening, ...account.entries] : [...account.entries];

  let broughtForward = 0;
  const inWindow: StatementEntry[] = [];
  for (const e of timeline) {
    if (e.date === null || e.date < from) {
      broughtForward += e.debit - e.credit;
    } else if (e.date <= to) {
      inWindow.push(e);
    }
  }
  broughtForward = round2(broughtForward);

  inWindow.sort((a, b) => {
    const d = (a.date ?? '').localeCompare(b.date ?? '');
    if (d !== 0) return d;
    return a.createdAt.localeCompare(b.createdAt);
  });

  let running = broughtForward;
  let totalValue = 0;
  let totalReturnValue = 0;
  let totalPayment = 0;
  const rows: SupplierLedgerRow[] = [];

  for (const e of inWindow) {
    if (e.kind === 'opening') {
      running = round2(running + e.debit - e.credit);
      rows.push({
        permitNo: '',
        date: e.date ?? '',
        description: e.description,
        color: '',
        quantity: null,
        unit: null,
        unitPrice: null,
        value: null,
        returnQty: null,
        returnValue: null,
        payment: null,
        balance: running,
      });
      continue;
    }

    if (e.kind === 'payment') {
      running = round2(running - e.credit);
      totalPayment = round2(totalPayment + e.credit);
      rows.push({
        permitNo: e.ref ?? '',
        date: e.date ?? '',
        description: e.description,
        color: '',
        quantity: null,
        unit: null,
        unitPrice: null,
        value: null,
        returnQty: null,
        returnValue: null,
        payment: e.credit,
        balance: running,
      });
      continue;
    }

    // invoice | purchase_return — expand each line item into its own row.
    const isReturn = e.kind === 'purchase_return';
    const lineItems = e.lineItems ?? [];
    const docTotal = isReturn ? e.credit : e.debit;
    const lineSum = round2(lineItems.reduce((s, li) => s + li.line_total, 0));

    lineItems.forEach((li, idx) => {
      running = round2(running + (isReturn ? -li.line_total : li.line_total));
      if (isReturn) totalReturnValue = round2(totalReturnValue + li.line_total);
      else totalValue = round2(totalValue + li.line_total);
      rows.push({
        permitNo: idx === 0 ? (e.ref ?? '') : '',
        date: idx === 0 ? (e.date ?? '') : '',
        description: li.description,
        color: li.color ?? '',
        quantity: li.quantity,
        unit: li.unit,
        unitPrice: li.unit_price,
        value: isReturn ? null : li.line_total,
        returnQty: isReturn ? li.quantity : null,
        returnValue: isReturn ? li.line_total : null,
        payment: null,
        balance: running,
      });
    });

    // Extra charges (or a document with no lines) don't show up in the line
    // items — surface the gap as a trailing row so the balance ties out.
    const extra = round2(docTotal - lineSum);
    if (extra !== 0) {
      running = round2(running + (isReturn ? -extra : extra));
      if (isReturn) totalReturnValue = round2(totalReturnValue + extra);
      else totalValue = round2(totalValue + extra);
      rows.push({
        permitNo: lineItems.length === 0 ? (e.ref ?? '') : '',
        date: lineItems.length === 0 ? (e.date ?? '') : '',
        description: 'مصاريف إضافية',
        color: '',
        quantity: null,
        unit: null,
        unitPrice: null,
        value: isReturn ? null : extra,
        returnQty: null,
        returnValue: isReturn ? extra : null,
        payment: null,
        balance: running,
      });
    }
  }

  return {
    titleAr: account.titleAr,
    currency: account.currency,
    from,
    to,
    broughtForward,
    rows,
    totalValue: round2(totalValue),
    totalReturnValue: round2(totalReturnValue),
    totalPayment: round2(totalPayment),
    closing: rows.length > 0 ? running : broughtForward,
  };
}

// ─── Export mapping ───────────────────────────────────────────────────────────

const CURRENCY_SYMBOL: Record<Currency, string> = { EGP: 'ج.م', RMB: '¥' };

const UNIT_AR: Record<string, string> = {
  kg: 'كجم',
  meter: 'متر',
  roll: 'توب',
  piece: 'قطعة',
};

function fmtAmount(n: number): string {
  return Number(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtOrBlank(n: number | null): string {
  return n === null || n === 0 ? '' : fmtAmount(n);
}

function fmtQty(n: number | null): string {
  return n === null ? '' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 3 });
}

export function supplierLedgerToExport(
  result: SupplierLedgerResult,
  generatedAt: string,
): ReportPdfOptions {
  const { currency } = result;
  const columns = [
    { label: 'رقم الاذن', key: 'permitNo', width: 'auto' as const },
    { label: 'التاريخ', key: 'date', width: 'auto' as const },
    { label: 'البيان', key: 'description', width: '*' as const },
    { label: 'اللون', key: 'color', width: 'auto' as const },
    { label: 'الكمية', key: 'quantity', width: 'auto' as const },
    { label: 'الوحدة', key: 'unit', width: 'auto' as const },
    { label: `السعر (${CURRENCY_SYMBOL[currency]})`, key: 'unitPrice', width: 'auto' as const },
    { label: `القيمة (${CURRENCY_SYMBOL[currency]})`, key: 'value', width: 'auto' as const },
    { label: 'كمية المرتجع', key: 'returnQty', width: 'auto' as const },
    { label: `قيمة المرتجع (${CURRENCY_SYMBOL[currency]})`, key: 'returnValue', width: 'auto' as const },
    { label: 'الدفعات', key: 'payment', width: 'auto' as const },
    { label: 'الرصيد', key: 'balance', width: 'auto' as const, bold: true },
  ];

  const rows: Record<string, unknown>[] = [];

  rows.push({
    permitNo: '',
    date: '',
    description: 'رصيد سابق',
    color: '',
    quantity: '',
    unit: '',
    unitPrice: '',
    value: '',
    returnQty: '',
    returnValue: '',
    payment: '',
    balance: fmtAmount(result.broughtForward),
  });

  for (const r of result.rows) {
    const unitAr = r.unit ? (UNIT_AR[r.unit] ?? r.unit) : '';
    rows.push({
      permitNo: r.permitNo,
      date: r.date,
      description: r.description,
      color: r.color,
      quantity: r.quantity === null ? '' : fmtQty(r.quantity),
      unit: unitAr,
      unitPrice: fmtOrBlank(r.unitPrice),
      value: fmtOrBlank(r.value),
      returnQty: r.returnQty === null ? '' : fmtQty(r.returnQty),
      returnValue: fmtOrBlank(r.returnValue),
      payment: fmtOrBlank(r.payment),
      balance: fmtAmount(r.balance),
    });
  }

  const section: ReportSection = {
    titleAr: 'كشف الحساب',
    columns,
    rows,
    totals: {
      description: 'الإجمالي',
      value: fmtAmount(result.totalValue),
      returnValue: fmtAmount(result.totalReturnValue),
      payment: fmtAmount(result.totalPayment),
      balance: fmtAmount(result.closing),
    },
    emptyAr: 'لا توجد حركات في هذه الفترة',
  };

  return {
    titleAr: result.titleAr,
    subtitleAr: `من ${result.from} إلى ${result.to} · ${CURRENCY_SYMBOL[currency]}`,
    generatedAt,
    orientation: 'landscape',
    sections: [section],
  };
}
