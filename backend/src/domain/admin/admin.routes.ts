import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import { auditFromService } from '../inventory/audit.helper.js';
import { db } from '../../db/connection.js';
import { verifyPassword } from '../../lib/password.js';
import { runStaleInvoiceCheck } from '../sales/staleInvoices.job.js';
import { resetOperationalData, RESET_CONFIRM_PHRASE } from './databaseReset.service.js';

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

// POST /api/admin/reset-database — wipe all operational data (super_admin only).
// Double-guarded: caller must type the exact confirmation phrase AND re-enter
// their own account password. Audited as a critical action.
adminRouter.post(
  '/reset-database',
  requireRole('super_admin'),
  async (req, res, next) => {
    try {
      const { password, confirmPhrase } = req.body as {
        password?: unknown;
        confirmPhrase?: unknown;
      };

      if (typeof confirmPhrase !== 'string' || confirmPhrase.trim() !== RESET_CONFIRM_PHRASE) {
        res.status(400).json({ error: 'CONFIRM_PHRASE_MISMATCH' });
        return;
      }
      if (typeof password !== 'string' || password.length === 0) {
        res.status(400).json({ error: 'PASSWORD_REQUIRED' });
        return;
      }

      const userId = Number(req.user!.sub);
      const user = await db('users').where({ id: userId }).first();
      if (!user || user.role !== 'super_admin') {
        res.status(403).json({ error: 'forbidden' });
        return;
      }

      const ok = await verifyPassword(password, user.password_hash);
      if (!ok) {
        res.status(401).json({ error: 'INVALID_PASSWORD' });
        return;
      }

      const result = await resetOperationalData(userId);
      res.json({ ok: true, ...result });
    } catch (e) {
      next(e);
    }
  },
);
