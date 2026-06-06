import { z } from 'zod';

const CompositionBreakdownItemSchema = z.object({
  material: z.string().min(1),
  percent: z.number().min(0).max(100),
});

export const CreateGradeSchema = z.object({
  arabic_name: z.string().min(1, 'الاسم العربي مطلوب').max(128, 'الاسم طويل جداً'),
  english_name: z.string().max(128).nullable().optional(),
});

export const CreateColorCodeSchema = z.object({
  name_ar: z.string().min(1, 'الاسم مطلوب').max(64, 'الاسم طويل جداً'),
  code: z.string().min(1, 'الكود مطلوب').max(16, 'الكود طويل جداً'),
  english_name: z.string().max(128).nullable().optional(),
});

export const CreateCompositionSchema = z.object({
  arabic_name: z.string().min(1, 'الاسم العربي مطلوب').max(128, 'الاسم طويل جداً'),
  english_name: z.string().max(128).nullable().optional(),
  description: z.string().nullable().optional(),
  breakdown: z.array(CompositionBreakdownItemSchema).nullable().optional(),
});

export const CreateBrandSchema = z.object({
  arabic_name: z.string().min(1, 'الاسم العربي مطلوب').max(128, 'الاسم طويل جداً'),
  english_name: z.string().max(128).nullable().optional(),
  product_line: z.string().nullable().optional(),
  supplier_id: z.number().int().positive().nullable().optional(),
});

export const CreateSupplierSchema = z.object({
  arabic_name: z.string().min(1, 'الاسم العربي مطلوب').max(128, 'الاسم طويل جداً'),
  english_name: z.string().max(128).nullable().optional(),
  arabic_warning_text: z.string().nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
});

export const UpdateGradeSchema = CreateGradeSchema.extend({
  is_active: z.boolean().optional(),
}).partial();

export const UpdateColorCodeSchema = CreateColorCodeSchema.extend({
  is_active: z.boolean().optional(),
}).partial();

export const UpdateCompositionSchema = CreateCompositionSchema.extend({
  is_active: z.boolean().optional(),
}).partial();

export const UpdateBrandSchema = CreateBrandSchema.extend({
  is_active: z.boolean().optional(),
}).partial();

export const UpdateSupplierSchema = CreateSupplierSchema.extend({
  is_active: z.boolean().optional(),
}).partial();

export const ListCodesQuerySchema = z.object({
  active: z.enum(['true', 'false', 'all']).optional().default('true'),
});

export const SoftDeleteBodySchema = z.object({
  force: z.boolean().optional().default(false),
});

export type CreateGradeInput = z.infer<typeof CreateGradeSchema>;
export type UpdateGradeInput = z.infer<typeof UpdateGradeSchema>;
export type CreateColorCodeInput = z.infer<typeof CreateColorCodeSchema>;
export type UpdateColorCodeInput = z.infer<typeof UpdateColorCodeSchema>;
export type CreateCompositionInput = z.infer<typeof CreateCompositionSchema>;
export type UpdateCompositionInput = z.infer<typeof UpdateCompositionSchema>;
export type CreateBrandInput = z.infer<typeof CreateBrandSchema>;
export type UpdateBrandInput = z.infer<typeof UpdateBrandSchema>;
export type CreateSupplierInput = z.infer<typeof CreateSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof UpdateSupplierSchema>;
