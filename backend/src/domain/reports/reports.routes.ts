import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import * as ctl from './reports.controller.js';

export const reportsRouter = Router();

reportsRouter.use(requireAuth, requireActiveSession);

// ─── General report ──────────────────────────────────────────────────────────
reportsRouter.get('/general',        requirePermission('reports.general', 'read'), ctl.getGeneralReportJson);
reportsRouter.get('/general/export', requirePermission('reports.general', 'read'), ctl.exportGeneralReport);

// ─── Daily report ────────────────────────────────────────────────────────────
reportsRouter.get('/daily',          requirePermission('reports.daily', 'read'),   ctl.getDailyReportJson);
reportsRouter.get('/daily/export',   requirePermission('reports.daily', 'read'),   ctl.exportDailyReport);

// ─── Secondary reports (resource key comes from URL param) ───────────────────
reportsRouter.get('/secondary/:reportKey', (req, res, next) => {
  const key = Array.isArray(req.params['reportKey'])
    ? (req.params['reportKey'][0] ?? '')
    : (req.params['reportKey'] ?? '');
  requirePermission(`reports.${key}`, 'read')(req, res, next);
}, ctl.getSecondaryReportJson);

reportsRouter.get('/secondary/:reportKey/export', (req, res, next) => {
  const key = Array.isArray(req.params['reportKey'])
    ? (req.params['reportKey'][0] ?? '')
    : (req.params['reportKey'] ?? '');
  requirePermission(`reports.${key}`, 'read')(req, res, next);
}, ctl.exportSecondaryReport);
