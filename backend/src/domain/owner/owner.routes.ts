import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import * as svc from './ownerApiService.js';
import { auditLog } from '../../middleware/audit.js';

export const ownerRouter = Router();

ownerRouter.use(requireAuth, requireActiveSession, requireRole('owner'));

function wrapAudit(action: string) {
  return async (req: import('express').Request, _res: import('express').Response, next: import('express').NextFunction) => {
    await auditLog(req, action, 'owner_api', null, null, null, { severity: 'low' });
    next();
  };
}

ownerRouter.get('/summary/today', wrapAudit('owner.summary_today'), async (_req, res, next) => {
  try { res.json(await svc.summaryToday()); }
  catch (e) { next(e); }
});

ownerRouter.get('/cash-position', wrapAudit('owner.cash_position'), async (_req, res, next) => {
  try { res.json(await svc.cashPosition()); }
  catch (e) { next(e); }
});

ownerRouter.get('/open-invoices', wrapAudit('owner.open_invoices'), async (_req, res, next) => {
  try { res.json(await svc.openInvoices()); }
  catch (e) { next(e); }
});

ownerRouter.get('/stock-summary', wrapAudit('owner.stock_summary'), async (_req, res, next) => {
  try { res.json(await svc.stockSummary()); }
  catch (e) { next(e); }
});

ownerRouter.get('/top-fabrics', wrapAudit('owner.top_fabrics'), async (req, res, next) => {
  try {
    const period = (req.query['period'] as '7d' | '30d' | '90d' | undefined) ?? '7d';
    res.json(await svc.topFabrics(period));
  } catch (e) { next(e); }
});

ownerRouter.get('/notifications', wrapAudit('owner.notifications'), async (req, res, next) => {
  try {
    const includeArchived = req.query['include_archived'] === 'true';
    const page  = Math.max(1, Number(req.query['page']  ?? 1));
    const limit = Math.min(100, Number(req.query['limit'] ?? 20));
    res.json(await svc.ownerNotifications(includeArchived, page, limit));
  } catch (e) { next(e); }
});

ownerRouter.get('/audit-log', wrapAudit('owner.audit_log'), async (req, res, next) => {
  try {
    const q = req.query as Record<string, string>;
    res.json(await svc.auditLog({
      from: q['from'], to: q['to'], entity: q['entity'],
      action: q['action'], severity: q['severity'],
      page:  Number(q['page']  ?? 1),
      limit: Number(q['limit'] ?? 50),
    }));
  } catch (e) { next(e); }
});

ownerRouter.get('/expenses-summary', wrapAudit('owner.expenses_summary'), async (req, res, next) => {
  try {
    const q = req.query as Record<string, string>;
    res.json(await svc.expensesSummary(q['from'], q['to']));
  } catch (e) { next(e); }
});

ownerRouter.get('/damage-loss', wrapAudit('owner.damage_loss'), async (req, res, next) => {
  try {
    const q = req.query as Record<string, string>;
    res.json(await svc.damageLoss(q['from'], q['to']));
  } catch (e) { next(e); }
});

ownerRouter.get('/daily-totals', wrapAudit('owner.daily_totals'), async (req, res, next) => {
  try {
    const q = req.query as Record<string, string>;
    if (!q['from'] || !q['to']) {
      res.status(400).json({ error: 'from and to are required' });
      return;
    }
    res.json(await svc.dailyTotals(q['from'], q['to']));
  } catch (e) { next(e); }
});

ownerRouter.get('/hourly-sales-curve', wrapAudit('owner.hourly_sales_curve'), async (req, res, next) => {
  try {
    const date = req.query['date'] as string | undefined;
    if (!date) {
      res.status(400).json({ error: 'date is required' });
      return;
    }
    res.json(await svc.hourlySalesCurve(date));
  } catch (e) { next(e); }
});

ownerRouter.get('/inventory-turnover', wrapAudit('owner.inventory_turnover'), async (req, res, next) => {
  try {
    const period = (req.query['period'] as '7d' | '30d' | '90d' | undefined) ?? '30d';
    res.json(await svc.inventoryTurnover(period));
  } catch (e) { next(e); }
});
