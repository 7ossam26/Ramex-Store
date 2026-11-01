import { api } from './api';
import type { Shipment } from './inventory-types';
import type {
  AvailableRoll,
  StockRequestDetail,
  StockRequestListRow,
  StockRequestSummary,
} from './stock-requests-types';

/**
 * Shop -> factory stock requests («طلبات الأتواب»).
 * Scanning / removing / sending a request shipment reuse the existing shipment
 * endpoints in inventoryApi (addShipmentRollByBarcode, removeShipmentLine, submitShipment).
 */
export const stockRequestsApi = {
  list: (params?: { status?: string; active?: boolean; mine?: boolean; q?: string }) =>
    api
      .get<StockRequestListRow[]>('/stock-requests', {
        params: {
          ...(params?.status ? { status: params.status } : {}),
          ...(params?.active ? { active: '1' } : {}),
          ...(params?.mine ? { mine: '1' } : {}),
          ...(params?.q ? { q: params.q } : {}),
        },
      })
      .then((r) => r.data),
  get: (id: number) => api.get<StockRequestDetail>(`/stock-requests/${id}`).then((r) => r.data),
  summary: () => api.get<StockRequestSummary>('/stock-requests/summary').then((r) => r.data),
  availableRolls: (params?: { fabric_id?: number; color_id?: number; q?: string }) =>
    api.get<AvailableRoll[]>('/stock-requests/available-rolls', { params }).then((r) => r.data),

  // shop
  create: (body: { roll_ids: number[]; notes_ar?: string | null }) =>
    api.post<StockRequestDetail>('/stock-requests', body).then((r) => r.data),
  addItems: (id: number, body: { roll_ids: number[]; replaces_item_id?: number }) =>
    api.post<StockRequestDetail>(`/stock-requests/${id}/items`, body).then((r) => r.data),
  cancelItem: (id: number, itemId: number, reason_ar?: string | null) =>
    api.post<StockRequestDetail>(`/stock-requests/${id}/items/${itemId}/cancel`, { reason_ar: reason_ar ?? null }).then((r) => r.data),
  cancel: (id: number, reason_ar: string) =>
    api.post<StockRequestDetail>(`/stock-requests/${id}/cancel`, { reason_ar }).then((r) => r.data),

  // factory
  openDraft: (id: number) => api.post<Shipment>(`/stock-requests/${id}/shipments`).then((r) => r.data),
  markUnavailable: (id: number, itemId: number, reason_ar: string) =>
    api.post<StockRequestDetail>(`/stock-requests/${id}/items/${itemId}/unavailable`, { reason_ar }).then((r) => r.data),
};
