import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import * as ctl from './customers.controller.js';

export const customersRouter = Router();

customersRouter.use(requireAuth, requireActiveSession);

// Static paths before parameterized to avoid conflict
customersRouter.get('/customers/by-phone/:phone', requirePermission('customers', 'read'), ctl.getCustomerByPhone);
customersRouter.post(
  '/customers/quick',
  requirePermission('customers', 'write'),
  ctl.quickCreateCustomer,
);

customersRouter.get('/customers', requirePermission('customers', 'read'), ctl.listCustomers);
customersRouter.post('/customers', requirePermission('customers', 'write'), ctl.createCustomer);
// Static path before parameterized `/customers/:id` to avoid conflict.
customersRouter.get('/customers/export', requirePermission('customers', 'read'), ctl.exportCustomers);

customersRouter.get('/customers/:id', requirePermission('customers', 'read'), ctl.getCustomer);
customersRouter.patch('/customers/:id', requirePermission('customers', 'write'), ctl.updateCustomer);
customersRouter.get('/customers/:id/ledger', requirePermission('customers', 'read'), ctl.getCustomerLedger);
customersRouter.get('/customers/:id/statement', requirePermission('customers', 'read'), ctl.getStatement);
customersRouter.post('/customers/:id/opening-balance', requirePermission('customers', 'write'), ctl.setOpeningBalance);
customersRouter.post('/customers/:id/receipts', requirePermission('customers', 'write'), ctl.recordReceipt);
