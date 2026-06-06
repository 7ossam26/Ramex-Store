import type { RollWarehouse } from '../items/items.types.js';

export type ShipmentStatus =
  | 'draft' | 'pending_approval' | 'partial_approved'
  | 'approved' | 'rejected' | 'cancelled';

export type ShipmentLineStatus = 'pending' | 'accepted' | 'rejected';

export type Shipment = {
  id: number;
  shipment_no: string;
  created_by_user_id: number;
  submitted_at: Date | null;
  reviewed_by_user_id: number | null;
  reviewed_at: Date | null;
  status: ShipmentStatus;
  notes_ar: string | null;
  supplier_id: number | null;
  created_at: Date;
  updated_at: Date;
};

export type ShipmentLine = {
  id: number;
  shipment_id: number;
  roll_id: number;
  status: ShipmentLineStatus;
  reject_reason_ar: string | null;
  created_at: Date;
  updated_at: Date;
};

export type ShipmentLineDetail = ShipmentLine & {
  fabric_id: number;
  fabric_name_ar: string;
  fabric_unit: 'kg' | 'meter';
  color_name_ar: string;
  color_code: string;
  weight_kg: string;
  length_m: string | null;
  reference_price_per_unit: string | null;
  internal_barcode: string;
};

export type ShipmentWithLines = Shipment & {
  lines: ShipmentLineDetail[];
};

export type DamageReasonCode =
  | 'damage_in_transit' | 'damage_in_shop' | 'damage_quality_defect'
  | 'loss_theft' | 'loss_misplaced' | 'inventory_discrepancy'
  | 'cutting_sample_loss' | 'other';

export type DamageDisposition = 'damaged_stock' | 'return_to_factory' | 'auto_writeoff';

export type DamageEvent = {
  id: number;
  roll_id: number;
  reason_code: DamageReasonCode;
  disposition: DamageDisposition;
  notes_ar: string | null;
  photo_path: string | null;
  valuation_egp: string;
  requires_approval: boolean;
  approved_by_user_id: number | null;
  approved_at: Date | null;
  created_by_user_id: number;
  created_at: Date;
};

export type StocktakeMode = 'roll_level' | 'aggregate';
export type StocktakeStatus = 'open' | 'completed' | 'cancelled';

export type Stocktake = {
  id: number;
  stocktake_no: string;
  mode: StocktakeMode;
  warehouse: RollWarehouse;
  created_by_user_id: number;
  started_at: Date;
  completed_at: Date | null;
  status: StocktakeStatus;
  notes_ar: string | null;
};

export type StocktakeLine = {
  id: number;
  stocktake_id: number;
  roll_id: number | null;
  fabric_id: number | null;
  color_id: number | null;
  expected_count: number | null;
  actual_count: number | null;
  expected_weight_kg: string | null;
  actual_weight_kg: string | null;
  variance: string | null;
  notes_ar: string | null;
};

export type StockEventType =
  | 'factory_in' | 'shipment_out' | 'shipment_in' | 'shipment_reject_back'
  | 'adjustment' | 'damage' | 'loss_writeoff' | 'sample_set'
  | 'return_in' | 'sale_out' | 'reserve' | 'unreserve';

export type StockMovement = {
  id: number;
  roll_id: number;
  from_warehouse: RollWarehouse | null;
  to_warehouse: RollWarehouse | null;
  event_type: StockEventType;
  reference_type: string | null;
  reference_id: number | null;
  actor_user_id: number;
  notes_ar: string | null;
  created_at: Date;
};
