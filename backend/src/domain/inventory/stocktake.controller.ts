import type { Request, Response } from 'express';
import {
  RecordAggregateSchema,
  RecordScanSchema,
  StartStocktakeSchema,
} from './inventory.schemas.js';
import * as svc from './stocktake.service.js';

const ERR_MAP: Record<string, { status: number; message: string }> = {
  STOCKTAKE_NOT_FOUND: { status: 404, message: 'الجرد غير موجود' },
  STOCKTAKE_NOT_OPEN: { status: 409, message: 'الجرد ليس مفتوحاً' },
  SCAN_REQUIRES_ROLL_LEVEL_MODE: { status: 409, message: 'الجرد بالمسح يتطلب وضع التوب الفردي' },
  AGGREGATE_REQUIRES_AGGREGATE_MODE: { status: 409, message: 'الإدخال التجميعي يتطلب وضع التجميع' },
  ROLL_NOT_FOUND: { status: 404, message: 'التوب غير موجود' },
  ROLL_NOT_IN_STOCKTAKE: { status: 409, message: 'هذا التوب ليس ضمن الجرد الحالي' },
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

export async function start(req: Request, res: Response): Promise<void> {
  const data = StartStocktakeSchema.parse(req.body);
  const stocktake = await svc.startStocktake(
    actorId(req),
    data.mode,
    data.warehouse,
    data.notes_ar ?? null,
  );
  res.status(201).json(stocktake);
}

export async function scan(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const data = RecordScanSchema.parse(req.body);
  try {
    const result = await svc.recordScan(id, actorId(req), data.barcode);
    res.json(result);
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function aggregate(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const data = RecordAggregateSchema.parse(req.body);
  try {
    const line = await svc.recordAggregate(
      id,
      actorId(req),
      data.fabric_id,
      data.color_id,
      data.actual_count,
      data.actual_weight_kg,
    );
    res.json(line);
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function complete(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  try {
    const result = await svc.completeStocktake(id, actorId(req));
    res.json(result);
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function list(_req: Request, res: Response): Promise<void> {
  res.json(await svc.listStocktakes());
}

export async function get(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const stocktake = await svc.getStocktake(id);
  if (!stocktake) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json(stocktake);
}
