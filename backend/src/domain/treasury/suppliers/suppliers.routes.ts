import { Router, type Response } from 'express';
import { requireAuth } from '../../../middleware/auth.js';
import { requireActiveSession } from '../../../middleware/concurrent-session.js';
import { requirePermission } from '../../../middleware/requirePermission.js';
import {
  CreateSupplierInvoiceSchema,
  CreateSupplierPaymentSchema,
  CreateSupplierSchema,
  UpdateSupplierInvoiceSchema,
  UpdateSupplierPaymentSchema,
  UpdateSupplierSchema,
} from './suppliers.schemas.js';
import * as svc from './suppliers.service.js';
import { SupplierValidationError } from './suppliers.service.js';

export const suppliersRouter = Router();
suppliersRouter.use(requireAuth, requireActiveSession);

function handle(res: Response, err: unknown, next: (e?: unknown) => void): void {
  if (err instanceof SupplierValidationError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }
  next(err);
}

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

suppliersRouter.post('/', requirePermission('suppliers', 'write'), async (req, res, next) => {
  try {
    const data = CreateSupplierSchema.parse(req.body);
    const supplier = await svc.createSupplier(data, req.user!.sub);
    res.status(201).json(supplier);
  } catch (e) { handle(res, e, next); }
});

suppliersRouter.patch('/:id', requirePermission('suppliers', 'write'), async (req, res, next) => {
  try {
    const data = UpdateSupplierSchema.parse(req.body);
    const supplier = await svc.updateSupplier(Number(req.params['id']), data, req.user!.sub);
    res.json(supplier);
  } catch (e) { handle(res, e, next); }
});

suppliersRouter.post('/:id/deactivate', requirePermission('suppliers', 'write'), async (req, res, next) => {
  try {
    await svc.deactivateSupplier(Number(req.params['id']), req.user!.sub);
    res.json({ ok: true });
  } catch (e) { handle(res, e, next); }
});

suppliersRouter.post('/invoices', requirePermission('suppliers', 'write'), async (req, res, next) => {
  try {
    const data = CreateSupplierInvoiceSchema.parse(req.body);
    const inv = await svc.createInvoice(data, req.user!.sub);
    res.status(201).json(inv);
  } catch (e) { handle(res, e, next); }
});

suppliersRouter.get('/invoices/:id', requirePermission('suppliers', 'view'), async (req, res, next) => {
  try {
    res.json(await svc.getInvoice(Number(req.params['id'])));
  } catch (e) { handle(res, e, next); }
});

suppliersRouter.patch('/invoices/:id', requirePermission('suppliers', 'write'), async (req, res, next) => {
  try {
    const data = UpdateSupplierInvoiceSchema.parse(req.body);
    const inv = await svc.updateInvoice(Number(req.params['id']), data, req.user!.sub);
    res.json(inv);
  } catch (e) { handle(res, e, next); }
});

suppliersRouter.delete('/invoices/:id', requirePermission('suppliers', 'write'), async (req, res, next) => {
  try {
    await svc.deleteInvoice(Number(req.params['id']), req.user!.sub);
    res.json({ ok: true });
  } catch (e) { handle(res, e, next); }
});

suppliersRouter.post('/payments', requirePermission('suppliers', 'payments.write'), async (req, res, next) => {
  try {
    const data = CreateSupplierPaymentSchema.parse(req.body);
    const payment = await svc.recordPayment(data, req.user!.sub);
    res.status(201).json(payment);
  } catch (e) { handle(res, e, next); }
});

suppliersRouter.patch('/payments/:id', requirePermission('suppliers', 'payments.write'), async (req, res, next) => {
  try {
    const data = UpdateSupplierPaymentSchema.parse(req.body);
    const payment = await svc.updatePayment(Number(req.params['id']), data, req.user!.sub);
    res.json(payment);
  } catch (e) { handle(res, e, next); }
});

suppliersRouter.delete('/payments/:id', requirePermission('suppliers', 'payments.write'), async (req, res, next) => {
  try {
    await svc.deletePayment(Number(req.params['id']), req.user!.sub);
    res.json({ ok: true });
  } catch (e) { handle(res, e, next); }
});
