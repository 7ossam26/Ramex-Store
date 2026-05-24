import type { Request, Response } from 'express';
import {
  ProcessReturnSchema,
  ProcessExchangeSchema,
  ListReturnsQuerySchema,
  ReturnFromScanSchema,
} from './returns.schemas.js';
import * as svc from './returnsService.js';
import { buildReturnSlipPdf } from '../../lib/pdf/return-slip.js';

const ERR_MAP: Record<string, { status: number; message: string }> = {
  INVOICE_LINE_NOT_FOUND: { status: 404, message: 'لم يتم العثور على سطر الفاتورة الأصلي' },
  INVOICE_NOT_FOUND: { status: 404, message: 'الفاتورة غير موجودة' },
  INVOICE_NOT_COMPLETED: { status: 409, message: 'لا يمكن الإرجاع — الفاتورة ليست مكتملة' },
  RETURN_WINDOW_EXPIRED: { status: 409, message: 'انتهت مدة الإرجاع' },
  RETURN_LINE_NOT_ON_INVOICE: { status: 400, message: 'سطر الإرجاع غير موجود في الفاتورة الأصلية' },
  RETURN_LINE_ROLL_MISMATCH: { status: 400, message: 'التوب لا يطابق سطر الفاتورة' },
  ROLL_NOT_SOLD: { status: 409, message: 'التوب ليس في حالة مباع — لا يمكن إرجاعه' },
  ROLL_NOT_FOUND: { status: 404, message: 'التوب غير موجود' },
  ROLL_NOT_AVAILABLE: { status: 409, message: 'التوب غير متاح' },
  ROLL_NOT_VISIBLE_AT_POS: { status: 409, message: 'التوب مخفي عن نقطة البيع' },
  ROLL_NOT_AT_SHOP: { status: 409, message: 'التوب ليس بمخزن المحل' },
  DUPLICATE_ROLL_IN_CART: { status: 400, message: 'لا يمكن تكرار نفس التوب في السلة' },
  NO_DEFAULT_BANK_ACCOUNT: { status: 500, message: 'لا يوجد حساب بنكي افتراضي' },
  NO_PAYMENT_PROVIDED: { status: 400, message: 'يجب إدخال طريقة دفع' },
  OVERPAYMENT_NOT_ALLOWED: { status: 400, message: 'مجموع الدفعات أكبر من الإجمالي' },
  DEPOSIT_BELOW_MIN: { status: 400, message: 'العربون أقل من الحد الأدنى' },
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

export async function processReturn(req: Request, res: Response): Promise<void> {
  const data = ProcessReturnSchema.parse(req.body);
  try {
    const ret = await svc.processReturn({
      originalInvoiceId: data.originalInvoiceId,
      lines: data.lines,
      refundMethod: data.refundMethod,
      bankAccountId: data.bankAccountId ?? null,
      reference: data.reference ?? null,
      chequeDetails: data.chequeDetails ?? null,
      notesAr: data.notesAr ?? null,
      actorUserId: actorId(req),
      actorRole: String(req.user!.role),
      ownerWindowOverride: data.ownerWindowOverride,
      shiftId: req.shiftId ?? null,
    });
    res.status(201).json(ret);
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function processExchange(req: Request, res: Response): Promise<void> {
  const data = ProcessExchangeSchema.parse(req.body);
  try {
    const result = await svc.processExchange({
      originalInvoiceId: data.originalInvoiceId,
      lines: data.lines,
      refundMethod: data.refundMethod,
      bankAccountId: data.bankAccountId ?? null,
      reference: data.reference ?? null,
      chequeDetails: data.chequeDetails ?? null,
      notesAr: data.notesAr ?? null,
      actorUserId: actorId(req),
      actorRole: String(req.user!.role),
      ownerWindowOverride: data.ownerWindowOverride,
      newCartLines: data.newCartLines,
      newCartPayments: data.newCartPayments,
      newCartTargetFinal: data.newCartTargetFinal ?? null,
      newCartNotesAr: data.newCartNotesAr ?? null,
    });
    res.status(201).json(result);
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function listReturns(req: Request, res: Response): Promise<void> {
  const q = ListReturnsQuerySchema.parse(req.query);
  res.json(await svc.listReturns(q));
}

export async function getReturn(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const detail = await svc.getReturnDetail(id);
  if (!detail) {
    res.status(404).json({ error: 'RETURN_NOT_FOUND', message: 'الإرجاع غير موجود' });
    return;
  }
  res.json(detail);
}

export async function getReturnSlipPdf(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const detail = await svc.getReturnDetail(id);
  if (!detail) {
    res.status(404).json({ error: 'RETURN_NOT_FOUND', message: 'الإرجاع غير موجود' });
    return;
  }
  const buf = await buildReturnSlipPdf(detail);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${detail.return_no}.pdf"`);
  res.end(buf);
}

// Phase 6 — Return on Scan

export async function getScanPreview(req: Request, res: Response): Promise<void> {
  const rollId = Number(req.params.rollId);
  if (!rollId || !Number.isFinite(rollId)) {
    res.status(400).json({ error: 'INVALID_ROLL_ID', message: 'معرّف التوب غير صالح' });
    return;
  }
  const meta = await svc.getRollSaleMeta(rollId);
  if (!meta) {
    res.status(404).json({ error: 'ROLL_NOT_SOLD', message: 'التوب ليس في حالة مباع أو غير موجود' });
    return;
  }
  res.json(meta);
}

export async function createScanReturn(req: Request, res: Response): Promise<void> {
  const data = ReturnFromScanSchema.parse(req.body);
  try {
    const result = await svc.createReturnFromRollScan({
      rollId: data.rollId,
      refundMethod: data.refundMethod,
      bankAccountId: data.bankAccountId ?? null,
      reference: data.reference ?? null,
      chequeDetails: data.chequeDetails ?? null,
      actorUserId: actorId(req),
      shiftId: req.shiftId ?? null,
    });
    res.status(201).json(result);
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}
