import { z } from 'zod';

const PHONE_REGEX = /^01[0125]\d{8}$/;

export const PhoneSchema = z
  .string()
  .regex(PHONE_REGEX, 'صيغة الهاتف غير صحيحة (يجب أن يبدأ بـ 010 أو 011 أو 012 أو 015)');

export const CreateCustomerSchema = z.object({
  name_ar: z.string().min(1).max(128),
  phone: PhoneSchema,
  phone_secondary: PhoneSchema.nullable().optional(),
  address_ar: z.string().max(2000).nullable().optional(),
  tax_no: z.string().max(32).nullable().optional(),
  notes_ar: z.string().max(5000).nullable().optional(),
});
export type CreateCustomerInput = z.infer<typeof CreateCustomerSchema>;

export const QuickCreateCustomerSchema = z.object({
  name_ar: z.string().min(1).max(128),
  phone: PhoneSchema,
});
export type QuickCreateCustomerInput = z.infer<typeof QuickCreateCustomerSchema>;

export const UpdateCustomerSchema = z
  .object({
    name_ar: z.string().min(1).max(128).optional(),
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
