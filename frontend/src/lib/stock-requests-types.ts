import type { FabricUnit, ShipmentStatus } from './inventory-types';

/** Request status — derived on the server by stock_request_derived_status(). */
export type StockRequestStatus = 'open' | 'in_progress' | 'awaiting_review' | 'completed' | 'cancelled';

/** Stored item status. */
export type StockRequestItemStatus = 'requested' | 'packing' | 'dispatched' | 'unavailable' | 'cancelled';

/** What the shop sees for one item (derived from the item + its shipment line). */
export type StockRequestItemOutcome =
  | 'waiting'
  | 'packing'
  | 'awaiting_review'
  | 'accepted'
  | 'rejected'
  | 'unavailable'
  | 'cancelled';

export type StockRequestCounts = {
  total: number;
  requested: number;
  packing: number;
  dispatched: number;
  unavailable: number;
  cancelled: number;
  awaiting_review: number;
  accepted: number;
  rejected: number;
};

export type StockRequestListRow = StockRequestCounts & {
  id: number;
  request_no: string;
  status: StockRequestStatus;
  requested_by_user_id: number;
  requested_by_name: string;
  notes_ar: string | null;
  cancelled_at: string | null;
  cancel_reason_ar: string | null;
  created_at: string;
  updated_at: string;
};

export type StockRequestItemEvent = {
  id: number;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_user_id: number | null;
  actor_name: string | null;
  note_ar: string | null;
  shipment_id: number | null;
  created_at: string;
};

export type StockRequestItem = {
  id: number;
  status: StockRequestItemStatus;
  outcome: StockRequestItemOutcome;
  roll_id: number;
  internal_barcode: string;
  external_barcode: string | null;
  fabric_id: number;
  fabric_name_ar: string;
  fabric_unit: FabricUnit;
  color_name_ar: string;
  color_code: string | null;
  weight_kg: string | null;
  length_m: string | null;
  roll_status: string;
  roll_warehouse: string;
  live_available: boolean;
  shipment_id: number | null;
  shipment_no: string | null;
  shipment_status: ShipmentStatus | null;
  line_id: number | null;
  line_status: string | null;
  reject_reason_ar: string | null;
  replaces_item_id: number | null;
  replaced_by_item_id: number | null;
  unavailable_reason_ar: string | null;
  unavailable_at: string | null;
  unavailable_by_user_id: number | null;
  unavailable_by_name: string | null;
  auto_unavailable: boolean;
  can_replace: boolean;
  created_at: string;
  events: StockRequestItemEvent[];
};

export type StockRequestShipment = {
  id: number;
  shipment_no: string;
  status: ShipmentStatus;
  created_by_user_id: number;
  submitted_at: string | null;
  reviewed_at: string | null;
  line_count: number;
  accepted_count: number;
  rejected_count: number;
  pending_count: number;
};

export type StockRequestDetail = {
  id: number;
  request_no: string;
  status: StockRequestStatus;
  requested_by_user_id: number;
  requested_by_name: string;
  notes_ar: string | null;
  cancelled_at: string | null;
  cancel_reason_ar: string | null;
  created_at: string;
  updated_at: string;
  counts: StockRequestCounts;
  draft_shipment: StockRequestShipment | null;
  items: StockRequestItem[];
  shipments: StockRequestShipment[];
};

export type AvailableRoll = {
  id: number;
  internal_barcode: string;
  weight_kg: string | null;
  length_m: string | null;
  fabric_id: number;
  color_id: number;
  fabric_unit: FabricUnit;
  fabric_name_ar: string;
  color_name_ar: string;
  color_code: string | null;
};

export type StockRequestSummary = { to_prepare: number; awaiting_review: number; items_to_pack: number };
