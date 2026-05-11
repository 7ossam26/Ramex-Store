import { z } from 'zod';
import { RollWarehouseEnum } from './items.schemas.js';

const CompositionItemSchema = z.object({
  material: z.string().min(1),
  percent: z.number().min(0).max(100),
});

const FabricRefSchema = z.union([
  z.object({ id: z.number().int().positive() }),
  z.object({
    code: z.string().min(1).max(32),
    name_ar: z.string().min(1).max(128),
    composition: z.array(CompositionItemSchema).min(1),
    width_cm: z.number().positive(),
    grade: z.string().min(1).max(16),
    notes: z.string().nullable().optional(),
  }),
]);

const ColorRefSchema = z.union([
  z.object({ id: z.number().int().positive() }),
  z.object({
    name_ar: z.string().min(1).max(64),
    code: z.string().min(1).max(16),
  }),
]);

const TopRollEntrySchema = z.object({
  color: ColorRefSchema,
  weight_kg: z.number().positive(),
  selling_price_egp: z.number().positive().optional(),
  set_default_price_per_kg: z.number().positive().optional(),
  roll_sr_no: z.string().max(32).nullable().optional(),
  order_no: z.string().max(32).nullable().optional(),
  purchase_price_egp: z.number().positive().nullable().optional(),
  // Label fields (Phase 5)
  supplier_order_no: z.string().max(64).nullable().optional(),
  top_number: z.number().int().positive().nullable().optional(),
  width_cm: z.number().int().min(1).max(500).nullable().optional(),
  grade_id: z.number().int().positive().nullable().optional(),
  composition_id: z.number().int().positive().nullable().optional(),
  brand_id: z.number().int().positive().nullable().optional(),
});

export const CreateTopBatchSchema = z.object({
  fabric: FabricRefSchema,
  rolls: z.array(TopRollEntrySchema).min(1),
  warehouse: RollWarehouseEnum.optional().default('shop'),
});

export type CreateTopBatchInput = z.infer<typeof CreateTopBatchSchema>;
