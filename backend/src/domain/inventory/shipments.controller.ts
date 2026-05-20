import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import {
  AcceptShipmentSchema,
  AddShipmentRollSchema,
  CreateShipmentDraftSchema,
  ListFactoryRollsQuerySchema,
  ListShipmentsQuerySchema,
  ReviewShipmentLineSchema,
} from './inventory.schemas.js';
import * as svc from './shipments.service.js';

const ERR_MAP: Record<string, { status: number; message: string }> = {
  SHIPMENT_NOT_FOUND: { status: 404, message: 'الطلبية غير موجودة' },
  LINE_NOT_FOUND: { status: 404, message: 'السطر غير موجود' },
  SHIPMENT_NOT_DRAFT: { status: 409, message: 'لا يمكن تعديل طلبية بعد الإرسال' },
  SHIPMENT_FORBIDDEN: { status: 403, message: 'غير مسموح بالتعديل على هذه الطلبية' },
  SHIPMENT_NOT_REVIEWABLE: { status: 409, message: 'الطلبية ليست قيد المراجعة' },
  SHIPMENT_EMPTY: { status: 422, message: 'الطلبية فارغة' },
  REVIEW_INCOMPLETE: { status: 409, message: 'هناك سطور لم تتم مراجعتها بعد' },
  LINE_ALREADY_REVIEWED: { status: 409, message: 'تمت مراجعة هذا السطر بالفعل' },
  ROLL_NOT_FOUND: { status: 404, message: 'هذا التوب غير موجود' },
  ROLL_NOT_IN_FACTORY: { status: 409, message: 'هذا التوب ليس في مخزن المصنع' },
  ROLL_NOT_AVAILABLE: { status: 409, message: 'هذا التوب غير متاح' },
  ROLL_ALREADY_IN_SHIPMENT: { status: 409, message: 'هذا التوب مضاف بالفعل إلى طلبية أخرى' },
  MISSING_FABRIC_PRICE: { status: 422, message: 'يجب إدخال سعر مرجعي لكل خامة مقبولة' },
};

function handleDomainError(e: unknown, res: Response): boolean {
  if (e instanceof ZodError) {
    res.status(400).json({
      error: 'validation_error',
      message: e.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '),
      issues: e.issues,
    });
    return true;
  }
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

export async function createDraft(req: Request, res: Response): Promise<void> {
  try {
    const data = CreateShipmentDraftSchema.parse(req.body);
    const shipment = await svc.createDraft(actorId(req), data);
    res.status(201).json(shipment);
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function addRoll(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  try {
    const data = AddShipmentRollSchema.parse(req.body);
    const result = await svc.addRoll(id, actorId(req), data);
    res.status(201).json(result);
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function removeLine(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const lineId = Number(req.params.lineId);
  try {
    await svc.removeLine(id, lineId, actorId(req));
    res.status(204).send();
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function deleteDraft(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  try {
    await svc.deleteDraft(id, actorId(req));
    res.status(204).send();
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function submit(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  try {
    const updated = await svc.submit(id, actorId(req));
    res.json(updated);
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function reviewLine(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const lineId = Number(req.params.lineId);
  try {
    const data = ReviewShipmentLineSchema.parse(req.body);
    const updated = await svc.reviewLine(id, lineId, actorId(req), data.action, data.reject_reason_ar);
    res.json(updated);
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function acceptShipment(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  try {
    const data = AcceptShipmentSchema.parse(req.body);
    const updated = await svc.acceptShipment(id, actorId(req), data);
    res.json(updated);
  } catch (e) {
    if (e instanceof Error && e.message === 'METER_ROLL_MISSING_LENGTH') {
      const barcodes = (e as Error & { barcodes?: string[] }).barcodes ?? [];
      res.status(422).json({
        error: 'METER_ROLL_MISSING_LENGTH',
        message: `توبات بخامة (متر) بدون طول محدد — يرجى تحديث الطول أولاً: ${barcodes.join('، ')}`,
        barcodes,
      });
      return;
    }
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function listShipments(req: Request, res: Response): Promise<void> {
  try {
    const filters = ListShipmentsQuerySchema.parse(req.query);
    res.json(await svc.listShipments(filters));
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function getShipment(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const shipment = await svc.getShipment(id);
  if (!shipment) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json(shipment);
}

export async function listFactoryRolls(req: Request, res: Response): Promise<void> {
  try {
    const filters = ListFactoryRollsQuerySchema.parse(req.query);
    const rolls = await svc.listFactoryRolls(filters);
    res.json(rolls);
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}
