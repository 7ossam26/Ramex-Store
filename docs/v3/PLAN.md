# v3 — Accounting & Supplier Payables (Epic Plan)

> This epic expands the existing basic supplier-payables module into a full accounts-payable / accounts-receivable layer: per-supplier currency (EGP **or** RMB), detailed line-item purchase invoices, opening balances, off-treasury payments, and printable/exportable **account statements** for both suppliers and sales customers.
>
> Each phase below is a **self-contained prompt**. Paste one phase file into a fresh Claude Code session, let it run to completion (build + migrations + commit), then move to the next. Do not skip the ordering — later phases depend on earlier ones.

## Governance

- **CORE_PLAN.md is the contract.** Read it end-to-end before every phase.
- System is **pre-production**: migrations may be destructive; no backwards-compatibility shims required.
- Arabic-only RTL UI, EGP/RMB with **Western digits**, **Africa/Cairo** timezone, `decimal(14,2)` money.
- Audit every sensitive write via `auditFromService` (`backend/src/domain/inventory/audit.helper.ts`).
- Never auto-open a print dialog — always render an on-screen preview with an explicit **طباعة** button.
- Each phase ends: `npm run typecheck && npm run build && npm run lint` clean, migrations apply + rollback clean, commit to `main`.

## Locked decisions

1. **Currency** EGP or RMB per supplier, chosen at creation, **fixed** thereafter. No exchange rate / no conversion (FX handled manually outside the system). Existing suppliers → EGP.
2. **Purchase-invoice lines** free-text (description · qty · unit · unit price · line total), **not** linked to inventory; plus an **extra-charges** line and a **due date**. No tax, no invoice discount, no attachment.
3. **Balance-forward** accounting — payments are not allocated to specific invoices.
4. **All supplier payments off-treasury** — a payment no longer debits cash drawer / bank.
5. **Opening balances** for both suppliers and customers (signed amount + as-of date), shown as "balance brought forward".
6. **Statements** summary + detailed variants, from/to filter, brought-forward = opening + net strictly before `from`; export PDF + Excel + A4 print, preview first.
7. **Corrections** invoices & payments editable/deletable freely, always audited.
8. **Customers** EGP-only; reuse existing ledger + sales line items; add a standalone receipt entry.

## Phase sequence

| # | Phase | Covers | Depends on | Prompt file |
|---|---|---|---|---|
| 0 | Supplier payments off-treasury | Remove cash/bank debit from `recordPayment` (behavior only) | — | `phase-0-supplier-payments-offtreasury.md` |
| 1 | Supplier accounts | Currency + opening balance + supplier CRUD + PINV sequence + payment edit/delete + money widened to (14,2) | 0 | `phase-1-supplier-accounts.md` |
| 2 | Purchase invoice line items | `supplier_invoice_lines`, extra charges, due date, totals, invoice CRUD + form/list/detail | 1 | `phase-2-purchase-invoice-lines.md` |
| 3 | Account statement engine | Reusable builder + supplier statement (summary/detailed, PDF/Excel/print/preview) | 2 | `phase-3-account-statement-engine.md` |
| 4 | Customer accounts | Customer opening balance + standalone receipt + customer statement; fix broken customerLedger report | 3 | `phase-4-customer-accounts.md` |
| 5 | Validation & polish | End-to-end smoke, edge cases, permissions audit, regression sweep | 0–4 | `phase-5-validation.md` |

## Known consequence of Phase 0 (owner already signed off)

After Phase 0, the cash drawer / bank no longer drop when a supplier is paid. Daily/shift reports, the treasuries overview, and reconciliation expected-balances will show higher balances / lower outflow **going forward**. Historical `cash_movements`/`bank_movements` with `reference_type='supplier_payment'` are **left untouched** (immutable ledger facts — do not reverse them).
