import { Router } from 'express';
import type { RequestHandler } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { requireOpenShift } from '../../middleware/requireOpenShift.js';
import { can } from '../permissions/permissionsService.js';
import * as ctl from './finance.controller.js';

export const financeRouter = Router();

financeRouter.use(requireAuth, requireActiveSession);

// ─── Cash Drawer ─────────────────────────────────────────────────────────────
financeRouter.get('/cash/balance', requirePermission('cash_drawer', 'read'), ctl.getCashBalance);
// Opening balance and owner withdrawal are admin-only (shop_seller has cash_drawer.write
// but must not touch these; Phase 5 will add cash_drawer.approve for finer granularity).
financeRouter.post('/cash/opening-balance', requireRole('owner', 'super_admin'), ctl.setOpeningBalance);
financeRouter.get('/cash/movements', requirePermission('cash_drawer', 'read'), ctl.getCashMovements);
financeRouter.post('/cash/reconcile', requirePermission('cash_drawer', 'write'), ctl.reconcileCash);
financeRouter.post(
  '/cash/deposit-to-bank',
  requirePermission('cash_drawer', 'write'),
  requireOpenShift,
  ctl.depositToBank,
);
financeRouter.post('/cash/owner-withdrawal', requireRole('owner', 'super_admin'), ctl.ownerWithdrawal);

// ─── Bank Accounts ────────────────────────────────────────────────────────────
financeRouter.get('/banks', requirePermission('cash_drawer', 'read'), ctl.listBanks);
// Bank creation and editing are admin-only (Phase 5: add cash_drawer.approve).
financeRouter.post('/banks', requireRole('owner', 'super_admin'), ctl.createBank);
financeRouter.patch('/banks/:id', requireRole('owner', 'super_admin'), ctl.updateBank);
financeRouter.get('/banks/:id/movements', requirePermission('cash_drawer', 'read'), ctl.getBankMovements);
financeRouter.post('/banks/:id/reconcile', requirePermission('cash_drawer', 'write'), ctl.reconcileBank);

// ─── Treasuries Overview ──────────────────────────────────────────────────────
// Aggregated management view — Phase 5: map to a report or cash_drawer.approve.
financeRouter.get('/treasuries-overview', requireRole('owner', 'super_admin'), ctl.getTreasuriesOverviewHandler);

// ─── Expenses ─────────────────────────────────────────────────────────────────
financeRouter.get('/expenses', requirePermission('cash_drawer', 'read'), ctl.listExpenses);

// Accountant has cash_drawer.write=false but is specifically authorised to record expenses.
// Phase 5: introduce an expenses.write resource so this can be a clean requirePermission.
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

// Expense approval is a management action — Phase 5: add cash_drawer.approve.
financeRouter.post('/expenses/:id/approve', requireRole('owner', 'super_admin'), ctl.approveExpense);
financeRouter.post('/expenses/:id/reject', requireRole('owner', 'super_admin'), ctl.rejectExpense);
