import { api } from './api';
import type {
  ProcessReturnBody,
  ProcessExchangeBody,
  ReturnDetail,
  ReturnListRow,
  ReturnRow,
} from './returns-types';

export const returnsApi = {
  processReturn: (body: ProcessReturnBody) =>
    api.post<ReturnRow>('/returns', body).then((r) => r.data),

  processExchange: (body: ProcessExchangeBody) =>
    api
      .post<{ returnRow: ReturnRow; newInvoice: { id: number; invoice_no: string } }>(
        '/returns/exchange',
        body,
      )
      .then((r) => r.data),

  list: (params?: {
    customer_id?: number;
    original_invoice_id?: number;
    date_from?: string;
    date_to?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) =>
    api
      .get<{ rows: ReturnListRow[]; total: number }>('/returns', { params })
      .then((r) => r.data),

  get: (id: number) => api.get<ReturnDetail>(`/returns/${id}`).then((r) => r.data),

  slipPdfUrl: (id: number) => `/api/returns/${id}/slip-pdf`,
};
