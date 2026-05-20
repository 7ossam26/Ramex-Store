import { z } from 'zod';

const positiveAmount = z.coerce.number().positive();

export const ReturnLineSchema = z.object({
  originalLineId: z.coerce.number().int().positive(),
  rollId: z.coerce.number().int().positive(),
  refundAmountEgp: positiveAmount,
  disposition: z.enum(['back_to_stock', 'damaged']),
  notesAr: z.string().max(2000).nullable().optional(),
});

export const ProcessReturnSchema = z.object({
  originalInvoiceId: z.coerce.number().int().positive(),
  lines: z.array(ReturnLineSchema).min(1),
  refundMethod: z.enum(['cash', 'instapay', 'customer_credit']),
  bankAccountId: z.coerce.number().int().positive().nullable().optional(),
  notesAr: z.string().max(2000).nullable().optional(),
  ownerWindowOverride: z.boolean().optional().default(false),
});
export type ProcessReturnInput = z.infer<typeof ProcessReturnSchema>;

const NewCartLineSchema = z.object({
  rollId: z.coerce.number().int().positive(),
  sellingPriceOverride: z.coerce.number().positive().nullable().optional(),
  lineDiscountEgp: z.coerce.number().min(0).nullable().optional(),
});

const NewCartPaymentSchema = z.object({
  method: z.enum(['cash', 'instapay']),
  amount: positiveAmount,
  bankAccountId: z.coerce.number().int().positive().nullable().optional(),
});

export const ProcessExchangeSchema = ProcessReturnSchema.extend({
  newCartLines: z.array(NewCartLineSchema).min(1),
  newCartPayments: z.array(NewCartPaymentSchema).min(1),
  newCartTargetFinal: z.coerce.number().min(0).nullable().optional(),
  newCartNotesAr: z.string().max(2000).nullable().optional(),
});
export type ProcessExchangeInput = z.infer<typeof ProcessExchangeSchema>;

// Phase 6 — Return on Scan
export const ReturnFromScanSchema = z.object({
  rollId: z.coerce.number().int().positive(),
  refundMethod: z.enum(['cash', 'instapay']),
  bankAccountId: z.coerce.number().int().positive().nullable().optional(),
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
