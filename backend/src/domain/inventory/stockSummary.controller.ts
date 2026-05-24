import type { Request, Response } from 'express';
import { getStockSummary, type WarehouseFilter } from './stockSummary.service.js';

const ALLOWED: WarehouseFilter[] = ['shop', 'factory', 'damaged_shop'];

export async function stockSummary(req: Request, res: Response): Promise<void> {
  const raw = typeof req.query.warehouse === 'string' ? req.query.warehouse : undefined;
  const warehouse = raw && ALLOWED.includes(raw as WarehouseFilter) ? (raw as WarehouseFilter) : undefined;
  const rows = await getStockSummary(warehouse);
  res.json({ rows });
}
