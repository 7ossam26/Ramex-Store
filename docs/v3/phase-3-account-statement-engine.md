# v3 · Phase 3 — Account statement engine + supplier statement

> Self-contained prompt. Paste into a fresh Claude Code session. Depends on Phase 2 (line items). Builds a **reusable** statement engine, then applies it to suppliers. Phase 4 reuses the same engine for customers.

## Read first (in order)

1. `CORE_PLAN.md` — end to end (§9 Receipt, §12 Reports)
2. `docs/v3/PLAN.md`, `docs/v3/phase-2-purchase-invoice-lines.md`, and this file
3. The current code:
   - `backend/src/lib/reports/pdfExport.ts` — `buildReportPdf(opts: ReportPdfOptions)`, and the shared shapes `ReportColumn` / `ReportSection` / `ReportPdfOptions`
   - `backend/src/lib/reports/excelExport.ts` — `buildReportExcel`
   - `backend/src/lib/reports/printableHtml.ts` — `buildPrintableHtml`
   - `backend/src/domain/reports/reports.controller.ts` — `exportSecondaryReport` (the `format === 'excel' | 'print' | pdf` switch + `Content-Type`/`Content-Disposition` headers) — **copy this wiring**
   - `backend/src/domain/reports/secondaryReports/customerLedger.ts` — `customerLedgerToExport(...)` (copy the **section shape** only; its SQL is broken, ignore it)
   - `backend/src/lib/datetime/cairo.js` — `cairoToday`, `formatCairo`
   - `backend/src/domain/finance/cashDrawerService.ts` — `dailyExpected` (the correct `AT TIME ZONE 'Africa/Cairo'` date-boundary pattern to imitate)
   - `frontend/src/pages/invoices/DraftInvoicePrintPage.tsx` + `frontend/src/components/invoices/DraftInvoiceDocument.tsx` (+ its `.css`) — the A4 print + `?preview=1` + toolbar `data-print="hide"` + طباعة/رجوع + `<Num dir="ltr">` + `currencyLabel` pattern to imitate

## Stack invariants (restated)

- Backend: Node.js + TypeScript, Knex, Postgres 16
- Frontend: React + TypeScript, RTL only, Arabic labels only
- Auth: `permissionsService.can()` — resource `suppliers`, action `view` to read/export a supplier statement
- **Never auto-print** — render an on-screen preview with an explicit **طباعة** button
- Export via the existing `buildReportPdf` / `buildReportExcel` / `buildPrintableHtml` — **no new export libraries**
- All date math in **Africa/Cairo** local boundaries
- UI work MUST invoke the `ui-ux-pro-max` skill

## Scope

A reusable **statement builder** that, given a from/to range, produces: a **brought-forward** opening line, the in-window transactions with a **running balance**, and a **closing balance** — in the account's currency — plus **summary** and **detailed** presentations exportable to PDF / Excel / print. Then a supplier-facing statement page.

### Backend — reusable engine (`backend/src/lib/statements/` or `backend/src/domain/statements/`)

- Define an abstract account shape the engine consumes, so Phase 4 can reuse it verbatim:
  ```
  StatementAccount = {
    titleAr: string;            // e.g. "كشف حساب مورد: <name>"
    currency: 'EGP' | 'RMB';
    openingBalance: number;     // signed
    openingDate: string | null; // as-of date
    entries: StatementEntry[];  // full timeline, unsorted ok
  }
  StatementEntry = {
    date: string;               // invoice_date / paid_at / opening date
    createdAt: string;          // tie-break
    kind: 'invoice' | 'payment' | 'opening' | 'adjustment';
    description: string;
    debit: number;              // increases what we owe / they owe
    credit: number;             // decreases it
    ref?: string;               // internal_no / PINV / receipt no
    lineItems?: { description: string; quantity: number; unit: string; unit_price: number; line_total: number }[];
  }
  ```
- `buildStatement(account, from, to)`:
  - **Brought forward** = `openingBalance` + net (Σdebit − Σcredit) of all entries with `date` **strictly before** `from` (use `<`, Cairo-local date). Include the opening entry in brought-forward when `openingDate < from`.
  - In-window = entries with Cairo-local `date` in `[from, to]` inclusive, sorted by `date` then `createdAt`, each carrying a **running balance** = previous running balance + debit − credit (seeded from brought-forward).
  - **Closing balance** = running balance after the last in-window entry.
  - Return a structured result the exporters and the UI both consume.
- **`statementToExport(result, variant: 'summary' | 'detailed'): ReportPdfOptions`** — map to the shared `ReportSection[]` shape:
  - **summary**: one section, columns [date, ref, description, debit, credit, balance]; first row = brought forward; totals row = closing balance.
  - **detailed**: each invoice row is followed by its line items (grouped). Because grouped rows don't fit the flat `ReportSection.rows` cleanly, either emit a per-invoice sub-section or build a small dedicated document; ensure `page-break-inside: avoid` on rows (already in `printableHtml.ts`).
  - Format numbers with the account's currency symbol.

### Backend — supplier adapter + route

- Supplier adapter: load the supplier (name, currency, opening_balance, opening_balance_date), its invoices (with lines, keyed by `invoice_date`, `debit = total`), and payments (keyed by `paid_at`, `credit = amount`), map into `StatementAccount`.
- Route `GET /treasury/suppliers/:id/statement?from=&to=&format=&variant=` (`view`): `format` in `json | pdf | excel | print`; `variant` in `summary | detailed`. `json` feeds the on-screen preview; the file formats mirror `exportSecondaryReport`'s headers. Optionally audit statement exports (mirror `salesApi.auditReprint`).

### Frontend — supplier statement page

- `SupplierStatementPage` (route e.g. `/treasury/suppliers/:id/statement`): from/to date range (default: this month), **variant toggle** (summary / detailed), and an **on-screen preview** that renders the `json` result, modeled on `DraftInvoicePrintPage` (`?preview` style, toolbar hidden in print via `data-print="hide"`).
- Buttons: **طباعة** (`window.print()`), **PDF**, **Excel** (download the corresponding format), **رجوع**.
- Numbers use `<Num dir="ltr">` and the supplier's currency symbol (¥ / ج.م) so bidi is correct in RTL.
- Add Arabic strings (statement title, brought forward «رصيد سابق», debit «مدين», credit «دائن», balance «الرصيد», closing «الرصيد الختامي», summary/detailed toggle).

## Acceptance

- Statement for an RMB supplier over a custom range shows correct **brought forward** (opening + net strictly before `from`), a correct per-row **running balance**, and a **closing balance**, all in `¥`.
- Detailed variant shows each invoice expanded to its line items (description, qty, unit price, total).
- PDF, Excel, and print each render RTL correctly with Western digits and the right currency symbol.
- The preview renders on screen before any print dialog opens.
- Date boundaries are **Cairo-local** (a transaction at 01:00 Cairo on the `to` date is included; one at 23:00 Cairo the day before `from` is excluded).
- `npm run typecheck && npm run build && npm run lint` clean.

## Smoke checklist

- [ ] Supplier with opening balance + several invoices/payments → statement math ties out (brought forward + Σ in-window = closing).
- [ ] Narrow the range so some transactions fall before `from` → they roll into brought forward, not the body.
- [ ] Detailed variant lists items per invoice; summary variant does not.
- [ ] Export PDF / Excel / print → all three open, RTL, correct ¥ symbol, Western digits.
- [ ] Preview shows first; nothing auto-prints.
- [ ] A near-midnight Cairo transaction lands in the correct day.

## Commit

`feat(v3-phase-3): account statement engine + supplier statement (pdf/excel/print/preview)`

## Stop here

Print "Phase 3 done — ready for Phase 4" and exit.
