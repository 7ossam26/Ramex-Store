import { Router } from 'express';
import type { RequestHandler } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { requireOpenShift } from '../../middleware/requireOpenShift.js';
import { can } from '../permissions/permissionsService.js';
import * as ctl from './finance.controller.js';

export const financeRouter = Router();

financeRouter.use(requireAuth, requireActiveSession);

// ─── Cash Drawer ─────────────────────────────────────────────────────────────
financeRouter.get('/cash/balance', requirePermission('cash_drawer', 'read'), ctl.getCashBalance);
financeRouter.post('/cash/opening-balance', requirePermission('cash_drawer', 'approve'), ctl.setOpeningBalance);
financeRouter.get('/cash/movements', requirePermission('cash_drawer', 'read'), ctl.getCashMovements);
financeRouter.post('/cash/reconcile', requirePermission('cash_drawer', 'write'), ctl.reconcileCash);
financeRouter.post(
  '/cash/deposit-to-bank',
  requirePermission('cash_drawer', 'write'),
  requireOpenShift,
  ctl.depositToBank,
);
financeRouter.post('/cash/owner-withdrawal', requirePermission('cash_drawer', 'approve'), ctl.ownerWithdrawal);

// ─── Bank Accounts ────────────────────────────────────────────────────────────
financeRouter.get('/banks', requirePermission('cash_drawer', 'read'), ctl.listBanks);
financeRouter.post('/banks', requirePermission('cash_drawer', 'approve'), ctl.createBank);
financeRouter.patch('/banks/:id', requirePermission('cash_drawer', 'approve'), ctl.updateBank);
financeRouter.get('/banks/:id/movements', requirePermission('cash_drawer', 'read'), ctl.getBankMovements);
financeRouter.post('/banks/:id/reconcile', requirePermission('cash_drawer', 'write'), ctl.reconcileBank);

// ─── Treasuries Overview ──────────────────────────────────────────────────────
financeRouter.get('/treasuries-overview', requirePermission('cash_drawer', 'approve'), ctl.getTreasuriesOverviewHandler);

// ─── Expenses ─────────────────────────────────────────────────────────────────
financeRouter.get('/expenses', requirePermission('cash_drawer', 'read'), ctl.listExpenses);

// Accountant has cash_drawer.write=false but is specifically authorised to record expenses.
// The inline guard passes user.sub so per-user overrides are respected.
const canCreateExpense: RequestHandler = async (req, res, next) => {
  const user = req.user!;
  if (user.role === 'accountant') return next();
  const allowed = await can(user.role, 'cash_drawer', 'write', user.sub);
  if (!allowed) { res.status(403).json({ error: 'forbidden' }); return; }
  next();
};
financeRouter.post('/expenses', canCreateExpense, (req, res, next) => {
  if (req.user!.role === 'accountant') return next();
  return requireOpenShift(req, res, next);
}, ctl.createExpense);

financeRouter.post('/expenses/:id/approve', requirePermission('cash_drawer', 'approve'), ctl.approveExpense);
financeRouter.post('/expenses/:id/reject', requirePermission('cash_drawer', 'approve'), ctl.rejectExpense);

// ─── Cash Vault Transfers ─────────────────────────────────────────────────────
financeRouter.get('/general-vault/balance', requirePermission('cash_drawer', 'read'), ctl.getGeneralVaultBalance);
financeRouter.get('/cash-transfers', requirePermission('cash_drawer', 'read'), ctl.listVaultTransfers);
financeRouter.post('/cash-transfers', requirePermission('cash_drawer', 'write'), ctl.createVaultTransfer);
financeRouter.get('/cash-transfers/:id', requirePermission('cash_drawer', 'read'), ctl.getVaultTransfer);
financeRouter.post('/cash-transfers/:id/confirm', requirePermission('cash_drawer', 'approve'), ctl.confirmVaultTransfer);
financeRouter.post('/cash-transfers/:id/reject', requirePermission('cash_drawer', 'approve'), ctl.rejectVaultTransfer);
