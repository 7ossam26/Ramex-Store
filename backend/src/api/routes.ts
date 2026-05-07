import { Router } from 'express';
import { healthRouter } from './health.js';
import { authRouter } from '../domain/auth/auth.routes.js';
import { usersRouter } from '../domain/users/users.routes.js';
import { itemsRouter } from '../domain/items/items.routes.js';
import { inventoryRouter } from '../domain/inventory/inventory.routes.js';
import { customersRouter } from '../domain/customers/customers.routes.js';

export const apiRouter = Router();
apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/', itemsRouter);
apiRouter.use('/', inventoryRouter);
apiRouter.use('/', customersRouter);
