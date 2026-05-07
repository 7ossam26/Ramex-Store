import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import * as ctl from './customers.controller.js';

export const customersRouter = Router();

customersRouter.use(requireAuth, requireActiveSession);

// Static paths before parameterized to avoid conflict
customersRouter.get('/customers/by-phone/:phone', ctl.getCustomerByPhone);
customersRouter.post(
  '/customers/quick',
  requireRole('owner', 'shop_seller'),
  ctl.quickCreateCustomer,
);

customersRouter.get('/customers', ctl.listCustomers);
customersRouter.post('/customers', requireRole('owner', 'shop_seller'), ctl.createCustomer);

customersRouter.get('/customers/:id', ctl.getCustomer);
customersRouter.patch('/customers/:id', requireRole('owner', 'shop_seller'), ctl.updateCustomer);
customersRouter.get('/customers/:id/ledger', ctl.getCustomerLedger);
