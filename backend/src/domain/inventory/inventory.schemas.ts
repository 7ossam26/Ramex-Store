import { z } from 'zod';

export const WarehouseEnum = z.enum(['shop', 'factory', 'damaged_shop']);

// --- Shipments ---
export const CreateShipmentDraftSchema = z.object({
  notes_ar: z.string().max(2000).nullable().optional(),
});
export type CreateShipmentDraftInput = z.infer<typeof CreateShipmentDraftSchema>;

export const AddShipmentRollSchema = z
  .object({
    roll_id: z.coerce.number().int().positive().optional(),
    internal_barcode: z.string().min(1).max(64).optional(),
  })
  .refine((v) => v.roll_id !== undefined || v.internal_barcode !== undefined, {
    message: 'يجب تحديد roll_id أو internal_barcode',
  });
export type AddShipmentRollInput = z.infer<typeof AddShipmentRollSchema>;

export const ReviewShipmentLineSchema = z.object({
  action: z.enum(['accept', 'reject']),
  reject_reason_ar: z.string().max(500).nullable().optional(),
});
export type ReviewShipmentLineInput = z.infer<typeof ReviewShipmentLineSchema>;

export const AcceptShipmentSchema = z.object({});
export type AcceptShipmentInput = z.infer<typeof AcceptShipmentSchema>;

export const ListFactoryRollsQuerySchema = z.object({
  fabric_id: z.coerce.number().int().positive().optional(),
  color_id: z.coerce.number().int().positive().optional(),
  q: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type ListFactoryRollsQueryInput = z.infer<typeof ListFactoryRollsQuerySchema>;

export const ListShipmentsQuerySchema = z.object({
  status: z.enum(['draft', 'pending_approval', 'partial_approved', 'approved', 'rejected', 'cancelled']).optional(),
  created_by_user_id: z.coerce.number().int().positive().optional(),
});
export type ListShipmentsQueryInput = z.infer<typeof ListShipmentsQuerySchema>;

// --- Damage Events ---
export const DamageReasonCodeEnum = z.enum([
  'damage_in_transit', 'damage_in_shop', 'damage_quality_defect',
  'loss_theft', 'loss_misplaced', 'inventory_discrepancy',
  'cutting_sample_loss', 'other',
]);
export const DamageDispositionEnum = z.enum(['damaged_stock', 'return_to_factory', 'auto_writeoff']);

export const CreateDamageEventSchema = z.object({
  roll_id: z.number().int().positive(),
  reason_code: DamageReasonCodeEnum,
  disposition: DamageDispositionEnum.optional(),
  notes_ar: z.string().max(2000).nullable().optional(),
  photo_path: z.string().max(255).nullable().optional(),
});
export type CreateDamageEventInput = z.infer<typeof CreateDamageEventSchema>;

export const ApproveDamageEventSchema = z.object({
  approve: z.boolean(),
});
export type ApproveDamageEventInput = z.infer<typeof ApproveDamageEventSchema>;

// --- Stocktake ---
export const StartStocktakeSchema = z.object({
  mode: z.enum(['roll_level', 'aggregate']),
  warehouse: WarehouseEnum,
  notes_ar: z.string().max(2000).nullable().optional(),
});
export type StartStocktakeInput = z.infer<typeof StartStocktakeSchema>;

export const RecordScanSchema = z.object({
  barcode: z.string().min(1).max(64),
});
export type RecordScanInput = z.infer<typeof RecordScanSchema>;

export const RecordAggregateSchema = z.object({
  fabric_id: z.number().int().positive(),
  color_id: z.number().int().positive(),
  actual_count: z.number().int().min(0),
  actual_weight_kg: z.number().min(0).optional(),
});
export type RecordAggregateInput = z.infer<typeof RecordAggregateSchema>;

// --- Adjustments ---
export const RollStatusEnum = z.enum([
  'in_stock', 'reserved', 'sold', 'damaged', 'sample', 'returned', 'written_off',
]);

export const CreateAdjustmentSchema = z.object({
  roll_id: z.number().int().positive(),
  new_warehouse: WarehouseEnum.optional(),
  new_status: RollStatusEnum.optional(),
  new_weight_kg: z.number().positive().optional(),
  notes_ar: z.string().min(1).max(2000),
}).refine(
  (v) => v.new_warehouse !== undefined || v.new_status !== undefined || v.new_weight_kg !== undefined,
  { message: 'يجب تحديد قيمة واحدة على الأقل للتعديل' },
);
export type CreateAdjustmentInput = z.infer<typeof CreateAdjustmentSchema>;

// --- Stock Movements query ---
export const StockMovementsQuerySchema = z.object({
  roll_id: z.coerce.number().int().positive().optional(),
  event_type: z.enum([
    'factory_in', 'shipment_out', 'shipment_in', 'shipment_reject_back',
    'adjustment', 'damage', 'loss_writeoff', 'sample_set',
    'return_in', 'sale_out', 'reserve', 'unreserve',
  ]).optional(),
  barcode: z.string().max(64).optional(),
  reference_type: z.string().max(32).optional(),
  reference_id: z.coerce.number().int().positive().optional(),
  from_date: z.string().datetime().optional(),
  to_date: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
export type StockMovementsQueryInput = z.infer<typeof StockMovementsQuerySchema>;

// --- Damage events list query ---
export const ListDamageEventsQuerySchema = z.object({
  roll_id: z.coerce.number().int().positive().optional(),
  reason_code: DamageReasonCodeEnum.optional(),
  requires_approval: z.coerce.boolean().optional(),
});
export type ListDamageEventsQueryInput = z.infer<typeof ListDamageEventsQuerySchema>;
