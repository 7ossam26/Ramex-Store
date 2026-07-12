import { z } from 'zod';

const EGYPTIAN_PHONE = /^01[0125][0-9]{8}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const phoneSchema = z
  .string()
  .max(20)
  .nullable()
  .optional()
  .refine(
    (val) => !val || EGYPTIAN_PHONE.test(val),
    'رقم الهاتف يجب أن يكون بصيغة مصرية: 01[0-1-2-5]XXXXXXXX',
  );

export const CurrencySchema = z.enum(['EGP', 'RMB'], {
  errorMap: () => ({ message: 'العملة يجب أن تكون ج.م أو ¥' }),
});

export const CreateSupplierSchema = z.object({
  arabic_name: z.string().min(1, 'الاسم العربي مطلوب').max(128, 'الاسم طويل جداً'),
  english_name: z.string().max(128).nullable().optional(),
  phone: phoneSchema,
  currency: CurrencySchema,
  opening_balance: z
    .number({ invalid_type_error: 'الرصيد الافتتاحي يجب أن يكون رقماً' })
    .optional(),
  opening_balance_date: z
    .string()
    .regex(ISO_DATE, 'صيغة التاريخ غير صحيحة — YYYY-MM-DD')
    .nullable()
    .optional(),
});

export const UpdateSupplierSchema = z.object({
  arabic_name: z.string().min(1, 'الاسم العربي مطلوب').max(128, 'الاسم طويل جداً').optional(),
  english_name: z.string().max(128).nullable().optional(),
  phone: phoneSchema,
  currency: CurrencySchema.optional(),
  opening_balance: z
    .number({ invalid_type_error: 'الرصيد الافتتاحي يجب أن يكون رقماً' })
    .optional(),
  opening_balance_date: z
    .string()
    .regex(ISO_DATE, 'صيغة التاريخ غير صحيحة — YYYY-MM-DD')
    .nullable()
    .optional(),
});

export const UNITS = ['kg', 'meter', 'roll', 'piece'] as const;

export const SupplierInvoiceLineSchema = z.object({
  description: z.string().min(1, 'الوصف مطلوب').max(500, 'الوصف طويل جداً'),
  quantity: z
    .number({ invalid_type_error: 'الكمية يجب أن تكون رقماً' })
    .positive('الكمية يجب أن تكون أكبر من صفر'),
  unit: z.enum(UNITS, { errorMap: () => ({ message: 'الوحدة غير صحيحة' }) }),
  unit_price: z
    .number({ invalid_type_error: 'سعر الوحدة يجب أن يكون رقماً' })
    .nonnegative('سعر الوحدة لا يمكن أن يكون سالباً'),
});

export const CreateSupplierInvoiceSchema = z.object({
  supplier_id: z.number().int().positive(),
  invoice_no: z.string().max(128).nullable().optional(),
  invoice_date: z.string().regex(ISO_DATE, 'صيغة التاريخ غير صحيحة — YYYY-MM-DD'),
  due_date: z.string().regex(ISO_DATE, 'صيغة التاريخ غير صحيحة — YYYY-MM-DD').nullable().optional(),
  extra_charges: z
    .number({ invalid_type_error: 'المصاريف الإضافية يجب أن تكون رقماً' })
    .nonnegative('المصاريف الإضافية لا يمكن أن تكون سالبة')
    .optional(),
  lines: z.array(SupplierInvoiceLineSchema).min(1, 'يجب إضافة سطر واحد على الأقل'),
  notes_ar: z.string().max(2000).nullable().optional(),
});

export const UpdateSupplierInvoiceSchema = z.object({
  invoice_no: z.string().max(128).nullable().optional(),
  invoice_date: z.string().regex(ISO_DATE, 'صيغة التاريخ غير صحيحة — YYYY-MM-DD').optional(),
  due_date: z.string().regex(ISO_DATE, 'صيغة التاريخ غير صحيحة — YYYY-MM-DD').nullable().optional(),
  extra_charges: z
    .number({ invalid_type_error: 'المصاريف الإضافية يجب أن تكون رقماً' })
    .nonnegative('المصاريف الإضافية لا يمكن أن تكون سالبة')
    .optional(),
  lines: z.array(SupplierInvoiceLineSchema).min(1, 'يجب إضافة سطر واحد على الأقل').optional(),
  notes_ar: z.string().max(2000).nullable().optional(),
});

// ── Purchase returns (مرتجع مشتريات) ───────────────────────────────────────────
// Mirror of the invoice schemas: a standalone document with the same line-item
// shape, keyed on `return_date` / optional `return_no`. Reuses the invoice line
// schema. A return credits (decreases) the supplier balance; no balance cap.

export const CreateSupplierReturnSchema = z.object({
  supplier_id: z.number().int().positive(),
  return_no: z.string().max(128).nullable().optional(),
  return_date: z.string().regex(ISO_DATE, 'صيغة التاريخ غير صحيحة — YYYY-MM-DD'),
  extra_charges: z
    .number({ invalid_type_error: 'المصاريف الإضافية يجب أن تكون رقماً' })
    .nonnegative('المصاريف الإضافية لا يمكن أن تكون سالبة')
    .optional(),
  lines: z.array(SupplierInvoiceLineSchema).min(1, 'يجب إضافة سطر واحد على الأقل'),
  notes_ar: z.string().max(2000).nullable().optional(),
});

export const UpdateSupplierReturnSchema = z.object({
  return_no: z.string().max(128).nullable().optional(),
  return_date: z.string().regex(ISO_DATE, 'صيغة التاريخ غير صحيحة — YYYY-MM-DD').optional(),
  extra_charges: z
    .number({ invalid_type_error: 'المصاريف الإضافية يجب أن تكون رقماً' })
    .nonnegative('المصاريف الإضافية لا يمكن أن تكون سالبة')
    .optional(),
  lines: z.array(SupplierInvoiceLineSchema).min(1, 'يجب إضافة سطر واحد على الأقل').optional(),
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

export const UpdateSupplierPaymentSchema = z.object({
  amount_egp: z.number({ invalid_type_error: 'المبلغ يجب أن يكون رقماً' }).positive('المبلغ يجب أن يكون أكبر من صفر').optional(),
  paid_at: z.string().datetime().optional(),
  method: z.enum(['cash', 'instapay', 'bank_transfer']).optional(),
  bank_account_id: z.number().int().positive().nullable().optional(),
  notes_ar: z.string().max(2000).nullable().optional(),
});

export type CreateSupplierInput = z.infer<typeof CreateSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof UpdateSupplierSchema>;
export type SupplierInvoiceLineInput = z.infer<typeof SupplierInvoiceLineSchema>;
export type CreateSupplierInvoiceInput = z.infer<typeof CreateSupplierInvoiceSchema>;
export type UpdateSupplierInvoiceInput = z.infer<typeof UpdateSupplierInvoiceSchema>;
export type CreateSupplierReturnInput = z.infer<typeof CreateSupplierReturnSchema>;
export type UpdateSupplierReturnInput = z.infer<typeof UpdateSupplierReturnSchema>;
export type CreateSupplierPaymentInput = z.infer<typeof CreateSupplierPaymentSchema>;
export type UpdateSupplierPaymentInput = z.infer<typeof UpdateSupplierPaymentSchema>;
