export type Fabric = {
  id: number;
  code: string;
  name_ar: string;
  composition: Array<{ material: string; percent: number }>;
  width_cm: string;
  grade: string;
  notes: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

export type Color = {
  id: number;
  name_ar: string;
  code: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

export type FabricColorPrice = {
  id: number;
  fabric_id: number;
  color_id: number;
  default_price_per_kg: string;
  default_price_per_roll: string | null;
  created_at: Date;
  updated_at: Date;
};

export type RollStatus =
  | 'in_stock' | 'reserved' | 'sold' | 'damaged'
  | 'sample' | 'returned' | 'written_off';

export type RollWarehouse = 'shop' | 'factory' | 'damaged_shop';

export type Roll = {
  id: number;
  internal_barcode: string;
  external_barcode: string | null;
  fabric_id: number;
  color_id: number;
  roll_sr_no: string | null;
  order_no: string | null;
  weight_kg: string;
  purchase_price_egp: string | null;
  selling_price_egp: string;
  status: RollStatus;
  warehouse: RollWarehouse;
  is_visible_at_pos: boolean;
  received_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type RollWithDetails = Roll & {
  fabric_code: string;
  fabric_name_ar: string;
  color_name_ar: string;
  color_code: string;
};
