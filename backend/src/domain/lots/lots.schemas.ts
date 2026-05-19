import { z } from 'zod';

// Server assigns lot_no — never accepted from the client.
export const CreateLotSchema = z.object({
  fabric_id: z.number().int().positive(),
  color_id: z.number().int().positive(),
  notes_ar: z.string().max(1000).nullable().optional(),
});
export type CreateLotInput = z.infer<typeof CreateLotSchema>;

export const UpdateLotSchema = z.object({
  notes_ar: z.string().max(1000).nullable().optional(),
});
export type UpdateLotInput = z.infer<typeof UpdateLotSchema>;

export const ListLotsQuerySchema = z.object({
  fabric_id: z.coerce.number().int().positive().optional(),
  color_id: z.coerce.number().int().positive().optional(),
});
export type ListLotsQueryInput = z.infer<typeof ListLotsQuerySchema>;
