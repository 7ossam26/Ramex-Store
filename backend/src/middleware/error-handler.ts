import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';

/* Common Postgres SQLSTATEs we want to surface as clean Arabic messages
 * instead of leaking the raw English database message to the user. */
type PgError = Error & {
  code?: string;
  constraint?: string;
  detail?: string;
  table?: string;
  schema?: string;
};

const PG_ERROR_MAP: Record<string, { status: number; key: string; message: string }> = {
  '23514': { status: 400, key: 'check_violation',       message: 'القيمة المُدخلة غير مسموح بها' },
  '23505': { status: 409, key: 'unique_violation',      message: 'هذا السجل موجود مسبقاً' },
  '23503': { status: 400, key: 'foreign_key_violation', message: 'يوجد مرجع غير صالح في البيانات' },
  '23502': { status: 400, key: 'not_null_violation',    message: 'حقل مطلوب لم يتم تعبئته' },
  '22P02': { status: 400, key: 'invalid_format',        message: 'صيغة البيانات غير صحيحة' },
  '22001': { status: 400, key: 'string_too_long',       message: 'النص أطول من الحد المسموح' },
};

const CONSTRAINT_MESSAGES: Record<string, string> = {
  customers_phone_format_check: 'رقم الهاتف يجب أن يكون بصيغة مصرية: 01[0-1-2-5]XXXXXXXX',
  suppliers_phone_format_check: 'رقم الهاتف يجب أن يكون بصيغة مصرية: 01[0-1-2-5]XXXXXXXX',
  // migration 093 — a stock movement belongs to exactly one توب or one اكسسوار.
  chk_stock_movements_entity_type:
    'حركة مخزون غير صالحة: يجب أن ترتبط الحركة بتوب واحد أو باكسسوار واحد، وليس بكليهما',
  // migration 082
  chk_invoice_lines_item_type:
    'بند فاتورة غير صالح: بند التوب يحتاج توب، وبند الاكسسوار يحتاج اكسسوار وكمية',
  // migration 084
  chk_return_lines_item_type:
    'بند مرتجع غير صالح: بند التوب يحتاج توب، وبند الاكسسوار يحتاج اكسسوار وكمية',
  // migration 049
  invoices_status_check: 'حالة الفاتورة غير مسموح بها',
  // migration 066
  stock_movements_event_type_check: 'نوع حركة المخزون غير مسموح به',
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'validation', issues: err.issues });
    return;
  }

  const pg = err as PgError;
  if (pg && typeof pg.code === 'string' && PG_ERROR_MAP[pg.code]) {
    const cfg = PG_ERROR_MAP[pg.code]!;
    let message = cfg.message;
    if (pg.constraint && CONSTRAINT_MESSAGES[pg.constraint]) {
      message = CONSTRAINT_MESSAGES[pg.constraint];
    }
    logger.warn(
      {
        pgCode: pg.code,
        constraint: pg.constraint,
        table: pg.table,
        detail: pg.detail,
        reqId: req.id,
        raw: pg.message,
      },
      'db constraint violation',
    );
    const pgBody: { error: string; message: string; constraint?: string; detail?: string } = {
      error: cfg.key,
      message,
    };
    // Never in production — a constraint name is internal schema detail. But in
    // dev an opaque "القيمة المُدخلة غير مسموح بها" hides the one word the
    // driver already handed us, and costs hours of bisecting to recover.
    if (env.NODE_ENV !== 'production') {
      if (pg.constraint) pgBody.constraint = pg.constraint;
      if (pg.detail) pgBody.detail = pg.detail;
    }
    res.status(cfg.status).json(pgBody);
    return;
  }

  // Unexpected error: log everything we have, but never leak the raw SQL/JS message
  // back to the client — the user shouldn't see English internals or stack frames.
  logger.error({ err, reqId: req.id }, 'unhandled error');

  const body: { error: string; message: string; detail?: string } = {
    error: 'internal',
    message: 'حدث خطأ غير متوقع، حاول مرة أخرى',
  };
  if (env.NODE_ENV !== 'production' && err instanceof Error) {
    body.detail = err.stack;
  }
  res.status(500).json(body);
};
