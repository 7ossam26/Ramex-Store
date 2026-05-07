export type InvoiceStatus = 'open' | 'closed_pending_pickup' | 'completed' | 'cancelled';
export type PaymentMethod = 'cash' | 'instapay';
export type PaymentKind = 'deposit' | 'final' | 'refund';

export type Invoice = {
  id: number;
  invoice_no: string;
  customer_id: number;
  cashier_user_id: number;
  status: InvoiceStatus;
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
export type OpenInvoiceRow = InvoiceListRow & { age_days: number };
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
  }>;
};

export type CancelOpenInvoiceBody = {
  deposit_handling: DepositHandling;
  refund_method?: PaymentMethod | null;
  partial_refund_amount?: number | null;
  notes_ar: string;
};

export type InvoiceLineDetail = {
  id: number;
  invoice_id: number;
  roll_id: number;
  selling_price_egp: string;
  line_discount_egp: string;
  line_total_egp: string;
  fabric_name_ar: string;
  color_name_ar: string;
  color_code: string | null;
  roll_sr_no: string | null;
  weight_kg: string;
  internal_barcode: string;
};

export type Payment = {
  id: number;
  invoice_id: number;
  method: PaymentMethod;
  amount_egp: string;
  payment_kind: PaymentKind;
  bank_account_id: number | null;
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

export type SaleLineInput = {
  rollId: number;
  sellingPriceOverride?: number | null;
  lineDiscountEgp?: number | null;
};

export type SalePaymentInput = {
  method: PaymentMethod;
  amount: number;
  bankAccountId?: number | null;
};

export type CreateSaleBody = {
  customerId: number;
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

export type RollLookup = {
  id: number;
  internal_barcode: string;
  external_barcode: string | null;
  fabric_id: number;
  color_id: number;
  fabric_code: string;
  fabric_name_ar: string;
  color_name_ar: string;
  color_code: string;
  roll_sr_no: string | null;
  weight_kg: string;
  selling_price_egp: string;
  status: string;
  warehouse: string;
  is_visible_at_pos: boolean;
};
