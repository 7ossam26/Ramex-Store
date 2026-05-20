import type { Request, Response } from 'express';
import {
  CancelOpenInvoiceSchema,
  CreateSaleSchema,
  FinalPaymentSchema,
  ListInvoicesQuerySchema,
  PdfVariantSchema,
  SalePreviewSchema,
  VoidInvoiceSchema,
} from './sales.schemas.js';
import * as svc from './invoices.service.js';
import * as openSvc from './openInvoices.service.js';
import { buildInvoicePdf } from '../../lib/pdf/invoice.js';

const ERR_MAP: Record<string, { status: number; message: string }> = {
  CUSTOMER_NOT_FOUND: { status: 404, message: 'العميل غير موجود' },
  INVOICE_NOT_FOUND: { status: 404, message: 'الفاتورة غير موجودة' },
  ROLL_NOT_FOUND: { status: 404, message: 'التوب غير موجود' },
  ROLL_NOT_AVAILABLE: { status: 409, message: 'هذا التوب غير متاح للبيع' },
  ROLL_NOT_VISIBLE_AT_POS: { status: 409, message: 'التوب مخفي عن نقطة البيع' },
  ROLL_NOT_AT_SHOP: { status: 409, message: 'التوب ليس داخل مخزن المحل' },
  ROLL_NOT_AT_FACTORY: { status: 409, message: 'هذا التوب ليس داخل مخزن المصنع' },
  DUPLICATE_ROLL_IN_CART: { status: 400, message: 'لا يمكن تكرار نفس التوب في الفاتورة' },
  LINE_DISCOUNT_EXCEEDS_PRICE: { status: 400, message: 'الخصم أكبر من سعر التوب' },
  TARGET_FINAL_GREATER_THAN_SUBTOTAL: {
    status: 400,
    message: 'سعر البيع المطلوب أكبر من إجمالي الفاتورة (لا يُسمح بزيادة)',
  },
  NO_PAYMENT_PROVIDED: { status: 400, message: 'يجب إدخال طريقة دفع واحدة على الأقل' },
  OVERPAYMENT_NOT_ALLOWED: { status: 400, message: 'مجموع الدفعات أكبر من الإجمالي' },
  DEPOSIT_BELOW_MIN: { status: 400, message: 'العربون أقل من الحد الأدنى المطلوب' },
  NO_DEFAULT_BANK_ACCOUNT: { status: 500, message: 'لا يوجد حساب بنكي افتراضي' },
  INVOICE_NOT_VOIDABLE: { status: 409, message: 'لا يمكن إلغاء هذه الفاتورة' },
  VOID_TIME_LIMIT_EXCEEDED: { status: 409, message: 'انتهت فترة السماح بإلغاء الفاتورة' },
  INVOICE_NOT_OPEN: { status: 409, message: 'الفاتورة ليست في حالة مفتوحة' },
  INVOICE_NOT_PENDING_PICKUP: { status: 409, message: 'الفاتورة ليست بانتظار الاستلام' },
  INVOICE_NOT_CANCELLABLE: { status: 409, message: 'لا يمكن إلغاء هذه الفاتورة في حالتها الحالية' },
  FINAL_PAYMENT_BELOW_BALANCE: { status: 400, message: 'الدفعة النهائية أقل من الباقي المطلوب' },
  PARTIAL_REFUND_INVALID: { status: 400, message: 'مبلغ الاسترجاع الجزئي غير صحيح' },
  PARTIAL_REFUND_EXCEEDS_PAID: { status: 400, message: 'مبلغ الاسترجاع أكبر من المدفوع' },
  REFUND_METHOD_REQUIRED: { status: 400, message: 'طريقة الاسترجاع مطلوبة' },
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

export async function createSale(req: Request, res: Response): Promise<void> {
  const data = CreateSaleSchema.parse(req.body);
  try {
    const invoice = await svc.createSale(actorId(req), data);
    res.status(201).json(invoice);
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function previewSale(req: Request, res: Response): Promise<void> {
  const data = SalePreviewSchema.parse(req.body);
  try {
    const result = await svc.previewSale(data);
    res.json(result);
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function voidInvoice(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const data = VoidInvoiceSchema.parse(req.body);
  try {
    const result = await svc.voidInvoice(
      id,
      actorId(req),
      String(req.user!.role),
      data.reason_ar,
      data.approved_by_owner ?? false,
    );
    res.json(result);
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function getInvoice(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const detail = await svc.getInvoiceDetail(id);
  if (!detail) {
    res.status(404).json({ error: 'INVOICE_NOT_FOUND', message: 'الفاتورة غير موجودة' });
    return;
  }
  res.json(detail);
}

export async function listInvoices(req: Request, res: Response): Promise<void> {
  const query = ListInvoicesQuerySchema.parse(req.query);
  res.json(await svc.listInvoices(query));
}

export async function addFinalPayment(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const data = FinalPaymentSchema.parse(req.body);
  try {
    const result = await openSvc.addFinalPayment(id, actorId(req), data.payments);
    res.json(result);
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function markDelivered(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  try {
    const result = await openSvc.markDelivered(id, actorId(req));
    res.json(result);
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function cancelOpenInvoice(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const data = CancelOpenInvoiceSchema.parse(req.body);
  try {
    const result = await openSvc.cancelOpenInvoice(id, actorId(req), {
      depositHandling: data.deposit_handling,
      refundMethod: data.refund_method ?? null,
      partialRefundAmount:
        data.partial_refund_amount == null ? null : Number(data.partial_refund_amount),
      bankAccountId: data.bank_account_id ?? null,
      notesAr: data.notes_ar,
    });
    res.json(result);
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function getStatusHistory(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  res.json(await openSvc.getStatusHistory(id));
}

export async function listOpenInvoices(_req: Request, res: Response): Promise<void> {
  res.json(await openSvc.listOpenInvoices());
}

export async function listPendingPickup(_req: Request, res: Response): Promise<void> {
  res.json(await openSvc.listPendingPickup());
}

export async function getInvoicePdf(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const { variant } = PdfVariantSchema.parse(req.query);
  const detail = await svc.getInvoiceDetail(id);
  if (!detail) {
    res.status(404).json({ error: 'INVOICE_NOT_FOUND', message: 'الفاتورة غير موجودة' });
    return;
  }
  const buf = await buildInvoicePdf(detail, variant);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${detail.invoice_no}.pdf"`);
  res.end(buf);
}
