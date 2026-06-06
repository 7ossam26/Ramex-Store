import { Router } from 'express';
import type { RequestHandler } from 'express';
import { requireAuth } from '../../../middleware/auth.js';
import { requireActiveSession } from '../../../middleware/concurrent-session.js';
import { can } from '../../permissions/permissionsService.js';
import { CreateSupplierInvoiceSchema, CreateSupplierPaymentSchema } from './suppliers.schemas.js';
import * as svc from './suppliers.service.js';

export const suppliersRouter = Router();
suppliersRouter.use(requireAuth, requireActiveSession);

function requireSupplierPerm(action: string): RequestHandler {
  return async (req, res, next) => {
    const role = req.user!.role;
    if (role === 'owner' || role === 'super_admin') return next();
    const allowed = await can(role, 'suppliers', action);
    if (!allowed) { res.status(403).json({ error: 'forbidden' }); return; }
    next();
  };
}

// List all suppliers with their current balance
suppliersRouter.get('/', requireSupplierPerm('view'), async (req, res, next) => {
  try {
    res.json(await svc.listSuppliersWithBalance());
  } catch (e) { next(e); }
});

// Full ledger for a single supplier
suppliersRouter.get('/:id/ledger', requireSupplierPerm('view'), async (req, res, next) => {
  try {
    res.json(await svc.getLedger(Number(req.params['id'])));
  } catch (e) { next(e); }
});

// Add a manual debt (supplier invoice)
suppliersRouter.post('/invoices', requireSupplierPerm('write'), async (req, res, next) => {
  try {
    const data = CreateSupplierInvoiceSchema.parse(req.body);
    const inv = await svc.createInvoice(data, req.user!.sub);
    res.status(201).json(inv);
  } catch (e) { next(e); }
});

// Record a payment to a supplier
suppliersRouter.post('/payments', requireSupplierPerm('payments.write'), async (req, res, next) => {
  try {
    const data = CreateSupplierPaymentSchema.parse(req.body);
    const payment = await svc.recordPayment(data, req.user!.sub);
    res.status(201).json(payment);
  } catch (e) { next(e); }
});
