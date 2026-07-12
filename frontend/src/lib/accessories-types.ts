export type Accessory = {
  id: number;
  internal_barcode: string;
  name_ar: string;
  qty_in_stock: number;
  selling_price_egp: string | null;
  notes_ar: string | null;
  is_active: boolean;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
};

export type CreateAccessoryBody = {
  name_ar: string;
  quantity: number;
  selling_price_egp?: number | null;
  notes_ar?: string | null;
};

export type UpdateAccessoryBody = {
  name_ar?: string;
  selling_price_egp?: number | null;
  notes_ar?: string | null;
};
