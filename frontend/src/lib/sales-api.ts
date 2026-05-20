import { api } from './api';
import type {
  BankAccount,
  CancelOpenInvoiceBody,
  CreateSaleBody,
  FinalPaymentBody,
  Invoice,
  InvoiceDetail,
  InvoiceListRow,
  InvoiceStatusHistoryEntry,
  OpenInvoiceRow,
  PendingPickupRow,
  RollLookup,
  SaleLineInput,
  SalePreview,
} from './sales-types';

export const salesApi = {
  preview: (lines: SaleLineInput[], cartTargetFinal?: number | null) =>
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

  pdfBlob: (id: number, variant: 'original' | 'reprint' | 'open' = 'original') =>
    api
      .get<Blob>(`/invoices/${id}/pdf`, { params: { variant }, responseType: 'blob' })
      .then((r) => r.data),

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
};
