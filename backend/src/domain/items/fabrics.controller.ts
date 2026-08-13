import type { Request, Response } from 'express';
import { CreateFabricSchema, UpdateFabricSchema, ListFabricsQuerySchema } from './items.schemas.js';
import * as svc from './fabrics.service.js';
import { auditLog } from '../../middleware/audit.js';

function actorOf(req: Request): svc.FabricActor {
  return {
    userId: req.user!.sub,
    ip: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}

export async function listFabrics(req: Request, res: Response): Promise<void> {
  try {
    const { archived } = ListFabricsQuerySchema.parse(req.query);
    res.json(await svc.listFabrics(archived));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'bad_request' });
  }
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

const FABRIC_NOT_FOUND_MSG = 'الخامة غير موجودة';

/**
 * What deleting this material would do — so the UI can tell the user before
 * they confirm, instead of after.
 */
export async function getFabricUsage(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    const fabric = await svc.getFabric(id);
    if (!fabric) { res.status(404).json({ error: 'not_found', message: FABRIC_NOT_FOUND_MSG }); return; }
    res.json(await svc.getFabricUsage(id));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'internal_error' });
  }
}

/**
 * Deletes the material permanently when nothing real is attached to it,
 * otherwise archives it. Responds 200 with the outcome — the caller needs to
 * know which of the two happened.
 */
export async function deleteFabric(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  try {
    const result = await svc.deleteFabric(id, actorOf(req));
    res.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === 'FABRIC_NOT_FOUND') {
      res.status(404).json({ error: 'not_found', message: FABRIC_NOT_FOUND_MSG });
      return;
    }
    res.status(500).json({ error: err instanceof Error ? err.message : 'internal_error' });
  }
}

export async function restoreFabric(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  try {
    res.json(await svc.restoreFabric(id, actorOf(req)));
  } catch (err) {
    if (err instanceof Error && err.message === 'FABRIC_NOT_FOUND') {
      res.status(404).json({ error: 'not_found', message: FABRIC_NOT_FOUND_MSG });
      return;
    }
    res.status(500).json({ error: err instanceof Error ? err.message : 'internal_error' });
  }
}
