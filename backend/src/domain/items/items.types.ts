export type FabricUnit = 'kg' | 'meter';
export type FabricCategory = 'main' | 'rib' | 'accessory';

export type Fabric = {
  id: number;
  code: string;
  name_ar: string;
  composition: Array<{ material: string; percent: number }>;
  width_cm: string;
  grade: string;
  notes: string | null;
  is_active: boolean;
  unit: FabricUnit;
  category: FabricCategory | null;
  supplier_code: string | null;
  default_width_cm: number | null;
  default_grade_id: number | null;
  default_color_id: number | null;
  default_composition_id: number | null;
  default_brand_id: number | null;
  created_at: Date;
  updated_at: Date;
};

export type Color = {
  id: number;
  name_ar: string;
  code: string;
  english_name: string | null;
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
  supplier_order_no: string | null;
  top_number: number | null;
  width_cm: number | null;
  grade_id: number | null;
  composition_id: number | null;
  brand_id: number | null;
  weight_kg: string;
  length_m: string | null;
  lot_id: number | null;
  reference_price_per_unit: string | null;
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
  fabric_unit: FabricUnit;
  color_name_ar: string;
  color_code: string;
  lot_no: string | null;
};

export type DamageContext = {
  pending: boolean;
  reason_code: string;
  notes_ar: string | null;
  event_created_at: Date;
};

export type RollWithLabelDetails = RollWithDetails & {
  grade_arabic_name: string | null;
  composition_description: string | null;
  brand_arabic_name: string | null;
  brand_product_line: string | null;
  supplier_arabic_name: string | null;
  supplier_arabic_warning_text: string | null;
  damage_context: DamageContext | null;
};
