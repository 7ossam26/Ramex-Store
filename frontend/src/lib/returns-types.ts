export type RefundMethod = 'cash' | 'instapay' | 'customer_credit';
export type ReturnKind = 'refund' | 'exchange';
export type RollDisposition = 'back_to_stock' | 'damaged';

export type ReturnRow = {
  id: number;
  return_no: string;
  original_invoice_id: number;
  customer_id: number;
  created_by_user_id: number;
  processed_at: string;
  total_refund_egp: string;
  refund_method: RefundMethod;
  bank_account_id: number | null;
  notes_ar: string | null;
  kind: ReturnKind;
  exchange_new_invoice_id: number | null;
};

export type ReturnLineRow = {
  id: number;
  return_id: number;
  original_invoice_line_id: number;
  roll_id: number;
  refund_amount_egp: string;
  roll_disposition: RollDisposition;
  notes_ar: string | null;
  fabric_name_ar: string;
  color_name_ar: string;
  color_code: string | null;
  roll_sr_no: string | null;
  weight_kg: string;
  internal_barcode: string;
};

export type ReturnDetail = ReturnRow & {
  original_invoice_no: string;
  customer_name_ar: string;
  customer_phone: string;
  customer_code: string;
  actor_username: string;
  lines: ReturnLineRow[];
};

export type ReturnListRow = ReturnRow & {
  original_invoice_no: string;
  customer_name_ar: string;
};

export type ReturnLineInput = {
  originalLineId: number;
  rollId: number;
  refundAmountEgp: number;
  disposition: RollDisposition;
  notesAr?: string | null;
};

export type ProcessReturnBody = {
  originalInvoiceId: number;
  lines: ReturnLineInput[];
  refundMethod: RefundMethod;
  bankAccountId?: number | null;
  notesAr?: string | null;
  ownerWindowOverride?: boolean;
};

export type ProcessExchangeBody = ProcessReturnBody & {
  newCartLines: Array<{
    rollId: number;
    sellingPriceOverride?: number | null;
    lineDiscountEgp?: number | null;
  }>;
  newCartPayments: Array<{
    method: 'cash' | 'instapay';
    amount: number;
    bankAccountId?: number | null;
  }>;
  newCartTargetFinal?: number | null;
  newCartNotesAr?: string | null;
};
