import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { loginCtl, logoutCtl, changePasswordCtl } from './auth.controller.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';

const loginLimiter = rateLimit({ windowMs: 60_000, limit: 10 });

export const authRouter = Router();
authRouter.post('/login', loginLimiter, loginCtl);
authRouter.post('/logout', requireAuth, requireActiveSession, logoutCtl);
authRouter.post('/change-password', requireAuth, requireActiveSession, changePasswordCtl);
