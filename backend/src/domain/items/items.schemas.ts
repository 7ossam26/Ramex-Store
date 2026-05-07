import { z } from 'zod';

const CompositionItemSchema = z.object({
  material: z.string().min(1),
  percent: z.number().min(0).max(100),
});

export const CreateFabricSchema = z.object({
  code: z.string().min(1).max(32),
  name_ar: z.string().min(1).max(128),
  composition: z.array(CompositionItemSchema).min(1),
  width_cm: z.number().positive(),
  grade: z.string().min(1).max(16),
  notes: z.string().nullable().optional(),
});
export type CreateFabricInput = z.infer<typeof CreateFabricSchema>;

export const UpdateFabricSchema = CreateFabricSchema.extend({
  is_active: z.boolean().optional(),
}).partial();
export type UpdateFabricInput = z.infer<typeof UpdateFabricSchema>;

export const CreateColorSchema = z.object({
  name_ar: z.string().min(1).max(64),
  code: z.string().min(1).max(16),
});
export type CreateColorInput = z.infer<typeof CreateColorSchema>;

export const UpdateColorSchema = CreateColorSchema.extend({
  is_active: z.boolean().optional(),
}).partial();
export type UpdateColorInput = z.infer<typeof UpdateColorSchema>;

export const UpsertPriceSchema = z.object({
  fabric_id: z.number().int().positive(),
  color_id: z.number().int().positive(),
  default_price_per_kg: z.number().positive(),
  default_price_per_roll: z.number().positive().nullable().optional(),
});
export type UpsertPriceInput = z.infer<typeof UpsertPriceSchema>;

export const RollStatusEnum = z.enum([
  'in_stock', 'reserved', 'sold', 'damaged', 'sample', 'returned', 'written_off',
]);
export const RollWarehouseEnum = z.enum(['shop', 'factory', 'damaged_shop']);

export const CreateRollSchema = z.object({
  fabric_id: z.number().int().positive(),
  color_id: z.number().int().positive(),
  weight_kg: z.number().positive(),
  warehouse: RollWarehouseEnum,
  roll_sr_no: z.string().max(32).nullable().optional(),
  order_no: z.string().max(32).nullable().optional(),
  external_barcode: z.string().max(64).nullable().optional(),
  purchase_price_egp: z.number().positive().nullable().optional(),
  selling_price_egp: z.number().positive().optional(),
  is_visible_at_pos: z.boolean().optional().default(true),
});
export type CreateRollInput = z.infer<typeof CreateRollSchema>;

export const UpdateRollSchema = z.object({
  roll_sr_no: z.string().max(32).nullable().optional(),
  order_no: z.string().max(32).nullable().optional(),
  external_barcode: z.string().max(64).nullable().optional(),
  purchase_price_egp: z.number().positive().nullable().optional(),
  selling_price_egp: z.number().positive().optional(),
  weight_kg: z.number().positive().optional(),
  warehouse: RollWarehouseEnum.optional(),
  status: RollStatusEnum.optional(),
  is_visible_at_pos: z.boolean().optional(),
});
export type UpdateRollInput = z.infer<typeof UpdateRollSchema>;

export const ListRollsQuerySchema = z.object({
  fabric_id: z.coerce.number().int().positive().optional(),
  color_id: z.coerce.number().int().positive().optional(),
  status: RollStatusEnum.optional(),
  warehouse: RollWarehouseEnum.optional(),
  is_visible_at_pos: z.coerce.boolean().optional(),
});
