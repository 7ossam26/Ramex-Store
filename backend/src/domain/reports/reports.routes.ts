import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import type { Role } from '../../lib/jwt.js';
import * as ctl from './reports.controller.js';

export const reportsRouter = Router();

reportsRouter.use(requireAuth, requireActiveSession);

// ─── Permission middleware ─────────────────────────────────────────────────────
// Phase 11 will source this from Settings; for now it's hard-coded.
const SELLER_REPORTS: string[] = [
  'salesByPaymentMethod', 'customerLedger', 'outstandingOpenInvoices',
];

function requireReportAccess(reportKey: string) {
  const roles: Role[] = SELLER_REPORTS.includes(reportKey)
    ? ['owner', 'shop_seller']
    : ['owner'];
  return requireRole(...roles);
}

// ─── Daily report ─────────────────────────────────────────────────────────────
reportsRouter.get(
  '/daily',
  requireRole('owner', 'shop_seller'),
  ctl.getDailyReportJson,
);
reportsRouter.get(
  '/daily/export',
  requireRole('owner', 'shop_seller'),
  ctl.exportDailyReport,
);

// ─── Secondary reports ────────────────────────────────────────────────────────
reportsRouter.get('/secondary/:reportKey', (req, res, next) => {
  const key = Array.isArray(req.params['reportKey'])
    ? (req.params['reportKey'][0] ?? '')
    : (req.params['reportKey'] ?? '');
  return requireReportAccess(key)(req, res, next);
}, ctl.getSecondaryReportJson);

reportsRouter.get('/secondary/:reportKey/export', (req, res, next) => {
  const key = Array.isArray(req.params['reportKey'])
    ? (req.params['reportKey'][0] ?? '')
    : (req.params['reportKey'] ?? '');
  return requireReportAccess(key)(req, res, next);
}, ctl.exportSecondaryReport);
