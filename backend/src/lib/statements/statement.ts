import type { ReportPdfOptions, ReportSection } from '../reports/pdfExport.js';

/**
 * Reusable account-statement engine.
 *
 * Given an abstract {@link StatementAccount} (opening balance + a flat, unsorted
 * timeline of debit/credit entries) and a `from`/`to` window (Cairo-local
 * calendar dates), {@link buildStatement} produces:
 *   - a **brought-forward** opening figure = openingBalance + net of everything
 *     strictly before `from`,
 *   - the in-window entries carrying a **running balance**, and
 *   - a **closing balance**.
 *
 * The shape is currency-agnostic and transaction-source-agnostic so the supplier
 * adapter (Phase 3) and the customer adapter (Phase 4) both feed it verbatim.
 *
 * All dates are **Cairo-local calendar dates** (`YYYY-MM-DD`); the adapter is
 * responsible for converting any timestamp to its Cairo calendar day before
 * handing entries here. Comparisons are lexicographic, which is correct for the
 * zero-padded `YYYY-MM-DD` format.
 */

export type Currency = 'EGP' | 'RMB';

export type StatementKind = 'invoice' | 'payment' | 'opening' | 'adjustment' | 'purchase_return';

export type StatementLineItem = {
  description: string;
  /** Fabric color (اللون), when the source line carries one. Supplier-only field. */
  color?: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
};

export type StatementEntry = {
  /** Cairo-local calendar date `YYYY-MM-DD` (or null for an undated opening). */
  date: string | null;
  /** Tie-break within the same date (ISO timestamp, or any sortable string). */
  createdAt: string;
  kind: StatementKind;
  description: string;
  /** Increases what we owe / they owe. */
  debit: number;
  /** Decreases it. */
  credit: number;
  /** Internal no / PINV / receipt no. */
  ref?: string;
  lineItems?: StatementLineItem[];
};

export type StatementAccount = {
  titleAr: string; // e.g. "كشف حساب مورد: <name>"
  currency: Currency;
  openingBalance: number; // signed
  openingDate: string | null; // as-of Cairo date
  entries: StatementEntry[]; // full timeline, unsorted ok
};

/** A single computed row of the statement body (in-window entry). */
export type StatementRow = {
  date: string; // display date `YYYY-MM-DD`
  createdAt: string;
  kind: StatementKind;
  ref: string;
  description: string;
  debit: number;
  credit: number;
  /** Running balance after this row. */
  balance: number;
  lineItems?: StatementLineItem[];
};

export type StatementResult = {
  titleAr: string;
  currency: Currency;
  from: string;
  to: string;
  /** openingBalance + net of all entries strictly before `from`. */
  broughtForward: number;
  rows: StatementRow[];
  /** Σ in-window debit. */
  totalDebit: number;
  /** Σ in-window credit. */
  totalCredit: number;
  /** Running balance after the last in-window row (= broughtForward when empty). */
  closing: number;
};

/** Round to 2 decimals (money) — avoids binary FP drift on running sums. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Synthesise the opening balance as a timeline entry so it is handled uniformly:
 * folded into brought-forward when its date is before `from` (or undated), or
 * shown as the first in-window row when its date falls inside the window.
 */
function openingEntry(account: StatementAccount): StatementEntry | null {
  if (account.openingBalance === 0 && !account.openingDate) return null;
  const bal = account.openingBalance;
  return {
    date: account.openingDate,
    // Undated openings sort before everything; dated ones sort first on their day.
    createdAt: account.openingDate ? `${account.openingDate}T00:00:00.000Z` : '',
    kind: 'opening',
    description: 'رصيد افتتاحي',
    debit: bal > 0 ? bal : 0,
    credit: bal < 0 ? -bal : 0,
  };
}

export function buildStatement(
  account: StatementAccount,
  from: string,
  to: string,
): StatementResult {
  const opening = openingEntry(account);
  const timeline: StatementEntry[] = opening ? [opening, ...account.entries] : [...account.entries];

  // Brought forward = opening + net (Σdebit − Σcredit) of everything strictly
  // before `from`. An undated entry (null date) is always "before".
  let broughtForward = 0;
  const inWindow: StatementEntry[] = [];
  for (const e of timeline) {
    if (e.date === null || e.date < from) {
      broughtForward += e.debit - e.credit;
    } else if (e.date <= to) {
      inWindow.push(e);
    }
    // Entries after `to` are excluded entirely.
  }
  broughtForward = round2(broughtForward);

  // Sort in-window by date then createdAt (stable ordering of same-day rows).
  inWindow.sort((a, b) => {
    const d = (a.date ?? '').localeCompare(b.date ?? '');
    if (d !== 0) return d;
    return a.createdAt.localeCompare(b.createdAt);
  });

  let running = broughtForward;
  let totalDebit = 0;
  let totalCredit = 0;
  const rows: StatementRow[] = inWindow.map((e) => {
    running = round2(running + e.debit - e.credit);
    totalDebit += e.debit;
    totalCredit += e.credit;
    return {
      date: e.date ?? '',
      createdAt: e.createdAt,
      kind: e.kind,
      ref: e.ref ?? '',
      description: e.description,
      debit: e.debit,
      credit: e.credit,
      balance: running,
      ...(e.lineItems ? { lineItems: e.lineItems } : {}),
    };
  });

  return {
    titleAr: account.titleAr,
    currency: account.currency,
    from,
    to,
    broughtForward,
    rows,
    totalDebit: round2(totalDebit),
    totalCredit: round2(totalCredit),
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

/** Money with the account's currency symbol, Western digits (e.g. "1,234.00 ¥"). */
function fmtAmount(n: number, currency: Currency): string {
  const s = Number(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${s} ${CURRENCY_SYMBOL[currency]}`;
}

/** Blank for zero amounts so debit/credit columns stay uncluttered. */
function fmtSide(n: number, currency: Currency): string {
  return n === 0 ? '' : fmtAmount(n, currency);
}

function fmtQty(n: number): string {
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 3 });
}

/** One-line summary of a line item for the detailed variant. */
function lineItemText(li: StatementLineItem, currency: Currency): string {
  return `↳ ${li.description} — ${fmtQty(li.quantity)} ${UNIT_AR[li.unit] ?? li.unit} × ${fmtAmount(
    li.unit_price,
    currency,
  )} = ${fmtAmount(li.line_total, currency)}`;
}

/**
 * Map a built statement into the shared {@link ReportPdfOptions} consumed by
 * `buildReportPdf` / `buildReportExcel` / `buildPrintableHtml`.
 *
 * - `summary`: brought-forward row, one row per in-window entry, closing totals.
 * - `detailed`: same, but each invoice row is followed by its line-item rows.
 */
export function statementToExport(
  result: StatementResult,
  variant: 'summary' | 'detailed',
  generatedAt: string,
): ReportPdfOptions {
  const { currency } = result;
  const columns = [
    { label: 'التاريخ', key: 'date', width: 'auto' as const },
    { label: 'المرجع', key: 'ref', width: 'auto' as const },
    { label: 'البيان', key: 'description', width: '*' as const },
    { label: 'مدين', key: 'debit', width: 'auto' as const },
    { label: 'دائن', key: 'credit', width: 'auto' as const },
    { label: 'الرصيد', key: 'balance', width: 'auto' as const, bold: true },
  ];

  const rows: Record<string, unknown>[] = [];

  // First row: brought forward.
  rows.push({
    date: '',
    ref: '',
    description: 'رصيد سابق',
    debit: '',
    credit: '',
    balance: fmtAmount(result.broughtForward, currency),
  });

  for (const r of result.rows) {
    rows.push({
      date: r.date,
      ref: r.ref,
      description: r.description,
      debit: fmtSide(r.debit, currency),
      credit: fmtSide(r.credit, currency),
      balance: fmtAmount(r.balance, currency),
    });
    if (variant === 'detailed' && r.lineItems && r.lineItems.length > 0) {
      for (const li of r.lineItems) {
        rows.push({
          date: '',
          ref: '',
          description: lineItemText(li, currency),
          debit: '',
          credit: '',
          balance: '',
        });
      }
    }
  }

  const section: ReportSection = {
    titleAr: variant === 'detailed' ? 'كشف الحساب — تفصيلي' : 'كشف الحساب',
    columns,
    rows,
    totals: {
      description: 'الرصيد الختامي',
      debit: fmtAmount(result.totalDebit, currency),
      credit: fmtAmount(result.totalCredit, currency),
      balance: fmtAmount(result.closing, currency),
    },
    emptyAr: 'لا توجد حركات في هذه الفترة',
  };

  return {
    titleAr: result.titleAr,
    subtitleAr: `من ${result.from} إلى ${result.to} · ${CURRENCY_SYMBOL[currency]}`,
    generatedAt,
    sections: [section],
  };
}
