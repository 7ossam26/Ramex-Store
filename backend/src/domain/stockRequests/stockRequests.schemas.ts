import { z } from 'zod';

const RollIds = z
  .array(z.coerce.number().int().positive())
  .min(1, 'اختر توباً واحداً على الأقل')
  .max(500);

export const CreateStockRequestSchema = z.object({
  roll_ids: RollIds,
  notes_ar: z.string().trim().max(1000).nullable().optional(),
});
export type CreateStockRequestInput = z.infer<typeof CreateStockRequestSchema>;

export const AddRequestItemsSchema = z.object({
  roll_ids: RollIds,
  /** The unavailable / rejected item these tops replace (or retry). */
  replaces_item_id: z.coerce.number().int().positive().optional(),
});
export type AddRequestItemsInput = z.infer<typeof AddRequestItemsSchema>;

export const ReasonSchema = z.object({
  reason_ar: z.string().trim().min(2, 'السبب مطلوب').max(500),
});
export type ReasonInput = z.infer<typeof ReasonSchema>;

export const OptionalReasonSchema = z.object({
  reason_ar: z.string().trim().max(500).nullable().optional(),
});

const BoolFlag = z.union([z.literal('1'), z.literal('true'), z.literal('0'), z.literal('false')])
  .transform((v) => v === '1' || v === 'true');

export const ListStockRequestsQuerySchema = z.object({
  /** comma separated list of request statuses */
  status: z.string().max(100).optional(),
  /** only requests that still need attention (open / in_progress / awaiting_review) */
  active: BoolFlag.optional(),
  mine: BoolFlag.optional(),
  q: z.string().trim().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type ListStockRequestsQueryInput = z.infer<typeof ListStockRequestsQuerySchema>;

export const AvailableRollsQuerySchema = z.object({
  fabric_id: z.coerce.number().int().positive().optional(),
  color_id: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type AvailableRollsQueryInput = z.infer<typeof AvailableRollsQuerySchema>;
