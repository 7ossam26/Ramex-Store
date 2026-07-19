import type { Request, Response } from 'express';
import {
  CreateCustomerSchema,
  QuickCreateCustomerSchema,
  UpdateCustomerSchema,
  ListCustomersQuerySchema,
  ListCustomersExportQuerySchema,
  LedgerQuerySchema,
  OpeningBalanceSchema,
  StandaloneReceiptSchema,
  StatementQuerySchema,
} from './customers.schemas.js';
import type { Customer } from './customers.types.js';
import type { ReportPdfOptions } from '../../lib/reports/pdfExport.js';
import * as svc from './customersService.js';
import { recordStandaloneReceipt, setCustomerOpeningBalance } from './ledgerService.js';
import { getCustomerStatement, getCustomerStatementExport } from './customerStatement.service.js';
import { cairoToday, formatCairo } from '../../lib/datetime/cairo.js';
import { buildReportPdf } from '../../lib/reports/pdfExport.js';
import { buildReportExcel } from '../../lib/reports/excelExport.js';
import { buildPrintableHtml } from '../../lib/reports/printableHtml.js';
import { auditFromService } from '../inventory/audit.helper.js';
import { db } from '../../db/connection.js';

/** First day of the current Cairo-local month, `YYYY-MM-DD`. */
function firstOfCairoMonth(): string {
  return `${cairoToday().slice(0, 7)}-01`;
}

const ERR_MAP: Record<string, { status: number; message: string }> = {
  CUSTOMER_NOT_FOUND: { status: 404, message: 'العميل غير موجود' },
  PHONE_DUPLICATE: { status: 409, message: 'رقم الهاتف مستخدم بالفعل' },
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

export async function listCustomers(req: Request, res: Response): Promise<void> {
  const query = ListCustomersQuerySchema.parse(req.query);
  res.json(await svc.list(query));
}

const BALANCE_FILTER_LABEL: Record<string, string> = {
  all: 'الكل',
  debt: 'مدين',
  credit: 'دائن',
  settled: 'متعادل',
};

function fmtEgp(v: string | number): string {
  return `${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
}

/** Balance-direction label for a signed balance (ledger convention). */
function balanceDirection(balance: string | number): string {
  const n = Number(balance);
  if (n < 0) return 'مدين';
  if (n > 0) return 'دائن';
  return 'متعادل';
}

function buildCustomersExport(
  rows: Customer[],
  filter: { search?: string; balance: string },
  generatedAt: string,
): ReportPdfOptions {
  const filterBits = [`الفلتر: ${BALANCE_FILTER_LABEL[filter.balance] ?? 'الكل'}`];
  if (filter.search) filterBits.push(`بحث: ${filter.search}`);
  return {
    titleAr: 'قائمة العملاء',
    subtitleAr: `${filterBits.join(' · ')} · عدد: ${rows.length}`,
    generatedAt,
    sections: [
      {
        titleAr: 'العملاء',
        columns: [
          { label: 'الكود', key: 'code' },
          { label: 'الاسم', key: 'name' },
          { label: 'الهاتف', key: 'phone' },
          { label: 'إجمالي المبيعات', key: 'volume' },
          { label: 'الرصيد', key: 'balance' },
          { label: 'الحالة', key: 'direction', align: 'center' },
        ],
        rows: rows.map((c) => ({
          code: c.customer_code,
          name: c.name_ar,
          phone: c.phone,
          volume: fmtEgp(c.lifetime_volume_egp),
          balance: Number(c.current_balance_egp) === 0 ? '—' : fmtEgp(Math.abs(Number(c.current_balance_egp))),
          direction: balanceDirection(c.current_balance_egp),
        })),
        emptyAr: 'لا يوجد عملاء مطابقون',
      },
    ],
  };
}

export async function exportCustomers(req: Request, res: Response): Promise<void> {
  const query = ListCustomersExportQuerySchema.parse(req.query);
  const rows = await svc.listForExport(query);
  const generatedAt = formatCairo(new Date());
  const opts = buildCustomersExport(rows, { search: query.search, balance: query.balance }, generatedAt);

  await auditFromService(db, {
    actorUserId: actorId(req),
    action: 'customers_list_exported',
    entity: 'customer',
    entityId: null,
    after: { search: query.search ?? null, balance: query.balance, format: query.format, count: rows.length },
    severity: 'low',
  });

  const fileBase = `customers-${cairoToday()}`;
  if (query.format === 'excel') {
    const buf = await buildReportExcel(opts);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.xlsx"`);
    res.send(buf);
  } else if (query.format === 'print') {
    const html = buildPrintableHtml(opts);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } else {
    const buf = await buildReportPdf(opts);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.pdf"`);
    res.send(buf);
  }
}

export async function getCustomer(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const ledgerQuery = LedgerQuerySchema.parse(req.query);
  const result = await svc.getDetail(id, ledgerQuery);
  if (!result) {
    res.status(404).json({ error: 'CUSTOMER_NOT_FOUND', message: 'العميل غير موجود' });
    return;
  }
  res.json(result);
}

export async function createCustomer(req: Request, res: Response): Promise<void> {
  const data = CreateCustomerSchema.parse(req.body);
  try {
    const customer = await svc.create(actorId(req), data);
    res.status(201).json(customer);
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function quickCreateCustomer(req: Request, res: Response): Promise<void> {
  const data = QuickCreateCustomerSchema.parse(req.body);
  try {
    const customer = await svc.quickCreate(actorId(req), data);
    res.status(201).json(customer);
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function updateCustomer(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const data = UpdateCustomerSchema.parse(req.body);
  try {
    const customer = await svc.update(id, actorId(req), data);
    res.json(customer);
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function getCustomerByPhone(req: Request, res: Response): Promise<void> {
  const phone = String(req.params.phone);
  const customer = await svc.findByPhone(phone);
  if (!customer) {
    res.status(404).json({ error: 'CUSTOMER_NOT_FOUND', message: 'العميل غير موجود' });
    return;
  }
  res.json(customer);
}

export async function getCustomerLedger(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const query = LedgerQuerySchema.parse(req.query);
  const detail = await svc.getDetail(id, query);
  if (!detail) {
    res.status(404).json({ error: 'CUSTOMER_NOT_FOUND', message: 'العميل غير موجود' });
    return;
  }
  res.json(detail.ledger);
}

export async function setOpeningBalance(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const data = OpeningBalanceSchema.parse(req.body);
  try {
    const result = await setCustomerOpeningBalance(
      id,
      data.amount,
      data.as_of_date,
      actorId(req),
      data.notes_ar ?? null,
    );
    res.json(result);
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function recordReceipt(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const data = StandaloneReceiptSchema.parse(req.body);
  try {
    const result = await recordStandaloneReceipt(id, data.amount, data.notes_ar ?? null, actorId(req));
    res.status(201).json(result);
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}

export async function getStatement(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  const { from: fromQ, to: toQ, variant, format } = StatementQuerySchema.parse(req.query);
  const from = fromQ ?? firstOfCairoMonth();
  const to = toQ ?? cairoToday();

  try {
    if (format === 'json') {
      res.json(await getCustomerStatement(id, from, to));
      return;
    }

    const generatedAt = formatCairo(new Date());
    const opts = await getCustomerStatementExport(id, from, to, variant, generatedAt);
    const fileBase = `customer-${id}-statement-${from}_${to}`;

    // Audit every file/print export of an account statement.
    await auditFromService(db, {
      actorUserId: actorId(req),
      action: 'customer_statement_exported',
      entity: 'customer',
      entityId: id,
      after: { from, to, variant, format },
      severity: 'low',
    });

    if (format === 'excel') {
      const buf = await buildReportExcel(opts);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.xlsx"`);
      res.send(buf);
    } else if (format === 'print') {
      const html = buildPrintableHtml(opts);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } else {
      const buf = await buildReportPdf(opts);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileBase}.pdf"`);
      res.send(buf);
    }
  } catch (e) {
    if (handleDomainError(e, res)) return;
    throw e;
  }
}
