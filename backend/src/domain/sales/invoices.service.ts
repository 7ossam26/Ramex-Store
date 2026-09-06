import type { Knex } from 'knex';
import { db } from '../../db/connection.js';
import { auditFromService } from '../inventory/audit.helper.js';
import { notify } from '../notifications/notificationsService.js';
import { getSetting } from '../settings/settings.service.js';
import { nextInvoiceNo } from './invoiceNumber.service.js';
import { backCalculateDiscount, roundEgp } from './discountCalculator.js';
import { settlePayment } from '../finance/paymentSettlementService.js';
import {
  resolveInvoiceRollQuantity,
  resolveRollSaleQuantity,
  type RollSaleUnit,
} from './lineQuantity.js';
import {
  getReturnedLineIds,
  lockAccessories,
  restoreAccessoryStock,
  splitInvoiceLines,
} from './accessoryStock.js';
import { loadRollLineReturnStates } from './returnLineState.js';
import { SALE_REALIZED_STATUSES } from './sales.types.js';
import type {
  AccessorySaleLine,
  Cheque,
  CreateSaleInput,
  FulfillmentDestination,
  Invoice,
  InvoiceDetail,
  InvoiceLineWithDetail,
  Payment,
  RollSaleLine,
  SalePreview,
} from './sales.types.js';
import type { ListChequesQueryInput, ListInvoicesQueryInput, SalePreviewInput } from './sales.schemas.js';

type SettingsCache = {
  taxEnabled: boolean;
  taxRate: number;
  voidTimeLimitHours: number;
};

async function readSettings(trx?: Knex.Transaction): Promise<SettingsCache> {
  const [taxEnabled, taxRate, voidTimeLimitHours] = await Promise.all([
    getSetting<boolean>(trx, 'tax_enabled', false),
    getSetting<number>(trx, 'tax_rate', 0.14),
    getSetting<number>(trx, 'void_time_limit_hours', 24),
  ]);
  return { taxEnabled, taxRate, voidTimeLimitHours };
}

type LockedRoll = {
  id: number;
  selling_price_egp: string | null;
  reference_price_per_unit: string | null;
  weight_kg: string | null;
  length_m: string | null;
  fabric_unit: 'kg' | 'meter';
  status: string;
  warehouse: string;
  is_visible_at_pos: boolean;
};

async function lockAndValidateRolls(
  trx: Knex.Transaction,
  rollIds: number[],
  destination: FulfillmentDestination,
): Promise<Map<number, LockedRoll>> {
  // SELECT FOR UPDATE to prevent two POS sessions selling the same roll.
  const rolls = await trx('rolls as r')
    .join('fabrics as f', 'r.fabric_id', 'f.id')
    .whereIn('r.id', rollIds)
    .select(
      'r.id',
      'r.selling_price_egp',
      'r.reference_price_per_unit',
      'r.weight_kg',
      'r.length_m',
      'r.status',
      'r.warehouse',
      'r.is_visible_at_pos',
      'f.unit as fabric_unit',
    )
    .forUpdate();

  const byId = new Map<number, LockedRoll>(rolls.map((r) => [r.id, r as LockedRoll]));
  for (const id of rollIds) {
    const roll = byId.get(id);
    if (!roll) throw new Error('ROLL_NOT_FOUND');
    if (roll.status !== 'in_stock') throw new Error('ROLL_NOT_AVAILABLE');
    if (!roll.is_visible_at_pos) throw new Error('ROLL_NOT_VISIBLE_AT_POS');
    if (destination === 'factory_direct') {
      if (roll.warehouse !== 'factory') throw new Error('ROLL_NOT_AT_FACTORY');
    } else {
      if (roll.warehouse !== 'shop' && roll.warehouse !== 'damaged_shop') {
        throw new Error('ROLL_NOT_AT_SHOP');
      }
    }
  }
  return byId;
}

type ComputedTotals = {
  lines: Array<{
    rollId: number;
    selling_price_egp: number;
    final_price_per_unit: number;
    sold_quantity: number;
    sold_unit: RollSaleUnit;
    line_discount_egp: number;
    line_total_egp: number;
  }>;
  subtotal: number;
  cartDiscount: number;
  effectivePercent: number;
  tax: number;
  rounding: number;
  total: number;
};

type RollPricingInfo = {
  weight_kg: string | null;
  length_m: string | null;
  fabric_unit: 'kg' | 'meter';
  selling_price_egp: string | null;
};

function computeTotals(
  inputLines: RollSaleLine[],
  rollInfo: Map<number, RollPricingInfo>,
  cartTargetFinal: number | null | undefined,
  taxEnabled: boolean,
  taxRate: number,
): ComputedTotals {
  const lines = inputLines.map((l) => {
    const info = rollInfo.get(l.rollId);
    if (!info) throw new Error('ROLL_NOT_FOUND');
    const saleQuantity = resolveRollSaleQuantity(info);
    const qty = saleQuantity.quantity;

    // Resolve the per-unit price. Cashier may submit either:
    //   - finalPricePerUnit (preferred — v2 Phase 5 UX)
    //   - sellingPriceOverride (per-roll absolute, kept for legacy callers)
    //   - neither (legacy fallback to the roll's existing selling_price_egp)
    let perUnit: number;
    let absolutePrice: number;
    if (l.finalPricePerUnit != null) {
      perUnit = Number(l.finalPricePerUnit);
      absolutePrice = perUnit * qty;
    } else if (l.sellingPriceOverride != null) {
      absolutePrice = Number(l.sellingPriceOverride);
      perUnit = qty > 0 ? absolutePrice / qty : 0;
    } else {
      const existing = info.selling_price_egp;
      if (existing == null) throw new Error('LINE_PRICE_REQUIRED');
      absolutePrice = Number(existing);
      perUnit = qty > 0 ? absolutePrice / qty : 0;
    }

    if (!Number.isFinite(absolutePrice) || absolutePrice <= 0) {
      throw new Error('LINE_PRICE_REQUIRED');
    }

    const lineDiscount = roundEgp(Number(l.lineDiscountEgp ?? 0));
    if (lineDiscount > absolutePrice) {
      throw new Error('LINE_DISCOUNT_EXCEEDS_PRICE');
    }
    const lineTotal = roundEgp(absolutePrice - lineDiscount);
    return {
      rollId: l.rollId,
      selling_price_egp: roundEgp(absolutePrice),
      final_price_per_unit: roundEgp(perUnit),
      sold_quantity: qty,
      sold_unit: saleQuantity.unit,
      line_discount_egp: lineDiscount,
      line_total_egp: lineTotal,
    };
  });

  const subtotal = roundEgp(lines.reduce((s, l) => s + l.line_total_egp, 0));

  let cartDiscount = 0;
  let effectivePercent = 0;
  let beforeTax = subtotal;
  if (cartTargetFinal != null) {
    const c = backCalculateDiscount(subtotal, Number(cartTargetFinal));
    cartDiscount = c.cart_discount_egp;
    effectivePercent = c.effective_percent;
    beforeTax = roundEgp(subtotal - cartDiscount);
  }

  const tax = taxEnabled ? roundEgp(beforeTax * taxRate) : 0;
  const rawTotal = beforeTax + tax;
  const total = roundEgp(rawTotal);
  const rounding = roundEgp(total - rawTotal);

  return {
    lines,
    subtotal,
    cartDiscount,
    effectivePercent,
    tax,
    rounding,
    total,
  };
}

export async function previewSale(input: SalePreviewInput): Promise<SalePreview> {
  const settings = await readSettings();
  const rollIds = input.lines.map((l) => (l as { rollId: number }).rollId);
  const rolls = await db('rolls as r')
    .join('fabrics as f', 'r.fabric_id', 'f.id')
    .whereIn('r.id', rollIds)
    .select(
      'r.id',
      'r.selling_price_egp',
      'r.weight_kg',
      'r.length_m',
      'f.unit as fabric_unit',
    );
  const rollInfo = new Map<number, RollPricingInfo>(
    rolls.map((r) => [
      r.id as number,
      {
        weight_kg: r.weight_kg == null ? null : String(r.weight_kg),
        length_m: r.length_m == null ? null : String(r.length_m),
        fabric_unit: r.fabric_unit as 'kg' | 'meter',
        selling_price_egp: r.selling_price_egp == null ? null : String(r.selling_price_egp),
      },
    ]),
  );
  for (const id of rollIds) {
    if (!rollInfo.has(id)) throw new Error('ROLL_NOT_FOUND');
  }
  const t = computeTotals(
    input.lines as RollSaleLine[],
    rollInfo,
    input.cartTargetFinal,
    settings.taxEnabled,
    settings.taxRate,
  );
  return {
    subtotal_egp: t.subtotal,
    cart_discount_egp: t.cartDiscount,
    effective_discount_percent: t.effectivePercent,
    tax_egp: t.tax,
    rounding_egp: t.rounding,
    total_egp: t.total,
    tax_enabled: settings.taxEnabled,
  };
}

export async function createSale(
  cashierUserId: number,
  input: CreateSaleInput,
  shiftId: number | null = null,
): Promise<Invoice> {
  return db.transaction(async (trx) => {
    const settings = await readSettings(trx);

    // 1) Customer must exist (no walk-in fallback).
    const customer = await trx('customers').where({ id: input.customerId }).forUpdate().first();
    if (!customer) throw new Error('CUSTOMER_NOT_FOUND');

    // 2) Split lines into roll lines and accessory lines, then lock + validate rolls.
    const rollLines = input.lines.filter(
      (l): l is RollSaleLine => l.type !== 'accessory',
    );
    const accessoryLines = input.lines.filter(
      (l): l is AccessorySaleLine => l.type === 'accessory',
    );

    const rollIds = rollLines.map((l) => l.rollId);
    if (new Set(rollIds).size !== rollIds.length) throw new Error('DUPLICATE_ROLL_IN_CART');
    const destination: FulfillmentDestination = input.fulfillmentDestination ?? 'shop';
    const locked =
      rollIds.length > 0
        ? await lockAndValidateRolls(trx, rollIds, destination)
        : new Map<number, LockedRoll>();
    const rollInfo = new Map<number, RollPricingInfo>();
    for (const [id, r] of locked) {
      rollInfo.set(id, {
        weight_kg: r.weight_kg,
        length_m: r.length_m,
        fabric_unit: r.fabric_unit,
        selling_price_egp: r.selling_price_egp,
      });
    }

    // 2b) Lock + validate accessories.
    type LockedAccessory = { id: number; qty_in_stock: number; name_ar: string };
    const accessoryIdList = accessoryLines.map((l) => l.accessoryId);
    const lockedAccessories =
      accessoryIdList.length > 0
        ? await (trx('accessories').whereIn('id', accessoryIdList).select('id', 'qty_in_stock', 'name_ar').forUpdate() as unknown as Promise<LockedAccessory[]>)
        : [];
    const accessoryMap = new Map<number, LockedAccessory>(
      lockedAccessories.map((a) => [a.id, a]),
    );
    for (const line of accessoryLines) {
      const acc = accessoryMap.get(line.accessoryId);
      if (!acc) throw new Error('ACCESSORY_NOT_FOUND');
      if (acc.qty_in_stock < line.qtyPieces) throw new Error('ACCESSORY_QTY_INSUFFICIENT');
    }

    // 3) Compute totals.
    // v2 Phase 5 — `lines` may be empty when creating a no-lines deposit
    // invoice. In that case the deposit becomes the placeholder total_egp
    // and balance_egp = 0; lines (and their totals) get attached later via
    // the addLinesToOpenInvoice flow.
    const isNoLinesDeposit = input.lines.length === 0;

    // Compute accessory line totals
    const accessoryComputedLines = accessoryLines.map((l) => {
      const lineAbsolute = roundEgp(Number(l.finalPricePerPiece) * l.qtyPieces);
      const lineDiscount = roundEgp(Math.min(Number(l.lineDiscountEgp ?? 0), lineAbsolute));
      const lineTotal = roundEgp(lineAbsolute - lineDiscount);
      return {
        accessoryId: l.accessoryId,
        qtyPieces: l.qtyPieces,
        final_price_per_piece: roundEgp(Number(l.finalPricePerPiece)),
        selling_price_egp: roundEgp(lineAbsolute),
        line_discount_egp: lineDiscount,
        line_total_egp: lineTotal,
      };
    });
    const accessorySubtotal = roundEgp(
      accessoryComputedLines.reduce((s, l) => s + l.line_total_egp, 0),
    );

    const totals = isNoLinesDeposit
      ? {
          lines: [],
          subtotal: 0,
          cartDiscount: 0,
          effectivePercent: 0,
          tax: 0,
          rounding: 0,
          total: 0,
        }
      : (() => {
          const t = computeTotals(
            rollLines,
            rollInfo,
            input.cartTargetFinal,
            settings.taxEnabled,
            settings.taxRate,
          );
          // Accessories are pre-priced (no per-kg math); add to subtotal/total after tax calc.
          const combinedSubtotal = roundEgp(t.subtotal + accessorySubtotal);
          const combinedTotal = roundEgp(t.total + accessorySubtotal);
          return {
            ...t,
            subtotal: combinedSubtotal,
            total: combinedTotal,
          };
        })();

    // 4) Validate payment(s) and optional payment-time discount.
    const paidTotal = roundEgp(input.payments.reduce((s, p) => s + Number(p.amount), 0));
    const discountEgp = roundEgp(Number(input.discountEgp) || 0);
    if (discountEgp < 0) throw new Error('INVALID_DISCOUNT');

    if (isNoLinesDeposit) {
      // For no-lines deposits the deposit acts as the placeholder total. The
      // running total_egp will be replaced with sum(lines) once lines are
      // added via addLinesToOpenInvoice. A zero deposit is allowed — the
      // invoice opens as an empty shell (total/balance = 0) awaiting lines.
      // There's no stable total to discount against yet, and this shell flow
      // is unrelated to the POS payment dialog (cart is always non-empty
      // there), so a discount is simply rejected.
      if (discountEgp > 0) throw new Error('INVALID_DISCOUNT');
      if (paidTotal > 0) {
        totals.total = paidTotal;
        totals.subtotal = paidTotal;
      }
    } else if (discountEgp > 0) {
      // Payment-time discount — same shape as addFinalPayment's balance/
      // discount check, with totals.total standing in for balance (no
      // invoice/balance exists yet at creation time).
      if (discountEgp > totals.total + 0.001) throw new Error('DISCOUNT_EXCEEDS_TOTAL');
      const required = roundEgp(totals.total - discountEgp);
      if (paidTotal + 0.001 < required) throw new Error('DISCOUNT_PAYMENT_BELOW_REQUIRED');
      if (paidTotal > required + 0.001) throw new Error('OVERPAYMENT_NOT_ALLOWED');
    } else {
      if (paidTotal > totals.total) throw new Error('OVERPAYMENT_NOT_ALLOWED');
    }

    // Snapshot the pre-discount total for the customer-ledger "sale" entry
    // and lifetime-volume bump below (step 12) — mirrors addFinalPayment,
    // where those two numbers are fixed at the invoice's original creation
    // and never shrink retroactively when a discount is waived later at
    // settlement time. Keeping the same convention here means the same
    // discount concept behaves identically regardless of when it's applied.
    const grossTotal = totals.total;
    if (discountEgp > 0) {
      totals.total = roundEgp(totals.total - discountEgp); // stored total_egp becomes net, like addFinalPayment's `newTotal`
    }

    const isFullyPaid = !isNoLinesDeposit && paidTotal >= totals.total - 0.001;
    // Minimum-deposit enforcement removed (2026-07): any deposit amount is
    // accepted when opening an invoice. `min_deposit_pct` remains in Settings
    // as an advisory reference only and no longer blocks submission.

    // 5) Resolve default bank account for instapay/bank_transfer payments without one.
    let defaultBankId: number | null = null;
    const needsBank = input.payments.some(
      (p) =>
        (p.method === 'instapay' || p.method === 'bank_transfer') &&
        p.bankAccountId == null,
    );
    if (needsBank) {
      const def = await trx('bank_accounts')
        .where({ is_default: true, is_active: true })
        .first();
      if (!def) throw new Error('NO_DEFAULT_BANK_ACCOUNT');
      defaultBankId = def.id as number;
    }

    // 6) Allocate invoice number.
    const year = new Date().getFullYear();
    const invoice_no = await nextInvoiceNo(trx, year);

    // 7) Insert invoice header.
    const status = isFullyPaid ? 'completed' : 'open';
    const balance = roundEgp(totals.total - paidTotal);
    const [{ id: invoiceId }] = await trx('invoices').insert({
      invoice_no,
      customer_id: input.customerId,
      cashier_user_id: cashierUserId,
      status,
      fulfillment_destination: destination,
      subtotal_egp: totals.subtotal,
      cart_discount_egp: totals.cartDiscount,
      final_discount_egp: discountEgp,
      tax_egp: totals.tax,
      rounding_egp: totals.rounding,
      total_egp: totals.total,
      paid_egp: paidTotal,
      balance_egp: balance,
      notes_ar: input.notesAr ?? null,
      closed_at: isFullyPaid ? trx.fn.now() : null,
      shift_id: shiftId,
    }).returning('id');
    const invoice = await trx('invoices').where({ id: invoiceId }).first();

    // 8) Insert invoice lines (no-op for no-lines deposit).
    if (totals.lines.length > 0) {
      await trx('invoice_lines').insert(
        totals.lines.map((l) => ({
          invoice_id: invoice.id,
          item_type: 'roll',
          roll_id: l.rollId,
          selling_price_egp: l.selling_price_egp,
          final_price_per_unit: l.final_price_per_unit,
          sold_quantity: l.sold_quantity,
          sold_unit: l.sold_unit,
          line_discount_egp: l.line_discount_egp,
          line_total_egp: l.line_total_egp,
        })),
      );
    }

    // 8b) Insert accessory invoice lines.
    if (accessoryComputedLines.length > 0) {
      await trx('invoice_lines').insert(
        accessoryComputedLines.map((l) => ({
          invoice_id: invoice.id,
          item_type: 'accessory',
          roll_id: null,
          accessory_id: l.accessoryId,
          qty_pieces: l.qtyPieces,
          selling_price_egp: l.selling_price_egp,
          final_price_per_unit: l.final_price_per_piece,
          line_discount_egp: l.line_discount_egp,
          line_total_egp: l.line_total_egp,
        })),
      );
    }

    // 9) Flip roll status & emit stock movements (no-op for no-lines deposit).
    const newRollStatus: 'sold' | 'reserved' = isFullyPaid ? 'sold' : 'reserved';
    const eventType: 'sale_out' | 'reserve' = isFullyPaid ? 'sale_out' : 'reserve';
    for (const line of totals.lines) {
      const update: Record<string, unknown> = {
        status: newRollStatus,
        updated_at: trx.fn.now(),
      };
      // v2 Phase 5 — persist the resolved per-roll final price onto the roll
      // itself so reports can compare against reference_price_per_unit.
      update.selling_price_egp = line.selling_price_egp;
      await trx('rolls').where({ id: line.rollId }).update(update);
      await trx('stock_movements').insert({
        roll_id: line.rollId,
        from_warehouse: locked.get(line.rollId)!.warehouse,
        to_warehouse: null,
        event_type: eventType,
        reference_type: 'invoice',
        reference_id: invoice.id,
        actor_user_id: cashierUserId,
      });
    }

    // 9b) Deduct accessory quantities.
    for (const line of accessoryComputedLines) {
      await trx('accessories')
        .where({ id: line.accessoryId })
        .update({ qty_in_stock: trx.raw('qty_in_stock - ?', [line.qtyPieces]), updated_at: trx.fn.now() });
      await auditFromService(trx, {
        actorUserId: cashierUserId,
        action: 'sell_accessory',
        entity: 'accessory',
        entityId: line.accessoryId,
        before: { qty_in_stock: accessoryMap.get(line.accessoryId)!.qty_in_stock },
        after: { qty_in_stock: accessoryMap.get(line.accessoryId)!.qty_in_stock - line.qtyPieces, invoice_id: invoice.id },
        severity: 'medium',
      });
    }

    // 10) Audit per-line price overrides — capture reference vs final so
    // margin reports can reconstruct cashier behaviour later.
    for (let i = 0; i < rollLines.length; i++) {
      const inp = rollLines[i]!;
      const computed = totals.lines[i]!;
      const lockedRoll = locked.get(inp.rollId)!;
      const referencePerUnit =
        lockedRoll.reference_price_per_unit == null
          ? null
          : Number(lockedRoll.reference_price_per_unit);
      const hasOverride = inp.finalPricePerUnit != null || inp.sellingPriceOverride != null;
      if (hasOverride) {
        await auditFromService(trx, {
          actorUserId: cashierUserId,
          action: 'pos_price_override',
          entity: 'roll',
          entityId: inp.rollId,
          before: { reference_price_per_unit: referencePerUnit },
          after: {
            final_price_per_unit: computed.final_price_per_unit,
            line_total_egp: computed.line_total_egp,
            invoice_id: invoice.id,
          },
          severity: 'medium',
        });
      }
    }

    // 11) Insert payments + customer ledger entries.
    let runningPaid = 0;
    for (const p of input.payments) {
      const bankId =
        p.method === 'instapay' || p.method === 'bank_transfer'
          ? (p.bankAccountId ?? defaultBankId)
          : null;
      const kind: 'deposit' | 'final' = isFullyPaid ? 'final' : 'deposit';
      const amount = roundEgp(Number(p.amount));
      const [{ id: paymentId }] = await trx('payments').insert({
        invoice_id: invoice.id,
        method: p.method,
        amount_egp: amount,
        payment_kind: kind,
        bank_account_id: bankId,
        reference: p.reference ?? null,
        actor_user_id: cashierUserId,
      }).returning('id');

      if (p.method === 'cheque' && p.chequeDetails) {
        await trx('cheques').insert({
          payment_id: paymentId,
          cheque_number: p.chequeDetails.chequeNumber,
          bank_name_ar: p.chequeDetails.bankNameAr,
          branch_ar: p.chequeDetails.branchAr ?? null,
          issuer_name_ar: p.chequeDetails.issuerNameAr ?? null,
          amount_egp: amount,
          issue_date: p.chequeDetails.issueDate,
          due_date: p.chequeDetails.dueDate,
          notes_ar: p.chequeDetails.notesAr ?? null,
        });
      }

      await settlePayment(trx, {
        method: p.method,
        paymentKind: kind,
        amount,
        bankAccountId: bankId,
        referenceType: 'invoice',
        referenceId: invoice.id,
        actorUserId: cashierUserId,
      });

      // Customer ledger entry per payment (positive = credit on the books).
      runningPaid = roundEgp(runningPaid + amount);
      const newBalance = roundEgp(Number(customer.current_balance_egp) + amount);
      await trx('customer_ledger_entries').insert({
        customer_id: input.customerId,
        entry_type: kind === 'deposit' ? 'deposit' : 'payment',
        reference_type: 'invoice',
        reference_id: invoice.id,
        amount_egp: amount,
        balance_after_egp: newBalance,
        actor_user_id: cashierUserId,
      });
      await trx('customers')
        .where({ id: input.customerId })
        .update({
          current_balance_egp: newBalance,
          updated_at: trx.fn.now(),
        });
      // refresh local snapshot for next iteration
      customer.current_balance_egp = newBalance.toString();
    }

    // 11b) Payment-time discount — post as a balance-neutral ledger
    // adjustment, same as addFinalPayment does for a discount waived at
    // settlement (openInvoices.service.ts).
    if (discountEgp > 0) {
      const newBalanceForDiscount = roundEgp(Number(customer.current_balance_egp) + discountEgp);
      await trx('customer_ledger_entries').insert({
        customer_id: input.customerId,
        entry_type: 'adjustment',
        reference_type: 'invoice',
        reference_id: invoice.id,
        amount_egp: discountEgp,
        balance_after_egp: newBalanceForDiscount,
        notes_ar: `خصم عند إتمام فاتورة ${invoice_no}`,
        actor_user_id: cashierUserId,
      });
      await trx('customers')
        .where({ id: input.customerId })
        .update({ current_balance_egp: newBalanceForDiscount, updated_at: trx.fn.now() });
      customer.current_balance_egp = newBalanceForDiscount.toString();
    }

    // 12) Lifetime volume bump (sale entry — not changing balance, only volume).
    const newLifetime = roundEgp(Number(customer.lifetime_volume_egp) + grossTotal);
    const newBalanceForSale = roundEgp(Number(customer.current_balance_egp) - grossTotal);
    await trx('customer_ledger_entries').insert({
      customer_id: input.customerId,
      entry_type: 'sale',
      reference_type: 'invoice',
      reference_id: invoice.id,
      amount_egp: -grossTotal,
      balance_after_egp: newBalanceForSale,
      actor_user_id: cashierUserId,
    });
    await trx('customers')
      .where({ id: input.customerId })
      .update({
        current_balance_egp: newBalanceForSale,
        lifetime_volume_egp: newLifetime,
        updated_at: trx.fn.now(),
      });

    // 13) Audit & notify.
    await auditFromService(trx, {
      actorUserId: cashierUserId,
      action: 'invoice_created',
      entity: 'invoice',
      entityId: invoice.id,
      after: {
        invoice_no,
        status,
        fulfillment_destination: destination,
        total_egp: totals.total,
        paid_egp: paidTotal,
        final_discount_egp: discountEgp,
        line_count: totals.lines.length,
        customer_id: input.customerId,
      },
      severity: 'medium',
    });

    return invoice as Invoice;
  });
}

export async function voidInvoice(
  invoiceId: number,
  actorUserId: number,
  actorRole: string,
  reasonAr: string,
  approvedByOwner: boolean,
  shiftId: number | null = null,
): Promise<{ requires_approval: true } | { invoice: Invoice }> {
  return db.transaction(async (trx) => {
    const settings = await readSettings(trx);
    const invoice = await trx('invoices').where({ id: invoiceId }).forUpdate().first();
    if (!invoice) throw new Error('INVOICE_NOT_FOUND');
    if (
      invoice.status !== 'completed' &&
      invoice.status !== 'closed_pending_pickup' &&
      invoice.status !== 'partially_returned'
    ) {
      throw new Error('INVOICE_NOT_VOIDABLE');
    }

    // Time-limit check.
    const created = new Date(invoice.created_at).getTime();
    const ageHours = (Date.now() - created) / 3_600_000;
    if (ageHours > settings.voidTimeLimitHours) {
      throw new Error('VOID_TIME_LIMIT_EXCEEDED');
    }

    // Approval gate: only Owner can self-approve.
    if (actorRole !== 'owner' && !approvedByOwner) {
      await notify({
        recipientRole: 'owner',
        severity: 'high',
        eventType: 'void_requested',
        titleAr: 'طلب موافقة — إلغاء فاتورة',
        bodyAr: `طلب إلغاء فاتورة رقم ${invoice.invoice_no}`,
        isBlocking: true,
        blockedActionPayload: {
          actionType: 'void_invoice',
          invoiceId,
          reasonAr,
          requestedByUserId: actorUserId,
        },
        payload: { invoice_id: invoiceId, invoice_no: invoice.invoice_no, reason_ar: reasonAr },
      });
      await auditFromService(trx, {
        actorUserId,
        action: 'invoice_void_requested',
        entity: 'invoice',
        entityId: invoiceId,
        after: { reason_ar: reasonAr },
        severity: 'medium',
      });
      return { requires_approval: true };
    }

    // Roll back stock. The lines must be split by item_type first: accessory
    // lines carry roll_id = NULL (migration 082) and
    // chk_stock_movements_entity_type (migration 093) rejects a movement with
    // entity_type='roll' and a NULL roll_id.
    const lines = await trx('invoice_lines')
      .where({ invoice_id: invoiceId })
      .orderBy('id', 'asc')
      .select('id', 'item_type', 'roll_id', 'accessory_id', 'qty_pieces', 'sold_quantity', 'sold_unit');
    const { rollIds, accessoryLines } = splitInvoiceLines(lines);

    // A completed/partially-returned invoice may already carry return(s)
    // against some lines — processReturn only blocks re-returning a line once
    // it's *fully* returned. A fully-returned line already had its stock
    // settled (back_to_stock credited it; `damaged` deliberately did not), so
    // restoring it again here would double-count. A *partially* returned line
    // is topped up to its full original quantity instead of being skipped —
    // voiding the whole invoice means all of it comes back — unless any of
    // its partial returns were disposed as `damaged` (written off stock must
    // not be resurrected as sellable).
    const returnedAccessoryLineIds = await getReturnedLineIds(
      trx,
      accessoryLines.map((l) => l.lineId),
    );
    const rollReturnStates = await loadRollLineReturnStates(trx, lines);

    await lockAccessories(trx, accessoryLines);

    for (const rollId of rollIds) {
      const line = lines.find((l) => l.item_type !== 'accessory' && Number(l.roll_id) === rollId);
      const state = line ? rollReturnStates.get(Number(line.id)) : undefined;

      if (state) {
        const fullyReturned = state.alreadyReturnedQuantity === Number.POSITIVE_INFINITY || state.remaining <= 0;
        if (fullyReturned) continue;
        if (state.alreadyReturnedQuantity > 0 && state.hasDamagedDisposition) continue;
      }

      const rollUpdate: Record<string, unknown> = { status: 'in_stock', updated_at: trx.fn.now() };
      if (state && state.alreadyReturnedQuantity > 0) {
        // Partially returned already (back_to_stock only, per the guard
        // above) — top the roll back up to its full sold quantity.
        if (state.soldUnit === 'meter') rollUpdate.length_m = state.soldQuantity;
        else rollUpdate.weight_kg = state.soldQuantity;
      }
      await trx('rolls').where({ id: rollId }).update(rollUpdate);
      await trx('stock_movements').insert({
        roll_id: rollId,
        from_warehouse: null,
        to_warehouse: null,
        event_type: 'return_in',
        reference_type: 'invoice',
        reference_id: invoiceId,
        actor_user_id: actorUserId,
        notes_ar: `إلغاء فاتورة: ${reasonAr}`,
      });
    }

    await restoreAccessoryStock(
      trx,
      accessoryLines.filter((l) => !returnedAccessoryLineIds.has(l.lineId)),
      actorUserId,
      {
        action: 'void_restore_accessory',
        invoiceId,
        severity: 'high',
        extra: { reason_ar: reasonAr },
      },
    );

    // Reverse payments — record refund rows; settle against cash drawer / bank.
    //
    // If this invoice was already partially returned before being voided, a
    // slice of `paid` was already handed back in cash by that return (and its
    // own refund row already exists) — reversing the full original payments
    // again here would refund that slice twice. Scale each reversed payment
    // down proportionally so the total cash reversed equals what's actually
    // still owed back to the customer (`paid - returned_amount_egp`). This is
    // a no-op for the overwhelmingly common case of voiding a plain completed
    // invoice, where returned_amount_egp is 0.
    const paid = Number(invoice.paid_egp);
    const alreadyRefunded = Number(invoice.returned_amount_egp);
    const toReverse = Math.max(0, roundEgp(paid - alreadyRefunded));
    const payments = await trx('payments').where({ invoice_id: invoiceId, payment_kind: 'final' }).orWhere({ invoice_id: invoiceId, payment_kind: 'deposit' });
    const paymentsTotal = roundEgp(payments.reduce((s, p) => s + Number(p.amount_egp), 0));
    for (const p of payments) {
      const originalAmount = Number(p.amount_egp);
      const refundAmount =
        paymentsTotal > 0 ? roundEgp((originalAmount / paymentsTotal) * toReverse) : 0;
      if (refundAmount <= 0) continue;
      await trx('payments').insert({
        invoice_id: invoiceId,
        method: p.method,
        amount_egp: -refundAmount,
        payment_kind: 'refund',
        bank_account_id: p.bank_account_id,
        notes_ar: `استرجاع: ${reasonAr}`,
        actor_user_id: actorUserId,
      });
      await settlePayment(trx, {
        method: p.method as 'cash' | 'instapay',
        paymentKind: 'refund',
        amount: refundAmount,
        bankAccountId: p.bank_account_id as number | null,
        referenceType: 'invoice',
        referenceId: invoiceId,
        actorUserId,
        notesAr: `استرجاع: ${reasonAr}`,
      });
    }

    // Reverse customer ledger. The balance reversal (`total - paid`) is
    // unaffected by any prior partial return — a return's own posting nets to
    // zero on balance (see processReturn) — but lifetime_volume was already
    // decremented by `alreadyRefunded` there, so only the remaining slice is
    // backed out here to avoid double-counting it.
    const customer = await trx('customers').where({ id: invoice.customer_id }).forUpdate().first();
    const newBalance = roundEgp(Number(customer.current_balance_egp) + Number(invoice.total_egp) - paid);
    const newLifetime = roundEgp(
      Number(customer.lifetime_volume_egp) - (Number(invoice.total_egp) - alreadyRefunded),
    );
    await trx('customer_ledger_entries').insert({
      customer_id: invoice.customer_id,
      entry_type: 'refund',
      reference_type: 'invoice',
      reference_id: invoiceId,
      amount_egp: Number(invoice.total_egp) - paid,
      balance_after_egp: newBalance,
      notes_ar: `إلغاء فاتورة ${invoice.invoice_no}: ${reasonAr}`,
      actor_user_id: actorUserId,
    });
    await trx('customers')
      .where({ id: invoice.customer_id })
      .update({
        current_balance_egp: newBalance,
        lifetime_volume_egp: newLifetime,
        updated_at: trx.fn.now(),
      });

    // Update invoice header.
    await trx('invoices').where({ id: invoiceId }).update({
      status: 'cancelled',
      cancelled_at: trx.fn.now(),
      cancelled_reason_ar: reasonAr,
      ...(shiftId != null ? { shift_id: shiftId } : {}),
    });
    const updated = await trx('invoices').where({ id: invoiceId }).first();

    await auditFromService(trx, {
      actorUserId,
      action: 'invoice_voided',
      entity: 'invoice',
      entityId: invoiceId,
      before: { status: invoice.status, paid_egp: paid },
      after: { status: 'cancelled', reason_ar: reasonAr },
      severity: 'high',
    });

    return { invoice: updated as Invoice };
  });
}

// Called by approvalDispatcher when Owner approves a void_invoice notification.
// Skips the role/approval gate — owner approval is already confirmed by the notification resolution.
export async function completeVoid(
  invoiceId: number,
  ownerUserId: number,
  reasonAr: string,
): Promise<{ invoice: Invoice }> {
  const result = await voidInvoice(invoiceId, ownerUserId, 'owner', reasonAr, true);
  if ('requires_approval' in result) {
    throw new Error('VOID_APPROVAL_UNEXPECTED');
  }
  return result;
}

export async function getInvoiceDetail(id: number): Promise<InvoiceDetail | undefined> {
  const invoice = await db('invoices as i')
    .where('i.id', id)
    .leftJoin('customers as c', 'i.customer_id', 'c.id')
    .leftJoin('users as u', 'i.cashier_user_id', 'u.id')
    .select(
      'i.*',
      'c.name_ar as customer_name_ar',
      'c.phone as customer_phone',
      'c.customer_code',
      'c.address_ar as customer_address_ar',
      'u.username as cashier_username',
    )
    .first();
  if (!invoice) return undefined;

  const rawLines = (await db('invoice_lines as il')
    .where('il.invoice_id', id)
    .leftJoin('rolls as r', 'il.roll_id', 'r.id')
    .leftJoin('fabrics as f', 'r.fabric_id', 'f.id')
    .leftJoin('colors as col', 'r.color_id', 'col.id')
    .leftJoin('accessories as a', 'il.accessory_id', 'a.id')
    .select(
      'il.*',
      'f.name_ar as fabric_name_ar',
      'f.unit as fabric_unit',
      'col.name_ar as color_name_ar',
      'col.code as color_code',
      'r.roll_sr_no',
      'r.weight_kg',
      'r.length_m',
      'r.reference_price_per_unit',
      'a.name_ar as accessory_name_ar',
      db.raw('COALESCE(r.internal_barcode, a.internal_barcode) as internal_barcode'),
    )
    .orderBy('il.id', 'asc')) as InvoiceLineWithDetail[];

  // Return state per line — lets the frontend show remaining returnable
  // quantity and disable a fully-returned line in the return dialog.
  const rollReturnStates = await loadRollLineReturnStates(db, rawLines);
  const accessoryLineIds = rawLines
    .filter((l) => l.item_type === 'accessory')
    .map((l) => Number(l.id));
  const returnedAccessoryLineIds =
    accessoryLineIds.length > 0
      ? new Set(
          (
            await db('return_lines')
              .whereIn('original_invoice_line_id', accessoryLineIds)
              .select('original_invoice_line_id')
          ).map((r) => Number(r.original_invoice_line_id)),
        )
      : new Set<number>();

  const lines = rawLines.map((line) => {
    if (line.item_type === 'accessory') {
      return {
        ...line,
        returned_quantity: null,
        remaining_returnable_quantity: null,
        is_returned: returnedAccessoryLineIds.has(Number(line.id)),
      };
    }

    const saleQuantity = resolveInvoiceRollQuantity({
      sold_quantity: line.sold_quantity,
      sold_unit: line.sold_unit,
      fabric_unit: line.fabric_unit ?? 'kg',
      length_m: line.length_m,
      weight_kg: line.weight_kg,
    });
    const state = rollReturnStates.get(Number(line.id));
    const returnedQuantity =
      state == null
        ? 0
        : state.alreadyReturnedQuantity === Number.POSITIVE_INFINITY
          ? saleQuantity.quantity
          : state.alreadyReturnedQuantity;
    const remaining = state?.remaining ?? saleQuantity.quantity;
    return {
      ...line,
      sold_quantity: saleQuantity.quantity.toFixed(3),
      sold_unit: saleQuantity.unit,
      returned_quantity: returnedQuantity,
      remaining_returnable_quantity: remaining,
      is_returned: remaining <= 0,
    };
  });

  const payments = (await db('payments')
    .where({ invoice_id: id })
    .orderBy('created_at', 'asc')) as Payment[];

  return { ...invoice, lines, payments } as InvoiceDetail;
}

export async function listInvoices(
  q: ListInvoicesQueryInput,
): Promise<{ rows: Array<Invoice & { customer_name_ar: string }>; total: number }> {
  const offset = (q.page - 1) * q.limit;
  const base = db('invoices as i')
    .leftJoin('customers as c', 'i.customer_id', 'c.id')
    .select('i.*', 'c.name_ar as customer_name_ar');

  if (q.status) base.where('i.status', q.status);
  if (q.customer_id) base.where('i.customer_id', q.customer_id);
  if (q.fulfillment_destination) {
    base.where('i.fulfillment_destination', q.fulfillment_destination);
  }
  if (q.date_from) base.where('i.created_at', '>=', q.date_from);
  if (q.date_to) base.where('i.created_at', '<=', q.date_to);
  // Fabric/colour filters: match invoices that have at least one roll line
  // for the given fabric AND/OR colour (both conditions on the SAME line
  // when both are given — "this fabric in this colour was sold on this
  // invoice"). whereExists (not a join) so an invoice with several lines
  // never produces duplicate rows — a join here would corrupt both the
  // returned page and the count below.
  if (q.fabric_id || q.color_id) {
    const fabricId = q.fabric_id;
    const colorId = q.color_id;
    base.whereExists(function () {
      this.select('*')
        .from('invoice_lines as il')
        .join('rolls as r', 'il.roll_id', 'r.id')
        .whereRaw('il.invoice_id = i.id')
        .modify((qb) => {
          if (fabricId) qb.andWhere('r.fabric_id', fabricId);
          if (colorId) qb.andWhere('r.color_id', colorId);
        });
    });
  }
  if (q.search) {
    // Grouped so the OR cannot escape the AND-chain above — an ungrouped
    // orWhere would leak non-cancelled invoices into a search run from the
    // «ملغية» tab. Note ILIKE does no Arabic folding, unlike the client-side
    // search on lists that filter in the browser.
    const term = `%${q.search}%`;
    base.where((b) => {
      b.whereILike('i.invoice_no', term).orWhereILike('c.name_ar', term);
    });
  }

  const [countRow] = await base.clone().clearSelect().count<Array<{ count: string }>>('i.id as count');
  const rows = await base.orderBy('i.created_at', 'desc').limit(q.limit).offset(offset);
  return {
    rows: rows as Array<Invoice & { customer_name_ar: string }>,
    total: Number((countRow as { count: string }).count),
  };
}

export async function listCheques(
  q: ListChequesQueryInput,
): Promise<{ rows: Array<Cheque & { invoice_no: string | null; customer_name_ar: string | null }>; total: number }> {
  const offset = (q.page - 1) * q.limit;
  const base = db('cheques as ch')
    .leftJoin('payments as p', 'ch.payment_id', 'p.id')
    .leftJoin('invoices as inv', 'p.invoice_id', 'inv.id')
    .leftJoin('customers as c', 'inv.customer_id', 'c.id')
    .select(
      'ch.*',
      'inv.invoice_no',
      'c.name_ar as customer_name_ar',
    );

  if (q.status) base.where('ch.status', q.status);
  if (q.bank_name_ar) base.whereILike('ch.bank_name_ar', `%${q.bank_name_ar}%`);
  if (q.due_date_from) base.where('ch.due_date', '>=', q.due_date_from);
  if (q.due_date_to) base.where('ch.due_date', '<=', q.due_date_to);
  if (q.search) {
    // Deliberately excludes bank_name_ar — that has its own filter box above,
    // and covering it here would make the two inputs redundant.
    const term = `%${q.search}%`;
    base.where((b) => {
      b.whereILike('ch.cheque_number', term)
        .orWhereILike('ch.issuer_name_ar', term)
        .orWhereILike('inv.invoice_no', term)
        .orWhereILike('c.name_ar', term);
    });
  }

  const [countRow] = await base.clone().clearSelect().count<Array<{ count: string }>>('ch.id as count');
  const rows = await base.orderBy('ch.due_date', 'asc').limit(q.limit).offset(offset);
  return {
    rows: rows as Array<Cheque & { invoice_no: string | null; customer_name_ar: string | null }>,
    total: Number((countRow as { count: string }).count),
  };
}
