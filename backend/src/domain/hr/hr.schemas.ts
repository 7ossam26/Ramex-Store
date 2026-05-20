import { z } from 'zod';

const egyptianPhone = z
  .string()
  .regex(/^01[0125]\d{8}$/, 'رقم الهاتف غير صحيح — الصيغة المطلوبة: 01[0125]XXXXXXXX')
  .nullable()
  .optional();

export const CreateEmployeeSchema = z.object({
  name_ar: z.string().min(1).max(128),
  phone: egyptianPhone,
  role_ar: z.string().max(64).nullable().optional(),
  base_salary_egp: z.number().min(0),
});

export const UpdateEmployeeSchema = z.object({
  name_ar: z.string().min(1).max(128).optional(),
  phone: egyptianPhone,
  role_ar: z.string().max(64).nullable().optional(),
  base_salary_egp: z.number().min(0).optional(),
  is_active: z.boolean().optional(),
});

export const DisburseSchema = z.object({
  employee_id: z.number().int().positive(),
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'صيغة التاريخ غير صحيحة — YYYY-MM-DD'),
  paid_via: z.enum(['cash', 'instapay', 'bank_transfer']),
  bank_account_id: z.number().int().positive().nullable().optional(),
  notes_ar: z.string().nullable().optional(),
}).refine(
  (d) => d.paid_via === 'cash' || (d.bank_account_id != null),
  { message: 'bank_account_id مطلوب لطرق الدفع غير النقدي', path: ['bank_account_id'] },
);

export const CreateAdjustmentSchema = z.object({
  employee_id: z.number().int().positive(),
  kind: z.enum(['advance', 'deduction']),
  amount_egp: z.number().positive(),
  salary_month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'صيغة التاريخ غير صحيحة — YYYY-MM-DD'),
  reason_ar: z.string().nullable().optional(),
});

export type CreateEmployeeInput = z.infer<typeof CreateEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof UpdateEmployeeSchema>;
export type DisburseInput = z.infer<typeof DisburseSchema>;
export type CreateAdjustmentInput = z.infer<typeof CreateAdjustmentSchema>;
