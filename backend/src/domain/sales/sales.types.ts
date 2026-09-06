export type InvoiceStatus =
  | 'open'
  | 'closed_pending_pickup'
  | 'completed'
  | 'cancelled'
  | 'deposit_refunded'
  | 'returned'
  | 'partially_returned';

/**
 * Statuses in which an invoice represents a realised sale (a completed-or-
 * later state). Reports sum against this set instead of the single value
 * `'completed'` so returning some/all lines does not remove the invoice from
 * gross-sales totals — the offsetting refund is reported separately from
 * `returns`, exactly as it was before returns touched invoice status at all.
 */
export const SALE_REALIZED_STATUSES = ['completed', 'partially_returned', 'returned'] as const;

/** Statuses from which a return/refund may still be processed. */
export const RETURNABLE_INVOICE_STATUSES = ['completed', 'partially_returned'] as const;

/**
 * Statuses a return attempt is allowed to reach the per-line "already
 * returned" check from. Includes `returned` (unlike RETURNABLE_INVOICE_STATUSES)
 * so that re-attempting a return on an already-fully-returned invoice fails
 * with the precise, existing RETURN_LINE_ALREADY_RETURNED error («تم إرجاع
 * هذا السطر مسبقاً») instead of a generic invoice-status rejection.
 */
export const RETURN_ATTEMPTABLE_STATUSES = ['completed', 'partially_returned', 'returned'] as const;

export type PaymentMethod = 'cash' | 'instapay' | 'bank_transfer' | 'cheque';

export type ChequeDetails = {
  chequeNumber: string;
  bankNameAr: string;
  branchAr?: string | null;
  issuerNameAr?: string | null;
  issueDate: string; // YYYY-MM-DD
  dueDate: string;   // YYYY-MM-DD
  notesAr?: string | null;
};
export type PaymentKind = 'deposit' | 'final' | 'refund';
export type FulfillmentDestination = 'shop' | 'factory_direct';

export type Invoice = {
  id: number;
  invoice_no: string;
  customer_id: number;
  cashier_user_id: number;
  status: InvoiceStatus;
  fulfillment_destination: FulfillmentDestination;
  subtotal_egp: string;
  cart_discount_egp: string;
  final_discount_egp: string;
  tax_egp: string;
  rounding_egp: string;
  total_egp: string;
  paid_egp: string;
  balance_egp: string;
  notes_ar: string | null;
  created_at: string;
  closed_at: string | null;
  pickup_at: string | null;
  cancelled_at: string | null;
  cancelled_reason_ar: string | null;
  returned_amount_egp: string;
  returned_at: string | null;
};

export type InvoiceLine = {
  id: number;
  invoice_id: number;
  item_type: 'roll' | 'accessory';
  roll_id: number | null;
  accessory_id: number | null;
  qty_pieces: number | null;
  sold_quantity: string | null;
  sold_unit: 'kg' | 'meter' | null;
  selling_price_egp: string;
  line_discount_egp: string;
  line_total_egp: string;
  final_price_per_unit: string | null;
};

export type Payment = {
  id: number;
  invoice_id: number;
  method: PaymentMethod;
  amount_egp: string;
  payment_kind: PaymentKind;
  bank_account_id: number | null;
  reference: string | null;
  notes_ar: string | null;
  actor_user_id: number;
  created_at: string;
};

export type SalePreview = {
  subtotal_egp: number;
  cart_discount_egp: number;
  effective_discount_percent: number;
  tax_egp: number;
  rounding_egp: number;
  total_egp: number;
  tax_enabled: boolean;
};

export type InvoiceLineWithDetail = InvoiceLine & {
  fabric_name_ar: string | null;
  fabric_unit: 'kg' | 'meter' | null;
  color_name_ar: string | null;
  color_code: string | null;
  roll_sr_no: string | null;
  weight_kg: string | null;
  length_m: string | null;
  reference_price_per_unit: string | null;
  accessory_name_ar: string | null;
  internal_barcode: string;
  /** How much of this line has already been returned — roll lines only (null for accessory lines, which stay whole-line). */
  returned_quantity: number | null;
  /** What's still returnable on this line right now — roll lines only. */
  remaining_returnable_quantity: number | null;
  /** Whether ANY return already exists against this line (roll or accessory). */
  is_returned: boolean;
};

export type InvoiceDetail = Invoice & {
  customer_name_ar: string;
  customer_phone: string;
  customer_code: string;
  customer_address_ar: string | null;
  cashier_username: string;
  lines: InvoiceLineWithDetail[];
  payments: Payment[];
};

export type RollSaleLine = {
  type?: 'roll';
  rollId: number;
  sellingPriceOverride?: number | null;
  finalPricePerUnit?: number | null;
  lineDiscountEgp?: number | null;
};

export type AccessorySaleLine = {
  type: 'accessory';
  accessoryId: number;
  qtyPieces: number;
  finalPricePerPiece: number;
  lineDiscountEgp?: number | null;
};

export type CreateSaleInput = {
  customerId: number;
  fulfillmentDestination?: FulfillmentDestination;
  lines: Array<RollSaleLine | AccessorySaleLine>;
  cartTargetFinal?: number | null;
  payments: Array<{
    method: PaymentMethod;
    amount: number;
    bankAccountId?: number | null;
    reference?: string | null;
    chequeDetails?: ChequeDetails | null;
  }>;
  notesAr?: string | null;
};

export type AddLinesInput = {
  lines: Array<{
    rollId: number;
    sellingPriceOverride?: number | null;
    finalPricePerUnit?: number | null;
    lineDiscountEgp?: number | null;
  }>;
  cartTargetFinal?: number | null;
};

export type DepositRefundInput = {
  amountEgp: number;
  method: PaymentMethod;
  bankAccountId?: number | null;
  reference?: string | null;
  chequeDetails?: ChequeDetails | null;
};

export type Cheque = {
  id: number;
  payment_id: number;
  cheque_number: string;
  bank_name_ar: string;
  branch_ar: string | null;
  issuer_name_ar: string | null;
  amount_egp: string;
  issue_date: string;
  due_date: string;
  status: 'pending' | 'cleared' | 'bounced' | 'cancelled';
  notes_ar: string | null;
  created_at: string;
  updated_at: string;
};
