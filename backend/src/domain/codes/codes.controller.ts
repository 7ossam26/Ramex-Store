import type { Request, Response } from 'express';
import { auditLog } from '../../middleware/audit.js';
import * as svc from './codes.service.js';
import {
  ListCodesQuerySchema,
  SoftDeleteBodySchema,
  CreateGradeSchema,
  CreateColorCodeSchema,
  CreateCompositionSchema,
  CreateBrandSchema,
  CreateSupplierSchema,
  UpdateGradeSchema,
  UpdateColorCodeSchema,
  UpdateCompositionSchema,
  UpdateBrandSchema,
  UpdateSupplierSchema,
} from './codes.schemas.js';
import type { CodeEntityName } from './codes.types.js';
import { z } from 'zod';

const CREATE_SCHEMAS: Record<CodeEntityName, z.ZodSchema> = {
  grades:       CreateGradeSchema,
  colors:       CreateColorCodeSchema,
  compositions: CreateCompositionSchema,
  brands:       CreateBrandSchema,
  suppliers:    CreateSupplierSchema,
};

const UPDATE_SCHEMAS: Record<CodeEntityName, z.ZodSchema> = {
  grades:       UpdateGradeSchema,
  colors:       UpdateColorCodeSchema,
  compositions: UpdateCompositionSchema,
  brands:       UpdateBrandSchema,
  suppliers:    UpdateSupplierSchema,
};

function getEntity(req: Request, res: Response): CodeEntityName | null {
  const entity = req.params.entity as string;
  if (!svc.isValidEntity(entity)) {
    res.status(404).json({ error: 'unknown_entity' });
    return null;
  }
  return entity;
}

export async function listEntities(req: Request, res: Response): Promise<void> {
  const entity = getEntity(req, res);
  if (!entity) return;
  const { active } = ListCodesQuerySchema.parse(req.query);
  res.json(await svc.listCodes(entity, active));
}

export async function createEntity(req: Request, res: Response): Promise<void> {
  const entity = getEntity(req, res);
  if (!entity) return;
  const schema = CREATE_SCHEMAS[entity];
  const data = schema.parse(req.body);
  const row = await svc.createCode(entity, data, req.user!.sub);
  await auditLog(req, `create_${entity}`, entity, (row as { id: number }).id, null, row, { severity: 'low' });
  res.status(201).json(row);
}

export async function updateEntity(req: Request, res: Response): Promise<void> {
  const entity = getEntity(req, res);
  if (!entity) return;
  const id = Number(req.params.id);
  const schema = UPDATE_SCHEMAS[entity];
  const data = schema.parse(req.body);
  const before = await svc.getCode(entity, id);
  if (!before) { res.status(404).json({ error: 'not_found' }); return; }
  const after = await svc.updateCode(entity, id, data);
  await auditLog(req, `update_${entity}`, entity, id, before, after, { severity: 'low' });
  res.json(after);
}

export async function softDeleteEntity(req: Request, res: Response): Promise<void> {
  const entity = getEntity(req, res);
  if (!entity) return;
  const id = Number(req.params.id);
  const { force } = SoftDeleteBodySchema.parse(req.body);

  const before = await svc.getCode(entity, id);
  if (!before) { res.status(404).json({ error: 'not_found' }); return; }
  if ((before as { is_active: boolean }).is_active === false) {
    res.status(400).json({ error: 'already_inactive' }); return;
  }

  const referenced = await svc.isReferencedByActiveRoll(entity, id);
  if (referenced && !force) {
    res.status(409).json({
      error: 'referenced_by_active_roll',
      message: 'هذا الكود مرتبط بتوبات نشطة. أرسل force=true للمتابعة.',
    });
    return;
  }

  await svc.softDeleteCode(entity, id);
  await auditLog(req, `soft_delete_${entity}`, entity, id, before, { is_active: false, force }, { severity: 'medium' });
  res.json({ success: true });
}

export async function restoreEntity(req: Request, res: Response): Promise<void> {
  const entity = getEntity(req, res);
  if (!entity) return;
  const id = Number(req.params.id);
  const before = await svc.getCode(entity, id);
  if (!before) { res.status(404).json({ error: 'not_found' }); return; }
  const after = await svc.restoreCode(entity, id);
  await auditLog(req, `restore_${entity}`, entity, id, before, after, { severity: 'low' });
  res.json(after);
}
