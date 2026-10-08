import type { Request, Response } from 'express';
import {
  RecordAggregateSchema,
  RecordScanSchema,
  ResolveStocktakeSchema,
  StartStocktakeSchema,
  UpdateStocktakeLineSchema,
} from './inventory.schemas.js';
import * as svc from './stocktake.service.js';
import { ROLL_IN_TRANSIT_MESSAGE } from '../items/rollLock.js';

const ERR_MAP: Record<string, { status: number; message: string }> = {
  STOCKTAKE_NOT_FOUND: { status: 404, message: 'الجرد غير موجود' },
  STOCKTAKE_NOT_OPEN: { status: 409, message: 'الجرد ليس مفتوحاً' },
  STOCKTAKE_NOT_COMPLETED: { status: 409, message: 'لا يمكن معالجة الفروقات قبل إنهاء الجرد' },
  STOCKTAKE_ALREADY_OPEN: { status: 409, message: 'يوجد جرد مفتوح لهذا المخزن — أكمله أو ألغه أولاً' },
  STOCKTAKE_PENDING_RESOLUTION: {
    status: 409,
    message: 'يوجد جرد منتهٍ لهذا المخزن به أتواب لم يُحدد لها إجراء — عالجها أولاً',
  },
  SCAN_REQUIRES_ROLL_LEVEL_MODE: { status: 409, message: 'الجرد بالمسح يتطلب وضع التوب الفردي' },
  AGGREGATE_REQUIRES_AGGREGATE_MODE: { status: 409, message: 'الإدخال التجميعي يتطلب وضع التجميع' },
  RESOLUTION_REQUIRES_ROLL_LEVEL: { status: 409, message: 'معالجة الفروقات متاحة لجرد التوب الفردي فقط' },
  ROLL_NOT_FOUND: { status: 404, message: 'التوب غير موجود' },
  ROLL_IN_TRANSIT: { status: 409, message: ROLL_IN_TRANSIT_MESSAGE },
  LINE_NOT_FOUND: { status: 404, message: 'السطر غير موجود في هذا الجرد' },
  LINE_NOT_SCANNED: { status: 409, message: 'لم يتم مسح هذا التوب بعد' },
  LINE_ALREADY_RESOLVED: { status: 409, message: 'تم تحديد إجراء لهذا التوب من قبل' },
  ACTION_NOT_ALLOWED: { status: 409, message: 'هذا الإجراء غير متاح لهذا التوب' },
  NOTES_REQUIRED: { status: 400, message: 'اكتب ملاحظة توضح سبب الإبقاء كما هو' },
  TARGET_WAREHOUSE_REQUIRED: { status: 400, message: 'اختر المخزن الموجود فيه التوب فعلياً' },
  INVALID_TARGET_WAREHOUSE: { status: 400, message: 'المخزن المختار هو نفس مخزن الجرد' },
  LINE_STALE: { status: 409, message: 'تغيّرت بيانات التوب منذ الجرد — حدّث الصفحة وراجعه' },
  DUPLICATE_LINE: { status: 400, message: 'نفس التوب مكرر في الطلب' },
};

function handleDomainError(e: unknown, res: Response): boolean {
  if (e instanceof Error && ERR_MAP[e.message]) {
    const { status, message } = ERR_MAP[e.message]!;
    const body: Record<string, unknown> = { error: e.message, message };
    if (e instanceof svc.StocktakeBlockedError) body.stocktake_id = e.stocktakeId;
    res.status(status).json(body);
    return true;
  }
  return false;
}

function actorId(req: Request): number {
  return Number(req.user!.sub);
}

export async function start(req: Request, res: Response): Promise<void> {
  const data = StartStocktakeSchema.parse(req.body);
  try {
    const stocktake = await svc.startStocktake(
      actorId(req),
      data.mode,
      data.warehouse,
      data.notes_ar ?? null,
    );
    res.status(201).json(stocktake);
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
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

export async function updateLine(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const lineId = Number(req.params.lineId);
  const data = UpdateStocktakeLineSchema.parse(req.body);
  try {
    res.json(await svc.updateLineMeasurement(id, lineId, actorId(req), data));
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function unscan(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const lineId = Number(req.params.lineId);
  try {
    await svc.unscanLine(id, lineId, actorId(req));
    res.status(204).end();
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

export async function cancel(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  try {
    res.json(await svc.cancelStocktake(id, actorId(req)));
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function resolve(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const data = ResolveStocktakeSchema.parse(req.body);
  try {
    res.json(await svc.resolveStocktakeLines(id, actorId(req), data.items));
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
