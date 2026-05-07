import { z } from 'zod';

const positiveAmount = z.coerce.number().positive();
const nonNegativeAmount = z.coerce.number().min(0);

export const SaleLineSchema = z.object({
  rollId: z.coerce.number().int().positive(),
  sellingPriceOverride: positiveAmount.nullable().optional(),
  lineDiscountEgp: nonNegativeAmount.nullable().optional(),
});

export const SalePaymentSchema = z.object({
  method: z.enum(['cash', 'instapay']),
  amount: positiveAmount,
  bankAccountId: z.coerce.number().int().positive().nullable().optional(),
});

export const CreateSaleSchema = z.object({
  customerId: z.coerce.number().int().positive(),
  lines: z.array(SaleLineSchema).min(1),
  cartTargetFinal: nonNegativeAmount.nullable().optional(),
  payments: z.array(SalePaymentSchema).min(1),
  notesAr: z.string().max(2000).nullable().optional(),
});
export type CreateSaleInput = z.infer<typeof CreateSaleSchema>;

export const SalePreviewSchema = z.object({
  lines: z.array(SaleLineSchema).min(1),
  cartTargetFinal: nonNegativeAmount.nullable().optional(),
});
export type SalePreviewInput = z.infer<typeof SalePreviewSchema>;

export const VoidInvoiceSchema = z.object({
  reason_ar: z.string().min(1).max(2000),
  approved_by_owner: z.boolean().optional().default(false),
});
export type VoidInvoiceInput = z.infer<typeof VoidInvoiceSchema>;

export const ListInvoicesQuerySchema = z.object({
  status: z.enum(['open', 'closed_pending_pickup', 'completed', 'cancelled']).optional(),
  customer_id: z.coerce.number().int().positive().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
});
export type ListInvoicesQueryInput = z.infer<typeof ListInvoicesQuerySchema>;

export const PdfVariantSchema = z.object({
  variant: z.enum(['original', 'reprint', 'open']).optional().default('original'),
});
export type PdfVariantInput = z.infer<typeof PdfVariantSchema>;
