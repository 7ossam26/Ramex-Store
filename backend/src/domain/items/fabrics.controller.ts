import type { Request, Response } from 'express';
import { CreateFabricSchema, UpdateFabricSchema } from './items.schemas.js';
import * as svc from './fabrics.service.js';
import { auditLog } from '../../middleware/audit.js';

export async function listFabrics(req: Request, res: Response): Promise<void> {
  res.json(await svc.listFabrics());
}

export async function createFabric(req: Request, res: Response): Promise<void> {
  const data = CreateFabricSchema.parse(req.body);
  const fabric = await svc.createFabric(data);
  await auditLog(req, 'create_fabric', 'fabric', fabric.id, null, fabric, { severity: 'low' });
  res.status(201).json(fabric);
}

export async function updateFabric(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const data = UpdateFabricSchema.parse(req.body);
  const before = await svc.getFabric(id);
  if (!before) { res.status(404).json({ error: 'not_found' }); return; }
  const after = await svc.updateFabric(id, data);
  await auditLog(req, 'update_fabric', 'fabric', id, before, after, { severity: 'low' });
  res.json(after);
}
