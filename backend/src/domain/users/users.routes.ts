import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import { meCtl, listCtl } from './users.controller.js';

export const usersRouter = Router();
usersRouter.use(requireAuth, requireActiveSession);
usersRouter.get('/me', meCtl);
usersRouter.get('/', requireRole('super_admin'), listCtl);
