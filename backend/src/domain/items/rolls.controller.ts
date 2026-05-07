import type { Request, Response } from 'express';
import { CreateRollSchema, UpdateRollSchema, ListRollsQuerySchema } from './items.schemas.js';
import * as svc from './rolls.service.js';
import { auditLog } from '../../middleware/audit.js';

export async function listRolls(req: Request, res: Response): Promise<void> {
  const filters = ListRollsQuerySchema.parse(req.query);
  res.json(await svc.listRolls(filters));
}

export async function createRoll(req: Request, res: Response): Promise<void> {
  const data = CreateRollSchema.parse(req.body);
  let roll;
  try {
    roll = await svc.createRoll(data);
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'NO_DEFAULT_PRICE') {
      res.status(422).json({
        error: 'لا يوجد سعر افتراضي لهذا الصنف واللون، يجب تحديد السعر يدوياً',
      });
      return;
    }
    throw e;
  }
  await auditLog(req, 'create_roll', 'roll', roll.id, null, roll, { severity: 'medium' });
  res.status(201).json(roll);
}

export async function updateRoll(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const data = UpdateRollSchema.parse(req.body);
  const before = await svc.getRoll(id);
  if (!before) { res.status(404).json({ error: 'not_found' }); return; }
  const after = await svc.updateRoll(id, data);
  await auditLog(req, 'update_roll', 'roll', id, before, after, { severity: 'medium' });
  res.json(after);
}

export async function findByBarcode(req: Request, res: Response): Promise<void> {
  const roll = await svc.findByBarcode(req.params.barcode as string);
  if (!roll) { res.status(404).json({ error: 'not_found' }); return; }
  res.json(roll);
}

export async function togglePosVisibility(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const before = await svc.getRoll(id);
  if (!before) { res.status(404).json({ error: 'not_found' }); return; }
  const after = await svc.togglePosVisibility(id);
  await auditLog(
    req,
    'toggle_pos_visibility',
    'roll',
    id,
    { is_visible_at_pos: before.is_visible_at_pos },
    { is_visible_at_pos: after?.is_visible_at_pos },
    { severity: 'low' },
  );
  res.json(after);
}
