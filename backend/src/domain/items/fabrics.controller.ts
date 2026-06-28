import type { Request, Response } from 'express';
import { CreateFabricSchema, UpdateFabricSchema } from './items.schemas.js';
import * as svc from './fabrics.service.js';
import { auditLog } from '../../middleware/audit.js';

export async function listFabrics(req: Request, res: Response): Promise<void> {
  res.json(await svc.listFabrics());
}

export async function createFabric(req: Request, res: Response): Promise<void> {
  try {
    const data = CreateFabricSchema.parse(req.body);
    const fabric = await svc.createFabric(data);
    await auditLog(req, 'create_fabric', 'fabric', fabric.id, null, fabric, { severity: 'low' });
    res.status(201).json(fabric);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'internal_error' });
  }
}

export async function updateFabric(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    const data = UpdateFabricSchema.parse(req.body);
    const before = await svc.getFabric(id);
    if (!before) { res.status(404).json({ error: 'not_found' }); return; }
    const after = await svc.updateFabric(id, data);
    await auditLog(req, 'update_fabric', 'fabric', id, before, after, { severity: 'low' });
    res.json(after);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'internal_error' });
  }
}

const DELETE_ERR_MAP: Record<string, { status: number; message: string }> = {
  FABRIC_NOT_FOUND: { status: 404, message: 'الخامة غير موجودة' },
  FABRIC_IN_USE: {
    status: 409,
    message: 'لا يمكن حذف هذه الخامة لأنها مستخدمة في اتواب أو لوطات أو أسعار أو جرد. يمكنك تعطيلها بدلاً من ذلك.',
  },
};

export async function deleteFabric(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  try {
    const before = await svc.getFabric(id);
    if (!before) { res.status(404).json({ error: 'not_found', message: DELETE_ERR_MAP.FABRIC_NOT_FOUND!.message }); return; }
    await svc.deleteFabric(id);
    await auditLog(req, 'delete_fabric', 'fabric', id, before, null, { severity: 'medium' });
    res.status(204).send();
  } catch (err) {
    if (err instanceof Error && DELETE_ERR_MAP[err.message]) {
      const { status, message } = DELETE_ERR_MAP[err.message]!;
      res.status(status).json({ error: err.message, message });
      return;
    }
    res.status(500).json({ error: err instanceof Error ? err.message : 'internal_error' });
  }
}
