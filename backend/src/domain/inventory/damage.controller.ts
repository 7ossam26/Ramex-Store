import type { Request, Response } from 'express';
import {
  ApproveDamageEventSchema,
  CreateDamageEventSchema,
  ListDamageEventsQuerySchema,
} from './inventory.schemas.js';
import * as svc from './damage.service.js';

const ERR_MAP: Record<string, { status: number; message: string }> = {
  ROLL_NOT_FOUND: { status: 404, message: 'التوب غير موجود' },
  EVENT_NOT_FOUND: { status: 404, message: 'الحدث غير موجود' },
  DISPOSITION_REQUIRED: { status: 422, message: 'يجب تحديد التصرف للتلف' },
  NO_APPROVAL_REQUIRED: { status: 409, message: 'لا يحتاج هذا الحدث لموافقة' },
  ALREADY_APPROVED: { status: 409, message: 'تمت الموافقة بالفعل' },
};

function handleDomainError(e: unknown, res: Response): boolean {
  if (e instanceof Error && ERR_MAP[e.message]) {
    const { status, message } = ERR_MAP[e.message]!;
    res.status(status).json({ error: e.message, message });
    return true;
  }
  return false;
}

function actorId(req: Request): number {
  return Number(req.user!.sub);
}

export async function createDamageEvent(req: Request, res: Response): Promise<void> {
  const data = CreateDamageEventSchema.parse(req.body);
  try {
    const event = await svc.createDamageEvent(actorId(req), data);
    res.status(201).json(event);
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function approveOrReject(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const data = ApproveDamageEventSchema.parse(req.body);
  try {
    if (data.approve) {
      const event = await svc.approveDamageEvent(id, actorId(req));
      res.json(event);
    } else {
      await svc.rejectDamageEvent(id, actorId(req));
      res.status(204).send();
    }
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function listDamageEvents(req: Request, res: Response): Promise<void> {
  const filters = ListDamageEventsQuerySchema.parse(req.query);
  res.json(await svc.listDamageEvents(filters));
}

export async function getDamageEvent(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const event = await svc.getDamageEvent(id);
  if (!event) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json(event);
}
