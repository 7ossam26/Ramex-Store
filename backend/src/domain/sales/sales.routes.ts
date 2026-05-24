import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { requireActiveSession } from '../../middleware/concurrent-session.js';
import { requireOpenShift } from '../../middleware/requireOpenShift.js';
import * as ctl from './sales.controller.js';
import * as retCtl from './returns.controller.js';
import { listActiveBankAccounts } from './bankAccounts.service.js';

export const salesRouter = Router();

salesRouter.use(requireAuth, requireActiveSession);

salesRouter.post('/sales/preview', requireRole('owner', 'shop_seller'), ctl.previewSale);
salesRouter.post('/sales', requireRole('owner', 'shop_seller'), requireOpenShift, ctl.createSale);

salesRouter.get('/invoices', ctl.listInvoices);
salesRouter.get('/invoices/open', ctl.listOpenInvoices);
salesRouter.get('/invoices/pending-pickup', ctl.listPendingPickup);
salesRouter.post('/invoices/:id/audit-reprint', ctl.auditReprint);
salesRouter.get('/invoices/:id/status-history', ctl.getStatusHistory);
salesRouter.get('/invoices/:id', ctl.getInvoice);
salesRouter.post('/invoices/:id/void', requireRole('owner', 'shop_seller'), requireOpenShift, ctl.voidInvoice);
salesRouter.post(
  '/invoices/:id/payments/final',
  requireRole('owner', 'shop_seller'),
  requireOpenShift,
  ctl.addFinalPayment,
);
salesRouter.post(
  '/invoices/:id/mark-delivered',
  requireRole('owner', 'shop_seller'),
  requireOpenShift,
  ctl.markDelivered,
);
salesRouter.post(
  '/invoices/:id/cancel',
  requireRole('owner', 'shop_seller'),
  requireOpenShift,
  ctl.cancelOpenInvoice,
);
salesRouter.post(
  '/invoices/:id/lines',
  requireRole('owner', 'shop_seller'),
  requireOpenShift,
  ctl.addOpenInvoiceLines,
);
salesRouter.post(
  '/invoices/:id/deposit-refund',
  requireRole('owner', 'shop_seller'),
  requireOpenShift,
  ctl.depositRefund,
);

salesRouter.get('/bank-accounts', async (_req, res) => {
  res.json(await listActiveBankAccounts());
});

// Returns & Exchanges
salesRouter.post('/returns', requireRole('owner', 'shop_seller'), requireOpenShift, retCtl.processReturn);
salesRouter.post('/returns/exchange', requireRole('owner', 'shop_seller'), requireOpenShift, retCtl.processExchange);
// Phase 6 — scan routes before /:id to prevent Express capturing the literal segment
salesRouter.get('/returns/scan-preview/:rollId', retCtl.getScanPreview);
salesRouter.post('/returns/from-scan', requireRole('owner', 'shop_seller'), requireOpenShift, retCtl.createScanReturn);
salesRouter.get('/returns', retCtl.listReturns);
salesRouter.get('/returns/:id/slip-pdf', retCtl.getReturnSlipPdf);
salesRouter.get('/returns/:id', retCtl.getReturn);

// Cheques admin list
salesRouter.get('/cheques', ctl.listCheques);
