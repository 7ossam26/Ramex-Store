import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import * as ctl from './sales.controller.js';
import { listActiveBankAccounts } from './bankAccounts.service.js';

export const salesRouter = Router();

salesRouter.use(requireAuth, requireActiveSession);

salesRouter.post('/sales/preview', requireRole('owner', 'shop_seller'), ctl.previewSale);
salesRouter.post('/sales', requireRole('owner', 'shop_seller'), ctl.createSale);

salesRouter.get('/invoices', ctl.listInvoices);
salesRouter.get('/invoices/:id/pdf', ctl.getInvoicePdf);
salesRouter.get('/invoices/:id', ctl.getInvoice);
salesRouter.post('/invoices/:id/void', requireRole('owner', 'shop_seller'), ctl.voidInvoice);

salesRouter.get('/bank-accounts', async (_req, res) => {
  res.json(await listActiveBankAccounts());
});
