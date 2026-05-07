import type { Request, Response } from 'express';
import { CreateColorSchema, UpdateColorSchema } from './items.schemas.js';
import * as svc from './colors.service.js';
import { auditLog } from '../../middleware/audit.js';

export async function listColors(req: Request, res: Response): Promise<void> {
  res.json(await svc.listColors());
}

export async function createColor(req: Request, res: Response): Promise<void> {
  const data = CreateColorSchema.parse(req.body);
  const color = await svc.createColor(data);
  await auditLog(req, 'create_color', 'color', color.id, null, color, { severity: 'low' });
  res.status(201).json(color);
}

export async function updateColor(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const data = UpdateColorSchema.parse(req.body);
  const before = await svc.getColor(id);
  if (!before) { res.status(404).json({ error: 'not_found' }); return; }
  const after = await svc.updateColor(id, data);
  await auditLog(req, 'update_color', 'color', id, before, after, { severity: 'low' });
  res.json(after);
}
