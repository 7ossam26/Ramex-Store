import type { Request, Response } from 'express';
import { CreateAdjustmentSchema } from './inventory.schemas.js';
import * as svc from './adjustments.service.js';

const ERR_MAP: Record<string, { status: number; message: string }> = {
  ROLL_NOT_FOUND: { status: 404, message: 'التوب غير موجود' },
};

function handleDomainError(e: unknown, res: Response): boolean {
  if (e instanceof Error && ERR_MAP[e.message]) {
    const { status, message } = ERR_MAP[e.message]!;
    res.status(status).json({ error: e.message, message });
    return true;
  }
  return false;
}

export async function createAdjustment(req: Request, res: Response): Promise<void> {
  const data = CreateAdjustmentSchema.parse(req.body);
  try {
    const movement = await svc.createAdjustment(Number(req.user!.sub), data);
    res.status(201).json(movement);
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function listAdjustments(_req: Request, res: Response): Promise<void> {
  res.json(await svc.listAdjustments());
}
