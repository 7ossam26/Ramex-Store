import { z } from 'zod';
import { ChequeDetailsSchema } from './sales.schemas.js';

const positiveAmount = z.coerce.number().positive();
const refundMethodEnum = z.enum(['cash', 'instapay', 'customer_credit', 'bank_transfer', 'cheque']);
const bankMethodEnum = z.enum(['cash', 'instapay', 'bank_transfer', 'cheque']);

export const ReturnLineSchema = z.object({
  originalLineId: z.coerce.number().int().positive(),
  rollId: z.coerce.number().int().positive().nullable().optional(),
  accessoryId: z.coerce.number().int().positive().nullable().optional(),
  refundAmountEgp: positiveAmount,
  disposition: z.enum(['back_to_stock', 'damaged']),
  notesAr: z.string().max(2000).nullable().optional(),
}).superRefine((v, ctx) => {
  const hasRoll = v.rollId != null;
  const hasAccessory = v.accessoryId != null;
  if (hasRoll === hasAccessory) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rollId'],
      message: 'exactly one of rollId or accessoryId is required',
    });
  }
});

const processReturnRefine = (v: { refundMethod: string; bankAccountId?: number | null; chequeDetails?: unknown }, ctx: z.RefinementCtx) => {
  if ((v.refundMethod === 'instapay' || v.refundMethod === 'bank_transfer') && v.bankAccountId == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['bankAccountId'],
      message: 'bank_account_id required for instapay/bank_transfer refunds',
    });
  }
  if (v.refundMethod === 'cheque' && v.chequeDetails == null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['chequeDetails'],
      message: 'cheque_details required for cheque refunds',
    });
  }
};

const ProcessReturnBaseSchema = z.object({
  originalInvoiceId: z.coerce.number().int().positive(),
  lines: z.array(ReturnLineSchema).min(1),
  refundMethod: refundMethodEnum,
  bankAccountId: z.coerce.number().int().positive().nullable().optional(),
  reference: z.string().max(64).nullable().optional(),
  chequeDetails: ChequeDetailsSchema.nullable().optional(),
  notesAr: z.string().max(2000).nullable().optional(),
  ownerWindowOverride: z.boolean().optional().default(false),
});

export const ProcessReturnSchema = ProcessReturnBaseSchema.superRefine(processReturnRefine);
export type ProcessReturnInput = z.infer<typeof ProcessReturnSchema>;

const NewCartLineSchema = z.object({
  rollId: z.coerce.number().int().positive(),
  sellingPriceOverride: z.coerce.number().positive().nullable().optional(),
  lineDiscountEgp: z.coerce.number().min(0).nullable().optional(),
});

const NewCartPaymentSchema = z
  .object({
    method: bankMethodEnum,
    amount: positiveAmount,
    bankAccountId: z.coerce.number().int().positive().nullable().optional(),
    reference: z.string().max(64).nullable().optional(),
    chequeDetails: ChequeDetailsSchema.nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.method === 'instapay' || v.method === 'bank_transfer') && v.bankAccountId == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bankAccountId'],
        message: 'bank_account_id required for instapay/bank_transfer payments',
      });
    }
    if (v.method === 'cheque' && v.chequeDetails == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['chequeDetails'],
        message: 'cheque_details required for cheque payments',
      });
    }
  });

export const ProcessExchangeSchema = ProcessReturnBaseSchema.extend({
  newCartLines: z.array(NewCartLineSchema).min(1),
  newCartPayments: z.array(NewCartPaymentSchema).min(1),
  newCartTargetFinal: z.coerce.number().min(0).nullable().optional(),
  newCartNotesAr: z.string().max(2000).nullable().optional(),
}).superRefine(processReturnRefine);
export type ProcessExchangeInput = z.infer<typeof ProcessExchangeSchema>;

// Phase 6 — Return on Scan
export const ReturnFromScanSchema = z
  .object({
    rollId: z.coerce.number().int().positive().nullable().optional(),
    accessoryId: z.coerce.number().int().positive().nullable().optional(),
    refundMethod: bankMethodEnum,
    bankAccountId: z.coerce.number().int().positive().nullable().optional(),
    reference: z.string().max(64).nullable().optional(),
    chequeDetails: ChequeDetailsSchema.nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.rollId != null) === (v.accessoryId != null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rollId'],
        message: 'exactly one of rollId or accessoryId is required',
      });
    }
    if ((v.refundMethod === 'instapay' || v.refundMethod === 'bank_transfer') && v.bankAccountId == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bankAccountId'],
        message: 'bank_account_id required for instapay/bank_transfer refunds',
      });
    }
    if (v.refundMethod === 'cheque' && v.chequeDetails == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['chequeDetails'],
        message: 'cheque_details required for cheque refunds',
      });
    }
  });
export type ReturnFromScanInput = z.infer<typeof ReturnFromScanSchema>;

export const ListReturnsQuerySchema = z.object({
  customer_id: z.coerce.number().int().positive().optional(),
  original_invoice_id: z.coerce.number().int().positive().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
});
export type ListReturnsQueryInput = z.infer<typeof ListReturnsQuerySchema>;
