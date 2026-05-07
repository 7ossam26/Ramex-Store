import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import { auditLog } from '../../middleware/audit.js';
import * as permSvc from './permissionsService.js';

export const permissionsRouter = Router();

permissionsRouter.use(requireAuth, requireActiveSession);

// GET /api/permissions — full matrix (Owner only)
permissionsRouter.get('/', requireRole('owner'), async (_req, res, next) => {
  try { res.json(await permSvc.getMatrix()); }
  catch (e) { next(e); }
});

// PATCH /api/permissions — bulk update (Owner only)
permissionsRouter.patch('/', requireRole('owner'), async (req, res, next) => {
  try {
    const updates = req.body as Array<{ role: string; resource: string; action: string; is_allowed: boolean }>;
    if (!Array.isArray(updates)) {
      res.status(400).json({ error: 'expected an array of updates' });
      return;
    }
    await permSvc.bulkUpdate(updates);
    await auditLog(req, 'permissions.bulk_update', 'role_permissions', null, null, { count: updates.length }, { severity: 'high' });
    res.json({ ok: true, updated: updates.length });
  } catch (e) { next(e); }
});
