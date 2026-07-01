export type InvoiceStatus =
  | 'open'
  | 'closed_pending_pickup'
  | 'completed'
  | 'cancelled'
  | 'deposit_refunded';
export type PaymentMethod = 'cash' | 'instapay' | 'bank_transfer' | 'cheque';
export type PaymentKind = 'deposit' | 'final' | 'refund';

export type ChequeDetails = {
  chequeNumber: string;
  bankNameAr: string;
  branchAr?: string | null;
  issuerNameAr?: string | null;
  issueDate: string;
  dueDate: string;
  notesAr?: string | null;
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
  invoice_no: string | null;
  customer_name_ar: string | null;
};
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
};

export type InvoiceListRow = Invoice & { customer_name_ar: string };
export type OpenInvoiceRow = InvoiceListRow & {
  age_days: number;
  is_stale: boolean;
  stale_threshold_days: number;
  line_count: number;
};
export type PendingPickupRow = InvoiceListRow & { customer_phone: string };

export type InvoiceStatusHistoryEntry = {
  id: number;
  invoice_id: number;
  from_status: string | null;
  to_status: string;
  actor_user_id: number;
  actor_username: string | null;
  notes_ar: string | null;
  created_at: string;
};

export type DepositHandling = 'full_refund' | 'partial_refund' | 'keep_as_credit';

export type FinalPaymentBody = {
  payments: Array<{
    method: PaymentMethod;
    amount: number;
    bankAccountId?: number | null;
    reference?: string | null;
    chequeDetails?: ChequeDetails | null;
  }>;
};

export type CancelOpenInvoiceBody = {
  deposit_handling: DepositHandling;
  refund_method?: PaymentMethod | null;
  partial_refund_amount?: number | null;
  bank_account_id?: number | null;
  reference?: string | null;
  cheque_details?: ChequeDetails | null;
  notes_ar: string;
};

export type AddOpenInvoiceLinesBody = {
  lines: SaleLineInput[];
  cartTargetFinal?: number | null;
};

export type DepositRefundBody = {
  amountEgp: number;
  method: PaymentMethod;
  bankAccountId?: number | null;
  reference?: string | null;
  chequeDetails?: ChequeDetails | null;
};

export type InvoiceLineDetail = {
  id: number;
  invoice_id: number;
  item_type: 'roll' | 'accessory';
  roll_id: number | null;
  accessory_id: number | null;
  qty_pieces: number | null;
  selling_price_egp: string;
  line_discount_egp: string;
  line_total_egp: string;
  final_price_per_unit: string | null;
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

export type InvoiceDetail = Invoice & {
  customer_name_ar: string;
  customer_phone: string;
  customer_code: string;
  customer_address_ar: string | null;
  cashier_username: string;
  lines: InvoiceLineDetail[];
  payments: Payment[];
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

export type RollSaleLineInput = {
  type?: 'roll';
  rollId: number;
  sellingPriceOverride?: number | null;
  finalPricePerUnit?: number | null;
  lineDiscountEgp?: number | null;
};

export type AccessorySaleLineInput = {
  type: 'accessory';
  accessoryId: number;
  qtyPieces: number;
  finalPricePerPiece: number;
  lineDiscountEgp?: number | null;
};

export type SaleLineInput = RollSaleLineInput | AccessorySaleLineInput;

export type SalePaymentInput = {
  method: PaymentMethod;
  amount: number;
  bankAccountId?: number | null;
  reference?: string | null;
  chequeDetails?: ChequeDetails | null;
};

export type CreateSaleBody = {
  customerId: number;
  fulfillmentDestination?: FulfillmentDestination;
  lines: SaleLineInput[];
  cartTargetFinal?: number | null;
  payments: SalePaymentInput[];
  notesAr?: string | null;
};

export type BankAccount = {
  id: number;
  name_ar: string;
  account_number: string | null;
  is_active: boolean;
  is_default: boolean;
  current_balance_egp: string;
};

// Phase 6 — Return on Scan
export type ReturnScanMeta = {
  rollId: number;
  rollInternalBarcode: string;
  rollSrNo: string | null;
  fabricNameAr: string;
  colorNameAr: string;
  colorCode: string | null;
  refundEgp: number;
  originalInvoiceId: number;
  originalInvoiceNo: string;
  customerNameAr: string;
  customerPhone: string;
  saleDate: string;
};

export type ScanReturnResult = {
  id: number;
  return_no: string;
  total_refund_egp: string;
  refundEgp: number;
  originalInvoiceNo: string;
};

export type DamageContext = {
  pending: boolean;
  reason_code: string;
  notes_ar: string | null;
  event_created_at: string;
};

export type RollLookup = {
  id: number;
  internal_barcode: string;
  external_barcode: string | null;
  fabric_id: number;
  color_id: number;
  fabric_code: string;
  fabric_name_ar: string;
  fabric_unit: 'kg' | 'meter';
  color_name_ar: string;
  color_code: string;
  roll_sr_no: string | null;
  weight_kg: string | null;
  length_m: string | null;
  reference_price_per_unit: string | null;
  selling_price_egp: string | null;
  status: string;
  warehouse: string;
  is_visible_at_pos: boolean;
  // Phase 5 enriched label fields — optional, may be null on legacy rolls
  width_cm?: number | null;
  grade_arabic_name?: string | null;
  gsm?: number | null;
  mad_m?: number | null;
  brand_arabic_name?: string | null;
  brand_product_line?: string | null;
  supplier_arabic_name?: string | null;
  supplier_arabic_warning_text?: string | null;
  damage_context?: DamageContext | null;
};
