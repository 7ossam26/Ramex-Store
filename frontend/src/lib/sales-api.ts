import { api } from './api';
import type {
  AddOpenInvoiceLinesBody,
  BankAccount,
  CancelOpenInvoiceBody,
  Cheque,
  ChequeDetails,
  CreateSaleBody,
  DepositRefundBody,
  FinalPaymentBody,
  Invoice,
  InvoiceDetail,
  InvoiceListRow,
  InvoiceStatusHistoryEntry,
  OpenInvoiceRow,
  PendingPickupRow,
  ReturnScanMeta,
  RollLookup,
  RollSaleLineInput,
  SalePreview,
  ScanReturnResult,
} from './sales-types';

export const salesApi = {
  preview: (lines: RollSaleLineInput[], cartTargetFinal?: number | null) =>
    api
      .post<SalePreview>('/sales/preview', { lines, cartTargetFinal: cartTargetFinal ?? null })
      .then((r) => r.data),

  create: (body: CreateSaleBody) =>
    api.post<Invoice>('/sales', body).then((r) => r.data),

  list: (params?: {
    status?: string;
    customer_id?: number;
    fulfillment_destination?: 'shop' | 'factory_direct';
    date_from?: string;
    date_to?: string;
    fabric_id?: number;
    color_id?: number;
    search?: string;
    page?: number;
    limit?: number;
  }) =>
    api
      .get<{ rows: InvoiceListRow[]; total: number }>('/invoices', { params })
      .then((r) => r.data),

  get: (id: number) => api.get<InvoiceDetail>(`/invoices/${id}`).then((r) => r.data),

  voidInvoice: (id: number, reason_ar: string, approved_by_owner = false) =>
    api
      .post<{ requires_approval?: true; invoice?: Invoice }>(
        `/invoices/${id}/void`,
        { reason_ar, approved_by_owner },
      )
      .then((r) => r.data),

  listOpen: () => api.get<OpenInvoiceRow[]>('/invoices/open').then((r) => r.data),

  listPendingPickup: () =>
    api.get<PendingPickupRow[]>('/invoices/pending-pickup').then((r) => r.data),

  statusHistory: (id: number) =>
    api
      .get<InvoiceStatusHistoryEntry[]>(`/invoices/${id}/status-history`)
      .then((r) => r.data),

  addFinalPayment: (id: number, body: FinalPaymentBody) =>
    api.post<{ invoice: Invoice }>(`/invoices/${id}/payments/final`, body).then((r) => r.data),

  markDelivered: (id: number) =>
    api.post<{ invoice: Invoice }>(`/invoices/${id}/mark-delivered`).then((r) => r.data),

  cancelOpenInvoice: (id: number, body: CancelOpenInvoiceBody) =>
    api.post<{ invoice: Invoice }>(`/invoices/${id}/cancel`, body).then((r) => r.data),

  addOpenInvoiceLines: (id: number, body: AddOpenInvoiceLinesBody) =>
    api.post<{ invoice: Invoice }>(`/invoices/${id}/lines`, body).then((r) => r.data),

  depositRefund: (id: number, body: DepositRefundBody) =>
    api.post<{ invoice: Invoice }>(`/invoices/${id}/deposit-refund`, body).then((r) => r.data),

  auditReprint: (id: number) =>
    api.post<void>(`/invoices/${id}/audit-reprint`).then(() => undefined),

  bankAccounts: () =>
    api.get<BankAccount[]>('/bank-accounts').then((r) => r.data),

  rollByBarcode: (barcode: string) =>
    api.get<RollLookup>(`/rolls/by-barcode/${encodeURIComponent(barcode)}`).then((r) => r.data),

  searchRolls: (params: {
    fabric_id?: number;
    color_id?: number;
    status?: string;
    warehouse?: string;
    is_visible_at_pos?: boolean;
  }) => api.get<RollLookup[]>('/rolls', { params }).then((r) => r.data),

  // Phase 6 — Return on Scan
  scanPreview: (rollId: number) =>
    api.get<ReturnScanMeta>(`/returns/scan-preview/${rollId}`).then((r) => r.data),

  scanPreviewAccessory: (accessoryId: number) =>
    api.get<ReturnScanMeta>(`/returns/scan-preview-accessory/${accessoryId}`).then((r) => r.data),

  scanReturn: (body: {
    rollId?: number | null;
    accessoryId?: number | null;
    refundMethod: 'cash' | 'instapay' | 'bank_transfer' | 'cheque';
    bankAccountId?: number | null;
    reference?: string | null;
    chequeDetails?: ChequeDetails | null;
  }) => api.post<ScanReturnResult>('/returns/from-scan', body).then((r) => r.data),

  // Phase 7 — Cheques admin list
  listCheques: (params?: {
    status?: 'pending' | 'cleared' | 'bounced' | 'cancelled';
    bank_name_ar?: string;
    due_date_from?: string;
    due_date_to?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) =>
    api
      .get<{ rows: Cheque[]; total: number }>('/cheques', { params })
      .then((r) => r.data),

  // Sales export (Excel)
  exportSales: (params: { from: string; to: string; status?: string }) =>
    api
      .get('/sales/export', { params, responseType: 'blob' })
      .then((r) => r.data as Blob),
};
