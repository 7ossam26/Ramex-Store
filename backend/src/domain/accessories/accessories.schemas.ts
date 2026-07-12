import { z } from 'zod';

export const CreateAccessorySchema = z.object({
  name_ar: z.string().min(1).max(255),
  quantity: z.coerce.number().int().positive(),
  selling_price_egp: z.coerce.number().min(0).nullable().optional(),
  notes_ar: z.string().max(2000).nullable().optional(),
});
export type CreateAccessoryInput = z.infer<typeof CreateAccessorySchema>;

export const UpdateAccessorySchema = z.object({
  name_ar: z.string().min(1).max(255).optional(),
  selling_price_egp: z.coerce.number().min(0).nullable().optional(),
  notes_ar: z.string().max(2000).nullable().optional(),
});
export type UpdateAccessoryInput = z.infer<typeof UpdateAccessorySchema>;

export const SearchAccessoriesQuerySchema = z.object({
  q: z.string().optional(),
  is_active: z
    .string()
    .optional()
    .transform((v) => (v === 'false' ? false : v === 'true' ? true : undefined)),
});
export type SearchAccessoriesQueryInput = z.infer<typeof SearchAccessoriesQuerySchema>;
