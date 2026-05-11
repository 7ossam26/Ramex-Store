export type RollWithDetails = {
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
  selling_price_egp: string;
  status: string;
  warehouse: string;
  is_visible_at_pos: boolean;
  received_at: string | null;
  fabric_code: string;
  fabric_name_ar: string;
  color_name_ar: string;
  color_code: string;
  created_at: string;
  updated_at: string;
};

export type RollWithLabelDetails = RollWithDetails & {
  grade_arabic_name: string | null;
  composition_description: string | null;
  brand_arabic_name: string | null;
  brand_product_line: string | null;
  supplier_arabic_name: string | null;
  supplier_arabic_warning_text: string | null;
};
