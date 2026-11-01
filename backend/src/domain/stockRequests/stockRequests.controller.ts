import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import {
  AddRequestItemsSchema,
  AvailableRollsQuerySchema,
  CreateStockRequestSchema,
  ListStockRequestsQuerySchema,
  OptionalReasonSchema,
  ReasonSchema,
} from './stockRequests.schemas.js';
import * as svc from './stockRequests.service.js';

const ERR_MAP: Record<string, { status: number; message: string }> = {
  REQUEST_NOT_FOUND: { status: 404, message: 'الطلب غير موجود' },
  ITEM_NOT_FOUND: { status: 404, message: 'البند غير موجود في هذا الطلب' },
  ROLL_NOT_FOUND: { status: 404, message: 'أحد الأتواب المحددة غير موجود' },
  ROLL_NOT_IN_FACTORY: { status: 409, message: 'التوب ليس في مخزن المصنع' },
  ROLL_NOT_AVAILABLE: { status: 409, message: 'التوب غير متاح للطلب' },
  ROLL_MISSING_LENGTH: { status: 422, message: 'توب (متر) بدون طول محدد — لا يمكن طلبه' },
  ROLL_ALREADY_REQUESTED: { status: 409, message: 'التوب محجوز بالفعل لطلب آخر' },
  REQUEST_CANCELLED: { status: 409, message: 'هذا الطلب ملغي' },
  REPLACEMENT_NEEDS_ONE_ROLL: { status: 422, message: 'البديل يجب أن يكون توباً واحداً' },
  ITEM_NOT_REPLACEABLE: { status: 409, message: 'لا يمكن طلب بديل إلا لتوب غير متوفر أو مرفوض' },
  REPLACEMENT_ALREADY_EXISTS: { status: 409, message: 'تم طلب بديل لهذا البند بالفعل' },
  ITEM_BEING_PACKED: { status: 409, message: 'المصنع يجهز هذا التوب الآن — يجب إزالته من الشحنة أولاً' },
  ITEM_NOT_CANCELLABLE: { status: 409, message: 'لا يمكن إلغاء هذا البند في حالته الحالية' },
  ITEM_NOT_REQUESTED: { status: 409, message: 'هذا البند ليس في انتظار التجهيز' },
  REQUEST_HAS_PACKING_ITEMS: { status: 409, message: 'المصنع يجهز أتواباً من هذا الطلب الآن — لا يمكن إلغاء الطلب' },
  NOTHING_TO_CANCEL: { status: 409, message: 'لا توجد بنود قابلة للإلغاء' },
  REASON_REQUIRED: { status: 422, message: 'السبب مطلوب' },
  NOTHING_TO_PACK: { status: 409, message: 'لا توجد أتواب في انتظار التجهيز في هذا الطلب' },
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
    const barcodes = (e as Error & { barcodes?: string[] }).barcodes;
    if (barcodes && barcodes.length > 0) {
      res.status(status).json({ error: e.message, message: `${message}: ${barcodes.join('، ')}`, barcodes });
    } else {
      res.status(status).json({ error: e.message, message });
    }
    return true;
  }
  return false;
}

const actorId = (req: Request): number => Number(req.user!.sub);

function idParam(req: Request, name: string): number {
  const n = Number(req.params[name]);
  if (!Number.isInteger(n) || n <= 0) throw Object.assign(new Error('REQUEST_NOT_FOUND'), {});
  return n;
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const data = CreateStockRequestSchema.parse(req.body);
    res.status(201).json(await svc.createRequest(actorId(req), data));
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const filters = ListStockRequestsQuerySchema.parse(req.query);
    res.json(await svc.listRequests(filters, actorId(req)));
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function get(req: Request, res: Response): Promise<void> {
  try {
    const detail = await svc.getRequest(idParam(req, 'id'));
    if (!detail) {
      res.status(404).json({ error: 'REQUEST_NOT_FOUND', message: ERR_MAP.REQUEST_NOT_FOUND!.message });
      return;
    }
    res.json(detail);
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function addItems(req: Request, res: Response): Promise<void> {
  try {
    const data = AddRequestItemsSchema.parse(req.body);
    res.status(201).json(await svc.addItems(idParam(req, 'id'), actorId(req), data));
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function cancelItem(req: Request, res: Response): Promise<void> {
  try {
    const { reason_ar } = OptionalReasonSchema.parse(req.body ?? {});
    res.json(await svc.cancelItem(idParam(req, 'id'), idParam(req, 'itemId'), actorId(req), reason_ar ?? null));
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function cancelRequest(req: Request, res: Response): Promise<void> {
  try {
    const { reason_ar } = ReasonSchema.parse(req.body ?? {});
    res.json(await svc.cancelRequest(idParam(req, 'id'), actorId(req), reason_ar));
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function markUnavailable(req: Request, res: Response): Promise<void> {
  try {
    const { reason_ar } = ReasonSchema.parse(req.body ?? {});
    res.json(await svc.markUnavailable(idParam(req, 'id'), idParam(req, 'itemId'), actorId(req), reason_ar));
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function openDraft(req: Request, res: Response): Promise<void> {
  try {
    res.status(201).json(await svc.openDraftShipment(idParam(req, 'id'), actorId(req)));
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function availableRolls(req: Request, res: Response): Promise<void> {
  try {
    const filters = AvailableRollsQuerySchema.parse(req.query);
    res.json(await svc.listAvailableRolls(filters));
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function summary(_req: Request, res: Response): Promise<void> {
  res.json(await svc.getSummary());
}
