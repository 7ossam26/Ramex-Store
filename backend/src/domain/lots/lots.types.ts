export type Lot = {
  id: number;
  lot_no: string;
  fabric_id: number;
  color_id: number;
  notes_ar: string | null;
  created_at: Date;
  updated_at: Date;
};

export type LotWithDetails = Lot & {
  fabric_code: string;
  fabric_name_ar: string;
  color_name_ar: string;
  color_code: string;
};
