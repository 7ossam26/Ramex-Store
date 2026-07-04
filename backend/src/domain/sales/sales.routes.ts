import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { requireOpenShift } from '../../middleware/requireOpenShift.js';
import * as ctl from './sales.controller.js';
import * as retCtl from './returns.controller.js';
import { listActiveBankAccounts } from './bankAccounts.service.js';

export const salesRouter = Router();

salesRouter.use(requireAuth, requireActiveSession);

salesRouter.post('/sales/preview', requirePermission('invoices', 'write'), ctl.previewSale);
salesRouter.post('/sales', requirePermission('invoices', 'write'), requireOpenShift, ctl.createSale);

salesRouter.get('/invoices', requirePermission('invoices', 'read'), ctl.listInvoices);
salesRouter.get('/invoices/open', requirePermission('invoices', 'read'), ctl.listOpenInvoices);
salesRouter.get('/invoices/pending-pickup', requirePermission('invoices', 'read'), ctl.listPendingPickup);
salesRouter.post('/invoices/:id/audit-reprint', requirePermission('invoices', 'write'), ctl.auditReprint);
salesRouter.get('/invoices/:id/status-history', requirePermission('invoices', 'read'), ctl.getStatusHistory);
salesRouter.get('/invoices/:id', requirePermission('invoices', 'read'), ctl.getInvoice);
salesRouter.post('/invoices/:id/void', requirePermission('invoices', 'write'), requireOpenShift, ctl.voidInvoice);
salesRouter.post(
  '/invoices/:id/payments/final',
  requirePermission('invoices', 'write'),
  requireOpenShift,
  ctl.addFinalPayment,
);
salesRouter.post(
  '/invoices/:id/mark-delivered',
  requirePermission('invoices', 'write'),
  requireOpenShift,
  ctl.markDelivered,
);
salesRouter.post(
  '/invoices/:id/cancel',
  requirePermission('invoices', 'write'),
  requireOpenShift,
  ctl.cancelOpenInvoice,
);
salesRouter.post(
  '/invoices/:id/lines',
  requirePermission('invoices', 'write'),
  requireOpenShift,
  ctl.addOpenInvoiceLines,
);
salesRouter.post(
  '/invoices/:id/deposit-refund',
  requirePermission('invoices', 'write'),
  requireOpenShift,
  ctl.depositRefund,
);

salesRouter.get('/bank-accounts', requirePermission('invoices', 'read'), async (_req, res) => {
  res.json(await listActiveBankAccounts());
});

// Returns & Exchanges
salesRouter.post('/returns', requirePermission('returns', 'write'), requireOpenShift, retCtl.processReturn);
salesRouter.post('/returns/exchange', requirePermission('returns', 'write'), requireOpenShift, retCtl.processExchange);
// Phase 6 — scan routes before /:id to prevent Express capturing the literal segment
salesRouter.get('/returns/scan-preview/:rollId', requirePermission('returns', 'read'), retCtl.getScanPreview);
salesRouter.get('/returns/scan-preview-accessory/:accessoryId', requirePermission('returns', 'read'), retCtl.getAccessoryScanPreview);
salesRouter.post('/returns/from-scan', requirePermission('returns', 'write'), requireOpenShift, retCtl.createScanReturn);
salesRouter.get('/returns', requirePermission('returns', 'read'), retCtl.listReturns);
salesRouter.get('/returns/:id/slip-pdf', requirePermission('returns', 'read'), retCtl.getReturnSlipPdf);
salesRouter.get('/returns/:id', requirePermission('returns', 'read'), retCtl.getReturn);

// Cheques admin list
salesRouter.get('/cheques', requirePermission('invoices', 'read'), ctl.listCheques);

// Sales export (Excel)
salesRouter.get('/sales/export', requirePermission('invoices', 'read'), ctl.exportSales);
