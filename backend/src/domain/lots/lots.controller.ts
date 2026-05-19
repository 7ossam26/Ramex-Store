import type { Request, Response } from 'express';
import { CreateLotSchema, UpdateLotSchema, ListLotsQuerySchema } from './lots.schemas.js';
import * as svc from './lots.service.js';
import { auditLog } from '../../middleware/audit.js';

export async function listLots(req: Request, res: Response): Promise<void> {
  const filters = ListLotsQuerySchema.parse(req.query);
  res.json(await svc.listLots(filters));
}

export async function getLot(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const lot = await svc.getLot(id);
  if (!lot) { res.status(404).json({ error: 'not_found' }); return; }
  res.json(lot);
}

export async function createLot(req: Request, res: Response): Promise<void> {
  const data = CreateLotSchema.parse(req.body);
  try {
    const lot = await svc.createLot(data);
    await auditLog(req, 'create_lot', 'lot', lot.id, null, lot, { severity: 'low' });
    res.status(201).json(lot);
  } catch (e: unknown) {
    if (e instanceof Error) {
      if (e.message === 'FABRIC_NOT_FOUND') {
        res.status(404).json({ error: 'fabric_not_found', message: 'الخامة غير موجودة' });
        return;
      }
      if (e.message === 'COLOR_NOT_FOUND') {
        res.status(404).json({ error: 'color_not_found', message: 'اللون غير موجود' });
        return;
      }
    }
    throw e;
  }
}

export async function updateLot(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const data = UpdateLotSchema.parse(req.body);
  const before = await svc.getLot(id);
  if (!before) { res.status(404).json({ error: 'not_found' }); return; }
  const after = await svc.updateLot(id, data);
  await auditLog(req, 'update_lot', 'lot', id, before, after, { severity: 'low' });
  res.json(after);
}
