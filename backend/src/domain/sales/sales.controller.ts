import type { Request, Response } from 'express';
import {
  AddLinesSchema,
  CancelOpenInvoiceSchema,
  CreateSaleSchema,
  DepositRefundSchema,
  FinalPaymentSchema,
  ListChequesQuerySchema,
  ListInvoicesQuerySchema,
  SalePreviewSchema,
  VoidInvoiceSchema,
} from './sales.schemas.js';
import * as svc from './invoices.service.js';
import * as openSvc from './openInvoices.service.js';
import { auditLog } from '../../middleware/audit.js';
import { getSalesExport, salesToExport } from './salesExport.service.js';
import { buildReportExcel } from '../../lib/reports/excelExport.js';
import { formatCairo, cairoToday } from '../../lib/datetime/cairo.js';

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
  NO_DEFAULT_BANK_ACCOUNT: { status: 500, message: 'لا يوجد حساب بنكي افتراضي' },
  INVOICE_NOT_VOIDABLE: { status: 409, message: 'لا يمكن إلغاء هذه الفاتورة' },
  VOID_TIME_LIMIT_EXCEEDED: { status: 409, message: 'انتهت فترة السماح بإلغاء الفاتورة' },
  INVOICE_NOT_OPEN: { status: 409, message: 'الفاتورة ليست في حالة مفتوحة' },
  INVOICE_NOT_PENDING_PICKUP: { status: 409, message: 'الفاتورة ليست بانتظار الاستلام' },
  INVOICE_NOT_CANCELLABLE: { status: 409, message: 'لا يمكن إلغاء هذه الفاتورة في حالتها الحالية' },
  FINAL_PAYMENT_BELOW_BALANCE: { status: 400, message: 'الدفعة النهائية أقل من الباقي المطلوب' },
  DISCOUNT_EXCEEDS_BALANCE: { status: 400, message: 'الخصم أكبر من الباقي المطلوب' },
  INVALID_DISCOUNT: { status: 400, message: 'قيمة خصم غير صالحة' },
  PARTIAL_REFUND_INVALID: { status: 400, message: 'مبلغ الاسترجاع الجزئي غير صحيح' },
  PARTIAL_REFUND_EXCEEDS_PAID: { status: 400, message: 'مبلغ الاسترجاع أكبر من المدفوع' },
  REFUND_METHOD_REQUIRED: { status: 400, message: 'طريقة الاسترجاع مطلوبة' },
  NO_LINES_PROVIDED: { status: 400, message: 'يجب اختيار توب واحد على الأقل' },
  ROLL_LENGTH_MISSING: { status: 400, message: 'الطول بالمتر مفقود لهذا التوب' },
  LINE_PRICE_REQUIRED: { status: 400, message: 'سعر البيع النهائي مطلوب' },
  REFUND_AMOUNT_INVALID: { status: 400, message: 'مبلغ الاسترجاع غير صحيح' },
  NO_OVER_DEPOSIT: { status: 400, message: 'لا توجد دفعة زائدة لاستردادها' },
  REFUND_EXCEEDS_OVER_DEPOSIT: { status: 400, message: 'مبلغ الاسترجاع أكبر من فرق الدفعة المقدمة' },
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
    const invoice = await svc.createSale(actorId(req), data, req.shiftId ?? null);
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
      req.shiftId ?? null,
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
    const result = await openSvc.addFinalPayment(
      id,
      actorId(req),
      data.payments,
      req.shiftId ?? null,
      data.discountEgp ?? 0,
    );
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
      reference: data.reference ?? null,
      chequeDetails: data.cheque_details ?? null,
      notesAr: data.notes_ar,
      shiftId: req.shiftId ?? null,
    });
    res.json(result);
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function addOpenInvoiceLines(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const data = AddLinesSchema.parse(req.body);
  try {
    const result = await openSvc.addLinesToOpenInvoice(id, actorId(req), {
      lines: data.lines.map((l) => ({
        rollId: l.rollId,
        sellingPriceOverride: l.sellingPriceOverride ?? null,
        finalPricePerUnit: l.finalPricePerUnit ?? null,
        lineDiscountEgp: l.lineDiscountEgp ?? null,
      })),
      cartTargetFinal: data.cartTargetFinal ?? null,
    });
    res.json(result);
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function depositRefund(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const data = DepositRefundSchema.parse(req.body);
  try {
    const result = await openSvc.depositRefund(id, actorId(req), {
      amountEgp: Number(data.amountEgp),
      method: data.method,
      bankAccountId: data.bankAccountId ?? null,
      reference: data.reference ?? null,
      chequeDetails: data.chequeDetails ?? null,
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

export async function listCheques(req: Request, res: Response): Promise<void> {
  const q = ListChequesQuerySchema.parse(req.query);
  res.json(await svc.listCheques(q));
}

export async function auditReprint(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const detail = await svc.getInvoiceDetail(id);
  if (!detail) {
    res.status(404).json({ error: 'INVOICE_NOT_FOUND', message: 'الفاتورة غير موجودة' });
    return;
  }
  await auditLog(req, 'invoice.reprint', 'invoice', id, null, { invoice_no: detail.invoice_no });
  res.status(204).end();
}

function datetimeParam(val: unknown, fallback: string): string {
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(val)) {
    // Normalise YYYY-MM-DD or YYYY-MM-DDTHH:mm to full ISO with seconds
    if (val.length === 10) return val + 'T00:00:00';
    if (val.length === 16) return val + ':00';
    return val;
  }
  return fallback;
}

export async function exportSales(req: Request, res: Response): Promise<void> {
  const today = cairoToday();
  const from = datetimeParam(req.query['from'], today + 'T00:00:00');
  const to   = datetimeParam(req.query['to'],   today + 'T23:59:59');
  const status = typeof req.query['status'] === 'string' ? req.query['status'] : undefined;
  const generatedAt = formatCairo(new Date());

  const rows = await getSalesExport({ from, to, status });
  const opts = salesToExport(rows, from.replace('T', ' '), to.replace('T', ' '), generatedAt);

  const buf = await buildReportExcel(opts);
  const date = today;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="sales-export-${date}.xlsx"`);
  res.send(buf);
}
