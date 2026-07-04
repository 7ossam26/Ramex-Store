import type { Request, Response } from 'express';
import { getStockSummary, stockSummaryToExport, type WarehouseFilter } from './stockSummary.service.js';
import { buildReportExcel } from '../../lib/reports/excelExport.js';
import { formatCairo } from '../../lib/datetime/cairo.js';

const ALLOWED: WarehouseFilter[] = ['shop', 'factory', 'damaged_shop'];

export async function stockSummary(req: Request, res: Response): Promise<void> {
  const raw = typeof req.query.warehouse === 'string' ? req.query.warehouse : undefined;
  const warehouse = raw && ALLOWED.includes(raw as WarehouseFilter) ? (raw as WarehouseFilter) : undefined;
  const rows = await getStockSummary(warehouse);
  res.json({ rows });
}

export async function exportStockSummary(req: Request, res: Response): Promise<void> {
  const raw = typeof req.query.warehouse === 'string' ? req.query.warehouse : undefined;
  const warehouse = raw && ALLOWED.includes(raw as WarehouseFilter) ? (raw as WarehouseFilter) : undefined;
  const rows = await getStockSummary(warehouse);
  const generatedAt = formatCairo(new Date());
  const opts = stockSummaryToExport(rows, warehouse, generatedAt);
  const buf = await buildReportExcel(opts);
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="stock-summary-${date}.xlsx"`);
  res.send(buf);
}
