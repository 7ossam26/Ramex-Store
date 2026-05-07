import type { Request, Response } from 'express';
import {
  AddShipmentRollSchema,
  CreateShipmentDraftSchema,
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
  NO_DEFAULT_PRICE: { status: 422, message: 'لا يوجد سعر افتراضي لهذا الصنف واللون' },
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

export async function createDraft(req: Request, res: Response): Promise<void> {
  const data = CreateShipmentDraftSchema.parse(req.body);
  const shipment = await svc.createDraft(actorId(req), data);
  res.status(201).json(shipment);
}

export async function addRoll(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const data = AddShipmentRollSchema.parse(req.body);
  try {
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
  const data = ReviewShipmentLineSchema.parse(req.body);
  try {
    const updated = await svc.reviewLine(
      id,
      lineId,
      actorId(req),
      data.action,
      data.reject_reason_ar,
    );
    res.json(updated);
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function finalize(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  try {
    const updated = await svc.finalizeReview(id, actorId(req));
    res.json(updated);
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function listShipments(req: Request, res: Response): Promise<void> {
  const filters = ListShipmentsQuerySchema.parse(req.query);
  res.json(await svc.listShipments(filters));
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
