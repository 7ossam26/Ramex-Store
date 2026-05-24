import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import { requireOpenShift } from '../../middleware/requireOpenShift.js';
import * as ctl from './finance.controller.js';

export const financeRouter = Router();

financeRouter.use(requireAuth, requireActiveSession);

// ─── Cash Drawer ─────────────────────────────────────────────────────────────
financeRouter.get('/cash/balance', ctl.getCashBalance);
financeRouter.post('/cash/opening-balance', requireRole('owner', 'super_admin'), ctl.setOpeningBalance);
financeRouter.get('/cash/movements', ctl.getCashMovements);
financeRouter.post('/cash/reconcile', requireRole('owner', 'shop_seller', 'super_admin'), ctl.reconcileCash);
financeRouter.post(
  '/cash/deposit-to-bank',
  requireRole('owner', 'shop_seller', 'super_admin'),
  requireOpenShift,
  ctl.depositToBank,
);
financeRouter.post('/cash/owner-withdrawal', requireRole('owner', 'super_admin'), ctl.ownerWithdrawal);

// ─── Bank Accounts ────────────────────────────────────────────────────────────
financeRouter.get('/banks', ctl.listBanks);
financeRouter.post('/banks', requireRole('owner', 'super_admin'), ctl.createBank);
financeRouter.patch('/banks/:id', requireRole('owner', 'super_admin'), ctl.updateBank);
financeRouter.get('/banks/:id/movements', ctl.getBankMovements);
financeRouter.post('/banks/:id/reconcile', requireRole('owner', 'shop_seller', 'super_admin'), ctl.reconcileBank);

// ─── Treasuries Overview ──────────────────────────────────────────────────────
financeRouter.get('/treasuries-overview', requireRole('owner', 'super_admin'), ctl.getTreasuriesOverviewHandler);

// ─── Expenses ─────────────────────────────────────────────────────────────────
financeRouter.get('/expenses', ctl.listExpenses);
financeRouter.post('/expenses', requireRole('owner', 'shop_seller', 'super_admin'), requireOpenShift, ctl.createExpense);
financeRouter.post('/expenses/:id/approve', requireRole('owner', 'super_admin'), ctl.approveExpense);
financeRouter.post('/expenses/:id/reject', requireRole('owner', 'super_admin'), ctl.rejectExpense);
