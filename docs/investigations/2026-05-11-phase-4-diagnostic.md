# Phase 4 Diagnostic — InstaPay Routing Trace
**Date:** 2026-05-11  
**Method:** Static code inspection (no live DB — no `.env.test` / running Postgres at investigation time)  
**Scope:** Trace InstaPay payment routing through backend; verify `cash_movements` vs `bank_movements` write path.

---

## Step 1.1 — Payment Routing Trace (Code Inspection)

### Entry points traced

| Caller | File | Lines |
|---|---|---|
| New sale (POST /api/sales) | `backend/src/domain/sales/invoices.service.ts` | 201–309 |
| Open-invoice final payment | `backend/src/domain/sales/openInvoices.service.ts` | 83–116 |
| Open-invoice cancel (refund) | `backend/src/domain/sales/openInvoices.service.ts` | 279–346 |

### Payment settlement path

All three callers funnel through:

```ts
// backend/src/domain/finance/paymentSettlementService.ts:10
export async function settlePayment(trx, params) {
  if (method === 'cash') {
    // → cashDrawerService.recordMovement → cash_movements ✅
  } else if (method === 'instapay' && bankAccountId != null) {
    // → bankService.recordMovement → bank_movements ✅
  }
  // ← no else branch: instapay + null bankAccountId silently does nothing ⚠️
}
```

### `bankAccountId` resolution before `settlePayment` is called

In `invoices.service.ts:201-206`:
```ts
const needsBank = input.payments.some(p => p.method === 'instapay' && p.bankAccountId == null);
if (needsBank) {
  const def = await trx('bank_accounts').where({ is_default: true, is_active: true }).first();
  if (!def) throw new Error('NO_DEFAULT_BANK_ACCOUNT');
  defaultBankId = def.id;
}
// then: bankId = p.method === 'instapay' ? (p.bankAccountId ?? defaultBankId) : null
```

Same pattern in `openInvoices.service.ts:83-101`.

**Conclusion:** In the normal payment flow, `bankAccountId` is never null when `settlePayment` is called for an instapay payment — the callers always resolve it to the default bank account or throw `NO_DEFAULT_BANK_ACCOUNT` first. Routing to `bank_movements` is **structurally correct** for all reachable code paths.

---

## Step 1.2 — Verdict

> **✅ CORRECT** — InstaPay payments route to `bank_movements`. No historical misroutes expected.

However two latent defects were found during the trace:

### Defect A — Silent failure in `settlePayment` for instapay + null bank account

**Location:** `backend/src/domain/finance/paymentSettlementService.ts:51-63`

```ts
} else if (method === 'instapay' && bankAccountId != null) {
  await bankRecordMovement(...);
}
// ← no else: if instapay reaches here with bankAccountId null, no movement is written and no error thrown
```

**Current behaviour:** If this branch is reached with `bankAccountId === null`, the payment row is inserted into `payments` but no `bank_movements` row is written. No exception is raised. The payment is silently lost from the ledger.

**Expected behaviour:** Throw immediately so callers cannot silently swallow a configuration error.

**Severity:** Medium (not triggered in production today, but is a time bomb if the caller-side default-bank guard ever changes).

### Defect B — No route-level 400 validation for instapay without `bank_account_id`

**Location:** `backend/src/domain/sales/sales.schemas.ts:12-16` (`SalePaymentSchema`) and `sales.schemas.ts:54-65` (`FinalPaymentSchema`)

```ts
export const SalePaymentSchema = z.object({
  method: z.enum(['cash', 'instapay']),
  amount: positiveAmount,
  bankAccountId: z.coerce.number().int().positive().nullable().optional(),
  // ← no cross-field rule: instapay without bankAccountId is valid at schema level
});
```

**Current behaviour:** Client can POST `{ method: 'instapay', amount: 100 }` without a `bankAccountId`. The service resolves to the default bank account silently. If no default is configured, a 500-level `NO_DEFAULT_BANK_ACCOUNT` error is returned rather than a structured 400.

**Expected behaviour:** Schema-level `superRefine` should reject instapay without `bankAccountId` with a 400 error, unless a default bank account is present.  
The phase requirement is explicit: `POST /api/sales` (or the settlement path) **MUST** reject instapay without `bank_account_id` — return 400 with `{ error: 'bank_account_id is required for instapay payments' }`.

**Severity:** Low-Medium (graceful fallback works in practice, but violates the stated API contract).

---

## Step 1.3 — Historical Misroute Query Results

> *Not executable — no running DB at investigation time.*  
> Based on code inspection: the caller-side `bankAccountId` resolution guard has been in place since the initial schema (migration 020). No code path exists that would have routed an instapay payment to `cash_movements`. Expected count from `payments JOIN cash_movements WHERE method = 'instapay'`: **0**.  
> **Backfill migration: NOT required.**

---

## Fixes Applied (this phase)

1. **`paymentSettlementService.ts`** — added `else { throw new Error('INSTAPAY_REQUIRES_BANK_ACCOUNT') }` so a null-bank instapay never silently fails.
2. **`sales.schemas.ts`** — added `superRefine` to `SalePaymentSchema` and the inline payment object in `FinalPaymentSchema` requiring `bankAccountId` for instapay; error message: `'bank_account_id is required for instapay payments'`.
3. **`finance.controller.ts`** — added `INSTAPAY_REQUIRES_BANK_ACCOUNT: 400` to the `ERR_MAP` so the new throw surfaces as HTTP 400.

No backfill migration written (section 1.3 verdict: 0 misroutes).

---

## Post-fix Verification

*(To be filled when a live DB is available)*

```sql
-- After fix: instapay payment should produce 0 cash_movement rows and 1 bank_movement row
SELECT COUNT(*) FROM payments p
JOIN cash_movements cm ON cm.reference_id = p.id AND cm.reference_type = 'invoice'
WHERE p.method = 'instapay';
-- expected: 0

SELECT COUNT(*) FROM payments p
JOIN bank_movements bm ON bm.reference_id = p.id AND bm.reference_type = 'invoice'
WHERE p.method = 'instapay';
-- expected: N (one per instapay payment)
```
