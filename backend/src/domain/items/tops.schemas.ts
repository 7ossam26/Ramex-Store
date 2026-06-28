import { z } from 'zod';

const FabricRefSchema = z.union([
  z.object({ id: z.number().int().positive() }),
  z.object({
    name_ar: z.string().min(1).max(128),
    width_cm: z.number().positive(),
    grade: z.string().min(1).max(16),
    notes: z.string().nullable().optional(),
    gsm: z.number().positive().nullable().optional(),
    mad_m: z.number().positive().nullable().optional(),
  }),
]);

const ColorRefSchema = z.union([
  z.object({ id: z.number().int().positive() }),
  z.object({
    name_ar: z.string().min(1).max(64),
  }),
]);

const TopRollEntrySchema = z.object({
  color: ColorRefSchema,
  weight_kg: z.number().positive().optional(),
  length_m: z.number().positive().nullable().optional(),
  lot_id: z.number().int().positive().nullable().optional(),
  roll_sr_no: z.string().max(32).nullable().optional(),
  order_no: z.string().max(32).nullable().optional(),
  supplier_order_no: z.string().max(64).nullable().optional(),
  top_number: z.number().int().positive().nullable().optional(),
  width_cm: z.number().int().min(1).max(500),
  grade_id: z.number().int().positive().nullable().optional(),
  composition_id: z.number().int().positive().nullable().optional(),
  brand_id: z.number().int().positive().nullable().optional(),
});

export const CreateTopBatchSchema = z.object({
  fabric: FabricRefSchema,
  rolls: z.array(TopRollEntrySchema).min(1),
});

export type CreateTopBatchInput = z.infer<typeof CreateTopBatchSchema>;
