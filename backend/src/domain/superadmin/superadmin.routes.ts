import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import { auditLog } from '../../middleware/audit.js';
import * as svc from './superadmin.service.js';
import { streamBackup } from './backup.service.js';

export const superadminRouter = Router();
superadminRouter.use(requireAuth, requireActiveSession, requireRole('super_admin'));

// ── Audit Log ────────────────────────────────────────────────────────────────

superadminRouter.get('/audit-log', async (req, res, next) => {
  try {
    const { page, pageSize, action, entity, severity, userId, dateFrom, dateTo } = req.query as Record<string, string>;
    const result = await svc.getAuditLog({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      action,
      entity,
      severity,
      userId: userId ? Number(userId) : undefined,
      dateFrom,
      dateTo,
    });
    res.json(result);
  } catch (e) { next(e); }
});

// ── Force sign-out ────────────────────────────────────────────────────────────

superadminRouter.post('/users/:id/force-signout', async (req, res, next) => {
  try {
    const id = Number(req.params['id']);
    if (!id) { res.status(400).json({ error: 'invalid id' }); return; }
    await svc.forceSignout(id);
    await auditLog(req, 'user.force_signout', 'users', id, null, null, { severity: 'high', userId: req.user!.sub });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

superadminRouter.post('/roles/:role/force-signout', async (req, res, next) => {
  try {
    const { role } = req.params;
    await svc.forceSignoutRole(role!);
    await auditLog(req, 'role.force_signout', 'users', role!, null, null, { severity: 'high', userId: req.user!.sub });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── Force password change ─────────────────────────────────────────────────────

superadminRouter.patch('/users/:id/force-password-change', async (req, res, next) => {
  try {
    const id = Number(req.params['id']);
    if (!id) { res.status(400).json({ error: 'invalid id' }); return; }
    const value = req.body?.value !== false;
    await svc.setForcePasswordChange(id, value);
    await auditLog(req, 'user.force_password_change', 'users', id, null, { value }, { severity: 'high', userId: req.user!.sub });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── Sessions ──────────────────────────────────────────────────────────────────

superadminRouter.get('/users/:id/sessions', async (req, res, next) => {
  try {
    const id = Number(req.params['id']);
    if (!id) { res.status(400).json({ error: 'invalid id' }); return; }
    const sessions = await svc.getUserSessions(id);
    res.json(sessions);
  } catch (e) { next(e); }
});

superadminRouter.delete('/users/:id/sessions', async (req, res, next) => {
  try {
    const id = Number(req.params['id']);
    if (!id) { res.status(400).json({ error: 'invalid id' }); return; }
    await svc.revokeUserSessions(id);
    await auditLog(req, 'user.sessions_revoked', 'sessions', id, null, null, { severity: 'high', userId: req.user!.sub });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── Backup ────────────────────────────────────────────────────────────────────

superadminRouter.get('/backup/download', (req, res) => {
  streamBackup(res);
});
