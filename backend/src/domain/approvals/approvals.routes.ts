import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import { auditLog } from '../../middleware/audit.js';
import * as svc from './approvalsService.js';

export const approvalsRouter = Router();

approvalsRouter.use(requireAuth, requireActiveSession);

// GET /api/approvals — pending blocking notifications for this user/role
approvalsRouter.get('/', async (req, res, next) => {
  try {
    const rows = await svc.listPending(req.user!.sub, req.user!.role);
    res.json({ rows, total: rows.length });
  } catch (e) { next(e); }
});

// GET /api/approvals/resolved
approvalsRouter.get('/resolved', async (req, res, next) => {
  try {
    const page  = Math.max(1, Number(req.query['page']  ?? 1));
    const limit = Math.min(100, Number(req.query['limit'] ?? 30));
    res.json(await svc.listResolved(req.user!.sub, req.user!.role, page, limit));
  } catch (e) { next(e); }
});

// POST /api/approvals/:id/approve — Owner only
approvalsRouter.post('/:id/approve', async (req, res, next) => {
  try {
    if (req.user!.role !== 'owner') {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    const id = Number(req.params['id']);
    const updated = await svc.approve(id, req.user!.sub);
    await auditLog(req, 'approval.approved', 'notifications', id, null, null, { severity: 'medium' });
    res.json(updated);
  } catch (e) { next(e); }
});

// POST /api/approvals/:id/reject — Owner only
approvalsRouter.post('/:id/reject', async (req, res, next) => {
  try {
    if (req.user!.role !== 'owner') {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    const id = Number(req.params['id']);
    const updated = await svc.reject(id, req.user!.sub);
    await auditLog(req, 'approval.rejected', 'notifications', id, null, null, { severity: 'medium' });
    res.json(updated);
  } catch (e) { next(e); }
});
