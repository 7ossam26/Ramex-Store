import type { Request, Response } from 'express';
import { UpsertPriceSchema } from './items.schemas.js';
import * as svc from './prices.service.js';
import { auditLog } from '../../middleware/audit.js';

export async function listPrices(req: Request, res: Response): Promise<void> {
  res.json(await svc.listPrices());
}

export async function upsertPrice(req: Request, res: Response): Promise<void> {
  const data = UpsertPriceSchema.parse(req.body);
  const before = await svc.getPrice(data.fabric_id, data.color_id);
  const price = await svc.upsertPrice(data);
  await auditLog(req, 'upsert_price', 'fabric_color_price', price.id, before ?? null, price, {
    severity: 'medium',
  });
  res.status(before ? 200 : 201).json(price);
}
