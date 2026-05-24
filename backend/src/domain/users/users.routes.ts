import { Router } from 'express';
import { ZodError } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import { auditLog } from '../../middleware/audit.js';
import { meCtl, listCtl } from './users.controller.js';
import { CreateUserSchema, UpdateUserSchema } from './users.schemas.js';
import * as svc from './users.service.js';

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
