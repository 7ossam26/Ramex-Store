import type { RequestHandler } from 'express';
import { cairoToday, formatCairo } from '../../lib/datetime/cairo.js';
import { buildReportPdf } from '../../lib/reports/pdfExport.js';
import { buildReportExcel } from '../../lib/reports/excelExport.js';
import { buildPrintableHtml } from '../../lib/reports/printableHtml.js';
import { getDailyReport, dailyReportToExportSections } from './dailyReportService.js';
import { getGeneralReport, generalReportToExportSections } from './generalReportService.js';
import { getSalesByFabricColor, salesByFabricColorToExport } from './secondaryReports/salesByFabricColor.js';
import { getCustomerLedger, customerLedgerToExport } from './secondaryReports/customerLedger.js';
import { getOutstandingOpenInvoices, outstandingOpenInvoicesToExport } from './secondaryReports/outstandingOpenInvoices.js';
import { getStocktakeInventory, stocktakeInventoryToExport } from './secondaryReports/stocktakeInventory.js';
import { getCashFlow, cashFlowToExport } from './secondaryReports/cashFlow.js';
import { getBankReconciliation, bankReconciliationToExport } from './secondaryReports/bankReconciliation.js';
import { getExpenses, expensesToExport } from './secondaryReports/expenses.js';
import { getSalesByPaymentMethod, salesByPaymentMethodToExport } from './secondaryReports/salesByPaymentMethod.js';
import { getAuditLog, auditLogToExport } from './secondaryReports/auditLog.js';
import { getReturnsReport, returnsReportToExport } from './secondaryReports/returnsReport.js';
import { getStockByWarehouse, stockByWarehouseToExport } from './secondaryReports/stockByWarehouse.js';
import { getAgingInventory, agingInventoryToExport } from './secondaryReports/agingInventory.js';
import { getShipmentsSummary, shipmentsSummaryToExport } from './secondaryReports/shipmentsSummary.js';
import { getOutstandingCheques, outstandingChequesToExport } from './secondaryReports/outstandingCheques.js';
import { getPayrollSummary, payrollSummaryToExport } from './secondaryReports/payrollSummary.js';
import { getHrAdjustments, hrAdjustmentsToExport } from './secondaryReports/hrAdjustments.js';

function handleErr(res: Parameters<RequestHandler>[1], err: unknown): void {
  const msg = err instanceof Error ? err.message : 'INTERNAL_ERROR';
  const statusMap: Record<string, number> = { CUSTOMER_NOT_FOUND: 404, REPORT_FORBIDDEN: 403 };
  res.status(statusMap[msg] ?? 500).json({ error: msg });
}

function dateParam(val: unknown, fallback: string): string {
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  return fallback;
}

// ─── General Report ───────────────────────────────────────────────────────────

export const getGeneralReportJson: RequestHandler = async (req, res) => {
  try {
    const today = cairoToday();
    const from = dateParam(req.query['from'], today);
    const to = dateParam(req.query['to'], today);
    const report = await getGeneralReport(from, to);
    res.json(report);
  } catch (e) { handleErr(res, e); }
};

export const exportGeneralReport: RequestHandler = async (req, res) => {
  try {
    const today = cairoToday();
    const from = dateParam(req.query['from'], today);
    const to = dateParam(req.query['to'], today);
    const format = req.query['format'] as string;
    const report = await getGeneralReport(from, to);
    const opts = generalReportToExportSections(report);

    if (format === 'excel') {
      const buf = await buildReportExcel(opts);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="general-report-${from}.xlsx"`);
      res.send(buf);
    } else if (format === 'print') {
      const html = buildPrintableHtml(opts);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } else {
      const buf = await buildReportPdf(opts);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="general-report-${from}.pdf"`);
      res.send(buf);
    }
  } catch (e) { handleErr(res, e); }
};

// ─── Daily Report ─────────────────────────────────────────────────────────────

export const getDailyReportJson: RequestHandler = async (req, res) => {
  try {
    const date = dateParam(req.query['date'], cairoToday());
    const report = await getDailyReport(date);
    res.json(report);
  } catch (e) { handleErr(res, e); }
};

export const exportDailyReport: RequestHandler = async (req, res) => {
  try {
    const date = dateParam(req.query['date'], cairoToday());
    const format = req.query['format'] as string;
    const report = await getDailyReport(date);
    const opts = dailyReportToExportSections(report);

    if (format === 'excel') {
      const buf = await buildReportExcel(opts);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="daily-report-${date}.xlsx"`);
      res.send(buf);
    } else if (format === 'print') {
      const html = buildPrintableHtml(opts);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } else {
      const buf = await buildReportPdf(opts);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="daily-report-${date}.pdf"`);
      res.send(buf);
    }
  } catch (e) { handleErr(res, e); }
};

// ─── Secondary Reports — JSON ─────────────────────────────────────────────────

export const getSecondaryReportJson: RequestHandler = async (req, res) => {
  try {
    const key = req.params['reportKey']!;
    const from = dateParam(req.query['from'], cairoToday()) + 'T00:00:00.000Z';
    const to = dateParam(req.query['to'], cairoToday()) + 'T23:59:59.999Z';

    switch (key) {
      case 'salesByFabricColor': res.json(await getSalesByFabricColor(from, to)); break;
      case 'customerLedger': {
        const cid = Number(req.query['customerId']);
        if (!cid) { res.status(400).json({ error: 'customerId required' }); return; }
        res.json(await getCustomerLedger(cid, from, to));
        break;
      }
      case 'outstandingOpenInvoices': res.json(await getOutstandingOpenInvoices()); break;
      case 'stocktakeInventory': res.json(await getStocktakeInventory()); break;
      case 'cashFlow': res.json(await getCashFlow(from, to)); break;
      case 'bankReconciliation': res.json(await getBankReconciliation(from, to)); break;
      case 'expenses': res.json(await getExpenses(from, to)); break;
      case 'salesByPaymentMethod': res.json(await getSalesByPaymentMethod(from, to)); break;
      case 'auditLog': {
        const opts = {
          from, to,
          userId: req.query['userId'] ? Number(req.query['userId']) : undefined,
          entity: req.query['entity'] as string | undefined,
          action: req.query['action'] as string | undefined,
          severity: req.query['severity'] as string | undefined,
          tag: req.query['tag'] as string | undefined,
          page: req.query['page'] ? Number(req.query['page']) : 1,
          limit: req.query['limit'] ? Number(req.query['limit']) : 100,
        };
        res.json(await getAuditLog(opts));
        break;
      }
      case 'returnsReport': res.json(await getReturnsReport(from, to)); break;
      case 'stockByWarehouse': res.json(await getStockByWarehouse()); break;
      case 'agingInventory': res.json(await getAgingInventory()); break;
      case 'shipmentsSummary': res.json(await getShipmentsSummary(from, to)); break;
      case 'outstandingCheques': res.json(await getOutstandingCheques(from, to)); break;
      case 'payrollSummary': res.json(await getPayrollSummary(from, to)); break;
      case 'hrAdjustments': res.json(await getHrAdjustments(from, to)); break;
      default: res.status(404).json({ error: 'REPORT_NOT_FOUND' });
    }
  } catch (e) { handleErr(res, e); }
};

// ─── Secondary Reports — Export ───────────────────────────────────────────────

export const exportSecondaryReport: RequestHandler = async (req, res) => {
  try {
    const key = req.params['reportKey']!;
    const from = dateParam(req.query['from'], cairoToday()) + 'T00:00:00.000Z';
    const to = dateParam(req.query['to'], cairoToday()) + 'T23:59:59.999Z';
    const fromDisplay = dateParam(req.query['from'], cairoToday());
    const toDisplay = dateParam(req.query['to'], cairoToday());
    const format = req.query['format'] as string;
    const generatedAt = formatCairo(new Date());

    let opts;
    switch (key) {
      case 'salesByFabricColor': {
        const data = await getSalesByFabricColor(from, to);
        opts = salesByFabricColorToExport(data, fromDisplay, toDisplay, generatedAt);
        break;
      }
      case 'customerLedger': {
        const cid = Number(req.query['customerId']);
        if (!cid) { res.status(400).json({ error: 'customerId required' }); return; }
        const data = await getCustomerLedger(cid, from, to);
        opts = customerLedgerToExport(data, fromDisplay, toDisplay, generatedAt);
        break;
      }
      case 'outstandingOpenInvoices': {
        const data = await getOutstandingOpenInvoices();
        opts = outstandingOpenInvoicesToExport(data, generatedAt);
        break;
      }
      case 'stocktakeInventory': {
        const data = await getStocktakeInventory();
        opts = stocktakeInventoryToExport(data, generatedAt);
        break;
      }
      case 'cashFlow': {
        const data = await getCashFlow(from, to);
        opts = cashFlowToExport(data, fromDisplay, toDisplay, generatedAt);
        break;
      }
      case 'bankReconciliation': {
        const data = await getBankReconciliation(from, to);
        opts = bankReconciliationToExport(data, fromDisplay, toDisplay, generatedAt);
        break;
      }
      case 'expenses': {
        const data = await getExpenses(from, to);
        opts = expensesToExport(data, fromDisplay, toDisplay, generatedAt);
        break;
      }
      case 'salesByPaymentMethod': {
        const data = await getSalesByPaymentMethod(from, to);
        opts = salesByPaymentMethodToExport(data, fromDisplay, toDisplay, generatedAt);
        break;
      }
      case 'auditLog': {
        const data = await getAuditLog({ from, to, page: 1, limit: 10000 });
        opts = auditLogToExport(data, { from: fromDisplay, to: toDisplay }, generatedAt);
        break;
      }
      case 'returnsReport': {
        const data = await getReturnsReport(from, to);
        opts = returnsReportToExport(data, fromDisplay, toDisplay, generatedAt);
        break;
      }
      case 'stockByWarehouse': {
        const data = await getStockByWarehouse();
        opts = stockByWarehouseToExport(data, generatedAt);
        break;
      }
      case 'agingInventory': {
        const data = await getAgingInventory();
        opts = agingInventoryToExport(data, generatedAt);
        break;
      }
      case 'shipmentsSummary': {
        const data = await getShipmentsSummary(from, to);
        opts = shipmentsSummaryToExport(data, fromDisplay, toDisplay, generatedAt);
        break;
      }
      case 'outstandingCheques': {
        const data = await getOutstandingCheques(from, to);
        opts = outstandingChequesToExport(data, fromDisplay, toDisplay, generatedAt);
        break;
      }
      case 'payrollSummary': {
        const data = await getPayrollSummary(from, to);
        opts = payrollSummaryToExport(data, fromDisplay, toDisplay, generatedAt);
        break;
      }
      case 'hrAdjustments': {
        const data = await getHrAdjustments(from, to);
        opts = hrAdjustmentsToExport(data, fromDisplay, toDisplay, generatedAt);
        break;
      }
      default: res.status(404).json({ error: 'REPORT_NOT_FOUND' }); return;
    }

    if (format === 'excel') {
      const buf = await buildReportExcel(opts);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${key}-${fromDisplay}.xlsx"`);
      res.send(buf);
    } else if (format === 'print') {
      const html = buildPrintableHtml(opts);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } else {
      const buf = await buildReportPdf(opts);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${key}-${fromDisplay}.pdf"`);
      res.send(buf);
    }
  } catch (e) { handleErr(res, e); }
};
