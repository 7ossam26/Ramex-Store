import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import { auditFromService } from '../inventory/audit.helper.js';
import { db } from '../../db/connection.js';
import { runStaleInvoiceCheck } from '../sales/staleInvoices.job.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireActiveSession);

adminRouter.post(
  '/trigger-stale-check',
  requireRole('owner', 'super_admin'),
  async (req, res, next) => {
    try {
      const result = await runStaleInvoiceCheck();
      await auditFromService(db, {
        actorUserId: Number(req.user!.sub),
        action: 'admin_stale_check_triggered',
        entity: 'invoice',
        entityId: null,
        after: { notified: result.notified },
        severity: 'low',
      });
      res.json(result);
    } catch (e) {
      next(e);
    }
  },
);
