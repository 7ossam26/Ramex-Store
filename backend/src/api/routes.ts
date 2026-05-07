import { Router } from 'express';
import { healthRouter } from './health.js';
import { authRouter } from '../domain/auth/auth.routes.js';
import { usersRouter } from '../domain/users/users.routes.js';

export const apiRouter = Router();
apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
