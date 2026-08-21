import { z } from 'zod';

const positiveAmount = z.coerce.number().positive();
const nonNegativeAmount = z.coerce.number().min(0);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'يجب أن يكون التاريخ بصيغة YYYY-MM-DD');

export const RollSaleLineSchema = z.object({
  type: z.literal('roll').optional().default('roll'),
  rollId: z.coerce.number().int().positive(),
  sellingPriceOverride: positiveAmount.nullable().optional(),
  finalPricePerUnit: positiveAmount.nullable().optional(),
  lineDiscountEgp: nonNegativeAmount.nullable().optional(),
});
export type RollSaleLineInput = z.infer<typeof RollSaleLineSchema>;

export const AccessorySaleLineSchema = z.object({
  type: z.literal('accessory'),
  accessoryId: z.coerce.number().int().positive(),
  qtyPieces: z.coerce.number().int().positive(),
  finalPricePerPiece: positiveAmount,
  lineDiscountEgp: nonNegativeAmount.nullable().optional(),
});
export type AccessorySaleLineInput = z.infer<typeof AccessorySaleLineSchema>;

// Polymorphic line — can be a roll line (backwards-compat default) or an accessory line.
export const SaleLineSchema = z.union([AccessorySaleLineSchema, RollSaleLineSchema]);

// Cheque details — used whenever method = 'cheque'.
export const ChequeDetailsSchema = z
  .object({
    chequeNumber: z.string().min(1).max(64),
    bankNameAr: z.string().min(1).max(128),
    branchAr: z.string().max(128).nullable().optional(),
    issuerNameAr: z.string().max(128).nullable().optional(),
    issueDate: isoDate,
    dueDate: isoDate,
    notesAr: z.string().max(2000).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.dueDate < v.issueDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dueDate'],
        message: 'تاريخ الاستحقاق يجب أن يكون مساوياً أو بعد تاريخ الإصدار',
      });
    }
  });
export type ChequeDetailsInput = z.infer<typeof ChequeDetailsSchema>;

const paymentMethodEnum = z.enum(['cash', 'instapay', 'bank_transfer', 'cheque']);

export const SalePaymentSchema = z
  .object({
    method: paymentMethodEnum,
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
        message: 'bank_account_id is required for instapay/bank_transfer payments',
      });
    }
    if (v.method === 'cheque' && (v.chequeDetails == null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['chequeDetails'],
        message: 'cheque_details required for cheque payments',
      });
    }
  });

export const FulfillmentDestinationEnum = z.enum(['shop', 'factory_direct']);

export const CreateSaleSchema = z.object({
  customerId: z.coerce.number().int().positive(),
  fulfillmentDestination: FulfillmentDestinationEnum.optional().default('shop'),
  lines: z.array(SaleLineSchema),
  cartTargetFinal: nonNegativeAmount.nullable().optional(),
  payments: z.array(SalePaymentSchema).min(0),
  notesAr: z.string().max(2000).nullable().optional(),
});
export type CreateSaleInput = z.infer<typeof CreateSaleSchema>;
export type SaleLineInput = z.infer<typeof SaleLineSchema>;

export const SalePreviewSchema = z.object({
  lines: z.array(RollSaleLineSchema).min(1),
  cartTargetFinal: nonNegativeAmount.nullable().optional(),
});
export type SalePreviewInput = z.infer<typeof SalePreviewSchema>;

export const VoidInvoiceSchema = z.object({
  reason_ar: z.string().min(1).max(2000),
  approved_by_owner: z.boolean().optional().default(false),
});
export type VoidInvoiceInput = z.infer<typeof VoidInvoiceSchema>;

export const ListInvoicesQuerySchema = z.object({
  status: z
    .enum(['open', 'closed_pending_pickup', 'completed', 'cancelled', 'deposit_refunded'])
    .optional(),
  customer_id: z.coerce.number().int().positive().optional(),
  fulfillment_destination: FulfillmentDestinationEnum.optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  search: z.string().max(64).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
});
export type ListInvoicesQueryInput = z.infer<typeof ListInvoicesQuerySchema>;

export const PdfVariantSchema = z.object({
  variant: z.enum(['original', 'reprint', 'open']).optional().default('original'),
});
export type PdfVariantInput = z.infer<typeof PdfVariantSchema>;

export const FinalPaymentSchema = z.object({
  payments: z
    .array(
      z
        .object({
          method: paymentMethodEnum,
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
              message: 'bank_account_id is required for instapay/bank_transfer payments',
            });
          }
          if (v.method === 'cheque' && v.chequeDetails == null) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['chequeDetails'],
              message: 'cheque_details required for cheque payments',
            });
          }
        }),
    )
    // May be empty when `discountEgp` covers the whole remaining balance; the
    // service rejects the case where neither a payment nor a discount is given.
    .min(0),
  discountEgp: nonNegativeAmount.optional(),
});
export type FinalPaymentInput = z.infer<typeof FinalPaymentSchema>;

export const CancelOpenInvoiceSchema = z
  .object({
    deposit_handling: z.enum(['full_refund', 'partial_refund', 'keep_as_credit']),
    refund_method: paymentMethodEnum.nullable().optional(),
    partial_refund_amount: nonNegativeAmount.nullable().optional(),
    bank_account_id: z.coerce.number().int().positive().nullable().optional(),
    reference: z.string().max(64).nullable().optional(),
    cheque_details: ChequeDetailsSchema.nullable().optional(),
    notes_ar: z.string().min(1).max(2000),
  })
  .superRefine((v, ctx) => {
    if (
      (v.deposit_handling === 'full_refund' || v.deposit_handling === 'partial_refund') &&
      !v.refund_method
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['refund_method'],
        message: 'refund_method required for refund flows',
      });
    }
    if (
      v.deposit_handling === 'partial_refund' &&
      (v.partial_refund_amount == null || Number(v.partial_refund_amount) <= 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['partial_refund_amount'],
        message: 'partial_refund_amount required for partial_refund',
      });
    }
    if (
      (v.deposit_handling === 'full_refund' || v.deposit_handling === 'partial_refund') &&
      v.refund_method === 'cheque' &&
      v.cheque_details == null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cheque_details'],
        message: 'cheque_details required for cheque refunds',
      });
    }
  });
export type CancelOpenInvoiceInput = z.infer<typeof CancelOpenInvoiceSchema>;

export const AddLinesSchema = z.object({
  lines: z.array(RollSaleLineSchema).min(1),
  cartTargetFinal: nonNegativeAmount.nullable().optional(),
});
export type AddLinesInput = z.infer<typeof AddLinesSchema>;

// Legacy alias kept for backwards compatibility with existing call sites
export { SaleLineSchema as LegacySaleLineSchema };

export const DepositRefundSchema = z
  .object({
    amountEgp: positiveAmount,
    method: paymentMethodEnum,
    bankAccountId: z.coerce.number().int().positive().nullable().optional(),
    reference: z.string().max(64).nullable().optional(),
    chequeDetails: ChequeDetailsSchema.nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.method === 'instapay' || v.method === 'bank_transfer') && v.bankAccountId == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bankAccountId'],
        message: 'bank_account_id is required for instapay/bank_transfer refunds',
      });
    }
    if (v.method === 'cheque' && v.chequeDetails == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['chequeDetails'],
        message: 'cheque_details required for cheque refunds',
      });
    }
  });
export type DepositRefundInput = z.infer<typeof DepositRefundSchema>;

export const ListChequesQuerySchema = z.object({
  status: z.enum(['pending', 'cleared', 'bounced', 'cancelled']).optional(),
  bank_name_ar: z.string().optional(),
  due_date_from: z.string().optional(),
  due_date_to: z.string().optional(),
  search: z.string().max(64).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
});
export type ListChequesQueryInput = z.infer<typeof ListChequesQuerySchema>;
