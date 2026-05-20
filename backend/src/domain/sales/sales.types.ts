export type InvoiceStatus = 'open' | 'closed_pending_pickup' | 'completed' | 'cancelled';
export type PaymentMethod = 'cash' | 'instapay';
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

export type InvoiceLine = {
  id: number;
  invoice_id: number;
  roll_id: number;
  selling_price_egp: string;
  line_discount_egp: string;
  line_total_egp: string;
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
  fabric_name_ar: string;
  color_name_ar: string;
  color_code: string | null;
  roll_sr_no: string | null;
  weight_kg: string;
  internal_barcode: string;
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

export type CreateSaleInput = {
  customerId: number;
  fulfillmentDestination?: FulfillmentDestination;
  lines: Array<{
    rollId: number;
    sellingPriceOverride?: number | null;
    lineDiscountEgp?: number | null;
  }>;
  cartTargetFinal?: number | null;
  payments: Array<{
    method: PaymentMethod;
    amount: number;
    bankAccountId?: number | null;
  }>;
  notesAr?: string | null;
};
