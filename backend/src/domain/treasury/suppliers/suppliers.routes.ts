import { Router } from 'express';
import { requireAuth } from '../../../middleware/auth.js';
import { requireActiveSession } from '../../../middleware/concurrent-session.js';
import { requirePermission } from '../../../middleware/requirePermission.js';
import { CreateSupplierInvoiceSchema, CreateSupplierPaymentSchema } from './suppliers.schemas.js';
import * as svc from './suppliers.service.js';

export const suppliersRouter = Router();
suppliersRouter.use(requireAuth, requireActiveSession);

suppliersRouter.get('/', requirePermission('suppliers', 'view'), async (req, res, next) => {
  try {
    res.json(await svc.listSuppliersWithBalance());
  } catch (e) { next(e); }
});

suppliersRouter.get('/:id/ledger', requirePermission('suppliers', 'view'), async (req, res, next) => {
  try {
    res.json(await svc.getLedger(Number(req.params['id'])));
  } catch (e) { next(e); }
});

suppliersRouter.post('/invoices', requirePermission('suppliers', 'write'), async (req, res, next) => {
  try {
    const data = CreateSupplierInvoiceSchema.parse(req.body);
    const inv = await svc.createInvoice(data, req.user!.sub);
    res.status(201).json(inv);
  } catch (e) { next(e); }
});

suppliersRouter.post('/payments', requirePermission('suppliers', 'payments.write'), async (req, res, next) => {
  try {
    const data = CreateSupplierPaymentSchema.parse(req.body);
    const payment = await svc.recordPayment(data, req.user!.sub);
    res.status(201).json(payment);
  } catch (e) { next(e); }
});
