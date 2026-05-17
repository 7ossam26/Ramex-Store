import type { Request, Response } from 'express';
import { getStockSummary } from './stockSummary.service.js';

export async function stockSummary(req: Request, res: Response): Promise<void> {
  const rows = await getStockSummary();
  res.json({ rows });
}
