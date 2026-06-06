import { Router } from 'express';
import { ZodError } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import { auditLog } from '../../middleware/audit.js';
import { meCtl, listCtl } from './users.controller.js';
import { CreateUserSchema, UpdateUserSchema, ResetPasswordSchema, UpdateUserPermissionsSchema } from './users.schemas.js';
import * as svc from './users.service.js';
import * as permSvc from '../permissions/permissionsService.js';

export const usersRouter = Router();
usersRouter.use(requireAuth, requireActiveSession);

usersRouter.get('/me', meCtl);
usersRouter.get('/', requireRole('super_admin'), listCtl);

// POST /users — create user (super_admin only)
usersRouter.post('/', requireRole('super_admin'), async (req, res, next) => {
  try {
    const data = CreateUserSchema.parse(req.body);
    const user = await svc.createUser(data);
    await auditLog(req, 'user.create', 'users', user.id, null,
      { username: user.username, role: user.role }, { severity: 'high' });
    res.status(201).json(user);
  } catch (e) {
    if (e instanceof ZodError) { res.status(400).json({ error: e.errors[0]?.message ?? 'validation error' }); return; }
    if ((e as { code?: string }).code === 'USERNAME_TAKEN') { res.status(409).json({ error: 'USERNAME_TAKEN' }); return; }
    next(e);
  }
});

// PATCH /users/:id — update user (super_admin only)
usersRouter.patch('/:id', requireRole('super_admin'), async (req, res, next) => {
  try {
    const id = Number(req.params['id']);
    if (!id) { res.status(400).json({ error: 'invalid id' }); return; }
    const data = UpdateUserSchema.parse(req.body);
    const before = await svc.findById(id);
    if (!before) { res.status(404).json({ error: 'USER_NOT_FOUND' }); return; }
    const user = await svc.updateUser(id, data);
    await auditLog(req, 'user.update', 'users', id,
      { role: before.role, is_active: before.is_active },
      { role: user.role, is_active: user.is_active },
      { severity: 'high' });
    res.json(user);
  } catch (e) {
    if (e instanceof ZodError) { res.status(400).json({ error: e.errors[0]?.message ?? 'validation error' }); return; }
    next(e);
  }
});

// DELETE /users/:id — delete user (super_admin only; cannot delete self or another super_admin)
usersRouter.delete('/:id', requireRole('super_admin'), async (req, res, next) => {
  try {
    const id = Number(req.params['id']);
    if (!id) { res.status(400).json({ error: 'invalid id' }); return; }
    if (req.user?.sub === id) { res.status(400).json({ error: 'CANNOT_DELETE_SELF' }); return; }
    const before = await svc.findById(id);
    if (!before) { res.status(404).json({ error: 'USER_NOT_FOUND' }); return; }
    await svc.deleteUser(id);
    await auditLog(req, 'user.delete', 'users', id,
      { username: before.username, role: before.role }, null,
      { severity: 'critical' });
    res.json({ ok: true });
  } catch (e) {
    if ((e as { code?: string }).code === 'CANNOT_DELETE_SUPER_ADMIN') { res.status(403).json({ error: 'CANNOT_DELETE_SUPER_ADMIN' }); return; }
    next(e);
  }
});

// POST /users/:id/reset-password — reset a user's password (super_admin only)
usersRouter.post('/:id/reset-password', requireRole('super_admin'), async (req, res, next) => {
  try {
    const id = Number(req.params['id']);
    if (!id) { res.status(400).json({ error: 'invalid id' }); return; }
    const { password } = ResetPasswordSchema.parse(req.body);
    const before = await svc.findById(id);
    if (!before) { res.status(404).json({ error: 'USER_NOT_FOUND' }); return; }
    await svc.resetPassword(id, password);
    await auditLog(req, 'user.password_reset', 'users', id,
      { username: before.username },
      { username: before.username },
      { severity: 'critical' });
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof ZodError) { res.status(400).json({ error: e.errors[0]?.message ?? 'validation error' }); return; }
    next(e);
  }
});

// GET /users/me/permissions — effective permissions for the logged-in user (any role)
usersRouter.get('/me/permissions', async (req, res, next) => {
  try {
    const { sub: userId, role } = req.user!;
    if (role === 'super_admin') {
      res.json({ all: true });
      return;
    }
    const permissions = await permSvc.getEffectivePermissionsForUser(userId, role);

    // Hard invariant: factory_sender must never receive shipments.approve=true
    // even if a DB override or misconfigured role row says otherwise.
    if (role === 'factory_sender') {
      if (!permissions['shipments']) permissions['shipments'] = {};
      permissions['shipments']['approve'] = false;
    }

    res.json({ all: false, permissions });
  } catch (e) { next(e); }
});

// GET /users/:id/permissions — get role matrix + user overrides (super_admin only)
usersRouter.get('/:id/permissions', requireRole('super_admin'), async (req, res, next) => {
  try {
    const id = Number(req.params['id']);
    if (!id) { res.status(400).json({ error: 'invalid id' }); return; }
    const user = await svc.findById(id);
    if (!user) { res.status(404).json({ error: 'USER_NOT_FOUND' }); return; }
    const [roleMatrix, overrides] = await Promise.all([
      permSvc.getMatrix(),
      permSvc.getOverridesForUser(id),
    ]);
    res.json({ role: user.role, roleMatrix, overrides });
  } catch (e) {
    next(e);
  }
});

// PATCH /users/:id/permissions — set per-user permission overrides (super_admin only)
usersRouter.patch('/:id/permissions', requireRole('super_admin'), async (req, res, next) => {
  try {
    const id = Number(req.params['id']);
    if (!id) { res.status(400).json({ error: 'invalid id' }); return; }
    const updates = UpdateUserPermissionsSchema.parse(req.body);
    const user = await svc.findById(id);
    if (!user) { res.status(404).json({ error: 'USER_NOT_FOUND' }); return; }
    await permSvc.bulkUpsertOverridesForUser(id, updates);
    await auditLog(req, 'user.permissions_update', 'user_permission_overrides', id,
      null,
      { user_id: id, count: updates.length },
      { severity: 'high' });
    res.json({ ok: true, updated: updates.length });
  } catch (e) {
    if (e instanceof ZodError) { res.status(400).json({ error: e.errors[0]?.message ?? 'validation error' }); return; }
    next(e);
  }
});
