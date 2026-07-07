import { z } from 'zod';

const PHONE_REGEX = /^01[0125]\d{8}$/;

export const PhoneSchema = z
  .string()
  .regex(PHONE_REGEX, 'صيغة الهاتف غير صحيحة (يجب أن يبدأ بـ 010 أو 011 أو 012 أو 015)');

export const CreateCustomerSchema = z.object({
  name_ar: z.string().min(1, 'اسم العميل مطلوب').max(128, 'الاسم طويل جداً'),
  phone: PhoneSchema,
  phone_secondary: PhoneSchema.nullable().optional(),
  address_ar: z.string().max(2000).nullable().optional(),
  tax_no: z.string().max(32).nullable().optional(),
  notes_ar: z.string().max(5000).nullable().optional(),
});
export type CreateCustomerInput = z.infer<typeof CreateCustomerSchema>;

export const QuickCreateCustomerSchema = z.object({
  name_ar: z.string().min(1, 'اسم العميل مطلوب').max(128, 'الاسم طويل جداً'),
  phone: PhoneSchema,
});
export type QuickCreateCustomerInput = z.infer<typeof QuickCreateCustomerSchema>;

export const UpdateCustomerSchema = z
  .object({
    name_ar: z.string().min(1, 'اسم العميل مطلوب').max(128, 'الاسم طويل جداً').optional(),
    phone: PhoneSchema.optional(),
    phone_secondary: PhoneSchema.nullable().optional(),
    address_ar: z.string().max(2000).nullable().optional(),
    tax_no: z.string().max(32).nullable().optional(),
    notes_ar: z.string().max(5000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'يجب تحديد حقل واحد على الأقل' });
export type UpdateCustomerInput = z.infer<typeof UpdateCustomerSchema>;

export const ListCustomersQuerySchema = z.object({
  search: z.string().optional(),
  sort: z.enum(['name_ar', 'created_at', 'lifetime_volume_egp']).optional().default('created_at'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
});
export type ListCustomersQueryInput = z.infer<typeof ListCustomersQuerySchema>;

export const LedgerQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(30),
});
export type LedgerQueryInput = z.infer<typeof LedgerQuerySchema>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Signed opening balance in ledger convention: negative = customer owes us (مدين),
// positive = customer has credit (دائن). 0 clears an existing opening balance.
export const OpeningBalanceSchema = z.object({
  amount: z.number().finite('قيمة غير صالحة'),
  as_of_date: z.string().regex(ISO_DATE, 'تاريخ غير صالح'),
  notes_ar: z.string().max(5000).nullable().optional(),
});
export type OpeningBalanceInput = z.infer<typeof OpeningBalanceSchema>;

// Standalone receipt — a positive amount the customer pays outside a POS sale.
export const StandaloneReceiptSchema = z.object({
  amount: z.number().positive('يجب أن يكون المبلغ أكبر من صفر'),
  notes_ar: z.string().max(5000).nullable().optional(),
});
export type StandaloneReceiptInput = z.infer<typeof StandaloneReceiptSchema>;

export const StatementQuerySchema = z.object({
  from: z.string().regex(ISO_DATE).optional(),
  to: z.string().regex(ISO_DATE).optional(),
  variant: z.enum(['summary', 'detailed']).optional().default('summary'),
  format: z.enum(['json', 'pdf', 'excel', 'print']).optional().default('json'),
});
export type StatementQueryInput = z.infer<typeof StatementQuerySchema>;
