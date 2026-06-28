export type StockSummaryRow = {
  fabric_id: number;
  fabric_name_ar: string;
  fabric_code: string;
  color_id: number;
  color_name_ar: string;
  color_code: string;
  count_in_stock: number;
  count_reserved: number;
  count_sold: number;
  count_total: number;
  weight_kg_in_stock: number;
  avg_reference_price_per_unit: number;
  last_reference_price_per_unit: number;
  selling_price_egp: number;
  min_quantity_rolls: number;
};

export type Warehouse = 'shop' | 'factory' | 'damaged_shop';
export type RollStatus =
  | 'in_stock' | 'reserved' | 'sold' | 'damaged'
  | 'sample' | 'returned' | 'written_off';

export type ShipmentStatus =
  | 'draft' | 'pending_approval' | 'partial_approved'
  | 'approved' | 'rejected' | 'cancelled';
export type ShipmentLineStatus = 'pending' | 'accepted' | 'rejected';

export type Shipment = {
  id: number;
  shipment_no: string;
  created_by_user_id: number;
  submitted_at: string | null;
  reviewed_by_user_id: number | null;
  reviewed_at: string | null;
  status: ShipmentStatus;
  notes_ar: string | null;
  created_at: string;
  updated_at: string;
};

export type ShipmentLineDetail = {
  id: number;
  shipment_id: number;
  roll_id: number;
  status: ShipmentLineStatus;
  reject_reason_ar: string | null;
  fabric_id: number;
  fabric_name_ar: string;
  fabric_unit: FabricUnit;
  color_name_ar: string;
  color_code: string;
  weight_kg: string | null;
  length_m: string | null;
  reference_price_per_unit: string | null;
  internal_barcode: string;
};

export type FactoryRollPick = {
  id: number;
  internal_barcode: string;
  weight_kg: string | null;
  length_m: string | null;
  fabric_unit: 'kg' | 'meter';
  fabric_id: number;
  color_id: number;
  fabric_name_ar: string;
  color_name_ar: string;
  color_code: string;
  fabric_code: string;
};

export type ShipmentWithLines = Shipment & { lines: ShipmentLineDetail[] };

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
  approved_at: string | null;
  created_by_user_id: number;
  created_at: string;
};

export type StocktakeMode = 'roll_level' | 'aggregate';
export type StocktakeStatus = 'open' | 'completed' | 'cancelled';

export type Stocktake = {
  id: number;
  stocktake_no: string;
  mode: StocktakeMode;
  warehouse: Warehouse;
  created_by_user_id: number;
  started_at: string;
  completed_at: string | null;
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

export type StocktakeWithLines = Stocktake & { lines: StocktakeLine[] };

export type StockEventType =
  | 'factory_in' | 'shipment_out' | 'shipment_in' | 'shipment_reject_back'
  | 'adjustment' | 'damage' | 'loss_writeoff' | 'sample_set'
  | 'return_in' | 'sale_out' | 'reserve' | 'unreserve'
  | 'shop_to_factory_return';

export type StockMovement = {
  id: number;
  roll_id: number;
  from_warehouse: Warehouse | null;
  to_warehouse: Warehouse | null;
  event_type: StockEventType;
  reference_type: string | null;
  reference_id: number | null;
  actor_user_id: number;
  notes_ar: string | null;
  created_at: string;
  internal_barcode: string;
  fabric_name_ar: string;
  color_name_ar: string;
};

export type FabricUnit = 'kg' | 'meter';
export type FabricCategory = 'main' | 'rib' | 'accessory';

export type Fabric = { id: number; code: string; name_ar: string; unit: FabricUnit; category: FabricCategory | null };
export type Color = { id: number; name_ar: string; code: string };

export type FabricFull = {
  id: number;
  code: string;
  name_ar: string;
  gsm: number | null;
  mad_m: number | null;
  width_cm: string;
  grade: string;
  notes: string | null;
  is_active: boolean;
  unit: FabricUnit;
  category: FabricCategory | null;
  supplier_code: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateFabricInput = {
  name_ar: string;
  width_cm: number;
  grade: string;
  notes?: string | null;
  unit: FabricUnit;
  category?: FabricCategory | null;
  supplier_code?: string | null;
  gsm?: number | null;
  mad_m?: number | null;
};

export type UpdateFabricInput = Partial<CreateFabricInput> & {
  is_active?: boolean;
  default_grade_id?: number | null;
  default_composition_id?: number | null;
  default_brand_id?: number | null;
  default_width_cm?: number | null;
};

// Tops batch (one-shot wizard) — input for POST /tops/batch
export type FabricRef =
  | { id: number }
  | {
      name_ar: string;
      width_cm: number;
      grade: string;
      notes?: string | null;
      unit?: FabricUnit;
      supplier_code?: string | null;
      gsm?: number | null;
      mad_m?: number | null;
    };

export type ColorRef =
  | { id: number }
  | { name_ar: string };

export type TopRollEntry = {
  color: ColorRef;
  weight_kg?: number;
  width_cm: number;
  length_m?: number | null;
  lot_id?: number | null;
  roll_sr_no?: string | null;
  order_no?: string | null;
  supplier_order_no?: string | null;
  top_number?: number | null;
  grade_id?: number | null;
  composition_id?: number | null;
  brand_id?: number | null;
};

export type CreateTopBatchInput = {
  fabric: FabricRef;
  rolls: TopRollEntry[];
};

export type CreatedTopRoll = {
  id: number;
  internal_barcode: string;
  fabric_id: number;
  color_id: number;
  lot_id: number | null;
  weight_kg: string | null;
  length_m: string | null;
  selling_price_egp: string | null;
  status: string;
  warehouse: string;
  fabric_code: string;
  fabric_name_ar: string;
  fabric_unit: FabricUnit;
  color_name_ar: string;
  color_code: string;
  lot_no: string | null;
};

export type Lot = {
  id: number;
  lot_no: string;
  fabric_id: number;
  color_id: number;
  notes_ar: string | null;
  fabric_code: string;
  fabric_name_ar: string;
  color_name_ar: string;
  color_code: string;
  created_at: string;
  updated_at: string;
};

export type CreateLotInput = {
  fabric_id: number;
  color_id: number;
  notes_ar?: string | null;
};

export type CreateTopBatchResult = {
  fabric: { id: number; code: string; name_ar: string };
  rolls: CreatedTopRoll[];
};
