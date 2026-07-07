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
import { getSupplierStatement, getSupplierStatementExport } from './supplierStatement.service.js';
import { cairoToday, formatCairo } from '../../../lib/datetime/cairo.js';
import { buildReportPdf } from '../../../lib/reports/pdfExport.js';
import { buildReportExcel } from '../../../lib/reports/excelExport.js';
import { buildPrintableHtml } from '../../../lib/reports/printableHtml.js';
import { auditFromService } from '../../inventory/audit.helper.js';
import { db } from '../../../db/connection.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Read a `YYYY-MM-DD` query param, falling back to a default. */
function dateParam(val: unknown, fallback: string): string {
  return typeof val === 'string' && ISO_DATE.test(val) ? val : fallback;
}

/** First day of the current Cairo-local month, `YYYY-MM-DD`. */
function firstOfCairoMonth(): string {
  return `${cairoToday().slice(0, 7)}-01`;
}

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

suppliersRouter.get('/:id/statement', requirePermission('suppliers', 'view'), async (req, res, next) => {
  try {
    const id = Number(req.params['id']);
    const from = dateParam(req.query['from'], firstOfCairoMonth());
    const to = dateParam(req.query['to'], cairoToday());
    const variant = req.query['variant'] === 'detailed' ? 'detailed' : 'summary';
    const format = typeof req.query['format'] === 'string' ? req.query['format'] : 'json';

    if (format === 'json') {
      res.json(await getSupplierStatement(id, from, to));
      return;
    }

    const generatedAt = formatCairo(new Date());
    const opts = await getSupplierStatementExport(id, from, to, variant, generatedAt);
    const fileBase = `supplier-${id}-statement-${from}_${to}`;

    // Audit every file/print export of an account statement.
    await auditFromService(db, {
      actorUserId: req.user!.sub,
      action: 'supplier_statement_exported',
      entity: 'supplier',
      entityId: id,
      after: { from, to, variant, format },
      severity: 'low',
    });

    if (format === 'excel') {
      const buf = await buildReportExcel(opts);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.xlsx"`);
      res.send(buf);
    } else if (format === 'print') {
      const html = buildPrintableHtml(opts);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } else {
      const buf = await buildReportPdf(opts);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.pdf"`);
      res.send(buf);
    }
  } catch (e) { handle(res, e, next); }
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
