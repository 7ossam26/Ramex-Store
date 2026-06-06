import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import { can } from '../permissions/permissionsService.js';
import type { RequestHandler } from 'express';
import * as ctl from './reports.controller.js';

export const reportsRouter = Router();

reportsRouter.use(requireAuth, requireActiveSession);

// ─── Permission middleware ──────────────────────────────────────────────────
// Consults the role_permissions table; owner always passes (short-circuited in can()).
function requireReportAccess(reportKey: string): RequestHandler {
  return async (req, res, next) => {
    const role = req.user!.role;
    const allowed = await can(role, `reports.${reportKey}`, 'read');
    if (!allowed) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    next();
  };
}

// ─── General report ──────────────────────────────────────────────────────────
reportsRouter.get('/general',        requireReportAccess('general'), ctl.getGeneralReportJson);
reportsRouter.get('/general/export', requireReportAccess('general'), ctl.exportGeneralReport);

// ─── Daily report ────────────────────────────────────────────────────────────
reportsRouter.get('/daily',          requireReportAccess('daily'),   ctl.getDailyReportJson);
reportsRouter.get('/daily/export',   requireReportAccess('daily'),   ctl.exportDailyReport);

// ─── Secondary reports ───────────────────────────────────────────────────────
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
