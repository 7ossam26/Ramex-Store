import { z } from 'zod';

export const CreateSupplierInvoiceSchema = z.object({
  supplier_id: z.number().int().positive(),
  invoice_no: z.string().max(128).nullable().optional(),
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'صيغة التاريخ غير صحيحة — YYYY-MM-DD'),
  amount_egp: z.number({ invalid_type_error: 'المبلغ يجب أن يكون رقماً' }).positive('المبلغ يجب أن يكون أكبر من صفر'),
  notes_ar: z.string().max(2000).nullable().optional(),
});

export const CreateSupplierPaymentSchema = z.object({
  supplier_id: z.number().int().positive(),
  amount_egp: z.number({ invalid_type_error: 'المبلغ يجب أن يكون رقماً' }).positive('المبلغ يجب أن يكون أكبر من صفر'),
  paid_at: z.string().datetime().optional(),
  method: z.enum(['cash', 'instapay', 'bank_transfer']),
  bank_account_id: z.number().int().positive().nullable().optional(),
  notes_ar: z.string().max(2000).nullable().optional(),
}).refine(
  (d) => d.method === 'cash' || d.bank_account_id != null,
  { message: 'bank_account_id مطلوب لطرق الدفع غير النقدي', path: ['bank_account_id'] },
);

export type CreateSupplierInvoiceInput = z.infer<typeof CreateSupplierInvoiceSchema>;
export type CreateSupplierPaymentInput = z.infer<typeof CreateSupplierPaymentSchema>;
