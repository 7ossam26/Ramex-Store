import { z } from 'zod';

const egyptianPhone = z
  .string()
  .regex(/^01[0125]\d{8}$/, 'رقم الهاتف غير صحيح — الصيغة المطلوبة: 01[0125]XXXXXXXX')
  .nullable()
  .optional();

export const CreateEmployeeSchema = z.object({
  name_ar: z.string().min(1, 'اسم الموظف مطلوب').max(128, 'الاسم طويل جداً (128 حرفاً كحد أقصى)'),
  phone: egyptianPhone,
  role_ar: z.string().max(64, 'المسمى الوظيفي طويل جداً (64 حرفاً كحد أقصى)').nullable().optional(),
  base_salary_egp: z.number({ invalid_type_error: 'الراتب يجب أن يكون رقماً' }).min(0, 'الراتب لا يمكن أن يكون سالباً'),
});

export const UpdateEmployeeSchema = z.object({
  name_ar: z.string().min(1, 'اسم الموظف مطلوب').max(128, 'الاسم طويل جداً (128 حرفاً كحد أقصى)').optional(),
  phone: egyptianPhone,
  role_ar: z.string().max(64, 'المسمى الوظيفي طويل جداً (64 حرفاً كحد أقصى)').nullable().optional(),
  base_salary_egp: z.number({ invalid_type_error: 'الراتب يجب أن يكون رقماً' }).min(0, 'الراتب لا يمكن أن يكون سالباً').optional(),
  is_active: z.boolean().optional(),
});

/** Salaries are weekly, paid every Thursday: pay dates must be a Thursday. */
export function isThursday(date: string): boolean {
  return new Date(`${date}T00:00:00Z`).getUTCDay() === 4;
}

const PAY_DATE_NOT_THURSDAY = 'تاريخ الصرف يجب أن يكون يوم خميس';

export const DisburseSchema = z.object({
  employee_id: z.number().int().positive(),
  // Weekly pay date (a Thursday). Column is still named `month` for history.
  month: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'صيغة التاريخ غير صحيحة — YYYY-MM-DD')
    .refine(isThursday, PAY_DATE_NOT_THURSDAY),
  paid_via: z.enum(['cash', 'instapay', 'bank_transfer']),
  bank_account_id: z.number().int().positive().nullable().optional(),
  advance_repayment_egp: z.number().min(0, 'لا يمكن أن يكون مبلغ خصم السُّلفة سالباً').optional().default(0),
  notes_ar: z.string().nullable().optional(),
}).refine(
  (d) => d.paid_via === 'cash' || (d.bank_account_id != null),
  { message: 'bank_account_id مطلوب لطرق الدفع غير النقدي', path: ['bank_account_id'] },
);

export const CreateAdjustmentSchema = z.object({
  employee_id: z.number().int().positive(),
  kind: z.enum(['advance', 'deduction']),
  amount_egp: z.number({ invalid_type_error: 'المبلغ يجب أن يكون رقماً' }).positive('المبلغ يجب أن يكون أكبر من صفر'),
  salary_month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'صيغة التاريخ غير صحيحة — YYYY-MM-DD'),
  reason_ar: z.string().nullable().optional(),
}).refine(
  // A deduction is netted against that Thursday's salary, so it must name one.
  (d) => d.kind !== 'deduction' || isThursday(d.salary_month),
  { message: PAY_DATE_NOT_THURSDAY, path: ['salary_month'] },
);

export const RepayAdvanceSchema = z.object({
  amount_egp: z.number({ invalid_type_error: 'المبلغ يجب أن يكون رقماً' }).positive('المبلغ يجب أن يكون أكبر من صفر'),
  paid_via: z.enum(['cash', 'instapay', 'bank_transfer']),
  bank_account_id: z.number().int().positive().nullable().optional(),
  notes_ar: z.string().nullable().optional(),
}).refine(
  (d) => d.paid_via === 'cash' || (d.bank_account_id != null),
  { message: 'bank_account_id مطلوب لطرق الدفع غير النقدي', path: ['bank_account_id'] },
);

export type CreateEmployeeInput = z.infer<typeof CreateEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof UpdateEmployeeSchema>;
export type DisburseInput = z.infer<typeof DisburseSchema>;
export type CreateAdjustmentInput = z.infer<typeof CreateAdjustmentSchema>;
export type RepayAdvanceInput = z.infer<typeof RepayAdvanceSchema>;
