import type { Request, Response } from 'express';
import { StockMovementsQuerySchema } from './inventory.schemas.js';
import * as svc from './stockMovements.service.js';

export async function listStockMovements(req: Request, res: Response): Promise<void> {
  const filters = StockMovementsQuerySchema.parse(req.query);
  const result = await svc.listStockMovements(filters);
  res.json(result);
}
