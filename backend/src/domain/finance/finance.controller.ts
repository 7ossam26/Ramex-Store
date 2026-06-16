import type { RequestHandler } from 'express';
import * as cashDrawer from './cashDrawerService.js';
import * as bank from './bankService.js';
import * as expenses from './expensesService.js';
import { getTreasuriesOverview } from './treasuriesOverviewService.js';
import { db } from '../../db/connection.js';
import { auditFromService } from '../inventory/audit.helper.js';
import {
  SetOpeningBalanceSchema,
  CashMovementsQuerySchema,
  CashReconcileSchema,
  CashDepositToBankSchema,
  OwnerWithdrawalSchema,
  CreateBankAccountSchema,
  UpdateBankAccountSchema,
  BankMovementsQuerySchema,
  BankReconcileSchema,
  CreateExpenseSchema,
  RejectExpenseSchema,
  ExpensesQuerySchema,
} from './finance.schemas.js';

const ERR_MAP: Record<string, number> = {
  OPENING_BALANCE_ALREADY_SET: 409,
  BANK_ACCOUNT_NOT_FOUND: 404,
  EXPENSE_NOT_FOUND: 404,
  EXPENSE_NOT_PENDING_APPROVAL: 409,
  EXPENSE_ALREADY_APPROVED: 409,
  EXPENSE_ALREADY_PROCESSED: 409,
  NO_DEFAULT_BANK_ACCOUNT: 422,
  INSTAPAY_REQUIRES_BANK_ACCOUNT: 400,
  INSUFFICIENT_CASH_BALANCE: 422,
  INSUFFICIENT_BANK_BALANCE: 422,
};

function handleErr(res: Parameters<RequestHandler>[1], err: unknown): void {
  const msg = err instanceof Error ? err.message : 'INTERNAL_ERROR';
  const status = ERR_MAP[msg] ?? 500;
  res.status(status).json({ error: msg });
}

// ─── Cash Drawer ─────────────────────────────────────────────────────────────

export const getCashBalance: RequestHandler = async (_req, res) => {
  try {
    res.json(await cashDrawer.getBalance());
  } catch (e) { handleErr(res, e); }
};

export const setOpeningBalance: RequestHandler = async (req, res) => {
  try {
    const body = SetOpeningBalanceSchema.parse(req.body);
    await cashDrawer.setOpeningBalance(body.amount, req.user!.sub, body.override);
    res.json({ ok: true });
  } catch (e) { handleErr(res, e); }
};

export const getCashMovements: RequestHandler = async (req, res) => {
  try {
    const q = CashMovementsQuerySchema.parse(req.query);
    res.json(await cashDrawer.listMovements(q));
  } catch (e) { handleErr(res, e); }
};

export const reconcileCash: RequestHandler = async (req, res) => {
  try {
    const body = CashReconcileSchema.parse(req.body);
    const result = await cashDrawer.recordReconciliation({
      date: body.date,
      actualBalance: body.actual_balance_egp,
      notesAr: body.notes_ar,
      actorUserId: req.user!.sub,
    });
    res.json(result);
  } catch (e) { handleErr(res, e); }
};

export const depositToBank: RequestHandler = async (req, res) => {
  try {
    const body = CashDepositToBankSchema.parse(req.body);
    const actorUserId = req.user!.sub;

    await db.transaction(async (trx) => {
      // Cash out → cash_to_bank
      const cashMovId = await cashDrawer.recordMovement(
        trx, 'out', 'cash_to_bank', body.amount, actorUserId,
        'bank_account', body.bank_account_id, body.notes_ar,
      );
      // Bank in → cash_deposit, cross-link reference to cash movement
      await bank.recordMovement(
        trx, body.bank_account_id, 'in', 'cash_deposit', body.amount, actorUserId,
        'cash_movement', cashMovId, body.notes_ar,
      );
      await auditFromService(trx, {
        actorUserId,
        action: 'cash_deposit_to_bank',
        entity: 'cash_drawer',
        entityId: 1,
        after: { amount_egp: body.amount, bank_account_id: body.bank_account_id },
        severity: 'medium',
      });
    });

    res.json({ ok: true });
  } catch (e) { handleErr(res, e); }
};

export const ownerWithdrawal: RequestHandler = async (req, res) => {
  try {
    const body = OwnerWithdrawalSchema.parse(req.body);
    const actorUserId = req.user!.sub;

    await db.transaction(async (trx) => {
      await cashDrawer.recordMovement(
        trx, 'out', 'owner_withdrawal', body.amount, actorUserId,
        null, null, body.notes_ar,
      );
      await auditFromService(trx, {
        actorUserId,
        action: 'owner_withdrawal',
        entity: 'cash_drawer',
        entityId: 1,
        after: { amount_egp: body.amount },
        severity: 'high',
      });
    });

    res.json({ ok: true });
  } catch (e) { handleErr(res, e); }
};

// ─── Bank Accounts ────────────────────────────────────────────────────────────

export const listBanks: RequestHandler = async (_req, res) => {
  try {
    res.json(await bank.listBankAccounts());
  } catch (e) { handleErr(res, e); }
};

export const createBank: RequestHandler = async (req, res) => {
  try {
    const body = CreateBankAccountSchema.parse(req.body);
    const row = await bank.createBankAccount(
      {
        nameAr: body.name_ar,
        bankNameAr: body.bank_name_ar,
        branchAr: body.branch_ar,
        iban: body.iban,
        accountNumber: body.account_number,
        notesAr: body.notes_ar,
        isDefault: body.is_default,
      },
      req.user!.sub,
    );
    res.status(201).json(row);
  } catch (e) { handleErr(res, e); }
};

export const updateBank: RequestHandler = async (req, res) => {
  try {
    const id = Number(req.params['id']);
    const body = UpdateBankAccountSchema.parse(req.body);
    const row = await bank.updateBankAccount(
      id,
      {
        nameAr: body.name_ar,
        bankNameAr: body.bank_name_ar,
        branchAr: body.branch_ar,
        iban: body.iban,
        accountNumber: body.account_number,
        notesAr: body.notes_ar,
        isActive: body.is_active,
        isDefault: body.is_default,
      },
      req.user!.sub,
    );
    res.json(row);
  } catch (e) { handleErr(res, e); }
};

export const getBankMovements: RequestHandler = async (req, res) => {
  try {
    const id = Number(req.params['id']);
    const q = BankMovementsQuerySchema.parse(req.query);
    res.json(await bank.listMovements(id, q));
  } catch (e) { handleErr(res, e); }
};

export const reconcileBank: RequestHandler = async (req, res) => {
  try {
    const id = Number(req.params['id']);
    const body = BankReconcileSchema.parse(req.body);
    const result = await bank.recordReconciliation({
      date: body.date,
      bankAccountId: id,
      actualBalance: body.actual_balance_egp,
      notesAr: body.notes_ar,
      actorUserId: req.user!.sub,
    });
    res.json(result);
  } catch (e) { handleErr(res, e); }
};

// ─── Treasuries Overview ──────────────────────────────────────────────────────

export const getTreasuriesOverviewHandler: RequestHandler = async (_req, res) => {
  try {
    res.json(await getTreasuriesOverview());
  } catch (e) { handleErr(res, e); }
};

// ─── Expenses ─────────────────────────────────────────────────────────────────

export const listExpenses: RequestHandler = async (req, res) => {
  try {
    const q = ExpensesQuerySchema.parse(req.query);
    res.json(await expenses.listExpenses(q));
  } catch (e) { handleErr(res, e); }
};

export const createExpense: RequestHandler = async (req, res) => {
  try {
    const body = CreateExpenseSchema.parse(req.body);
    const row = await expenses.recordExpense({
      category: body.category,
      amount: body.amount_egp,
      paidFrom: body.paid_from,
      bankAccountId: body.bank_account_id,
      notesAr: body.notes_ar,
      actorUserId: req.user!.sub,
      shiftId: req.shiftId ?? null,
    });
    res.status(201).json(row);
  } catch (e) { handleErr(res, e); }
};

export const approveExpense: RequestHandler = async (req, res) => {
  try {
    const id = Number(req.params['id']);
    const row = await expenses.approveExpense(id, req.user!.sub);
    res.json(row);
  } catch (e) { handleErr(res, e); }
};

export const rejectExpense: RequestHandler = async (req, res) => {
  try {
    const id = Number(req.params['id']);
    const body = RejectExpenseSchema.parse(req.body);
    const row = await expenses.rejectExpense(id, body.reason_ar, req.user!.sub);
    res.json(row);
  } catch (e) { handleErr(res, e); }
};
