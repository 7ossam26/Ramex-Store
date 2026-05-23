import { z } from 'zod';

export const OpenShiftSchema = z.object({
  notes_ar: z.string().max(500).nullable().optional(),
});

export const CloseShiftSchema = z.object({
  notes_ar: z.string().max(500).nullable().optional(),
});

export const ListShiftsQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type OpenShiftInput = z.infer<typeof OpenShiftSchema>;
export type CloseShiftInput = z.infer<typeof CloseShiftSchema>;
export type ListShiftsQueryInput = z.infer<typeof ListShiftsQuerySchema>;
