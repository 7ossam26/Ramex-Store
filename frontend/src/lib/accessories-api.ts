import { api } from './api';
import type { Accessory, CreateAccessoryBody, UpdateAccessoryBody } from './accessories-types';

export const accessoriesApi = {
  create: (body: CreateAccessoryBody) =>
    api.post<Accessory>('/accessories', body).then((r) => r.data),

  list: (params?: { q?: string; is_active?: boolean }) =>
    api.get<Accessory[]>('/accessories', { params }).then((r) => r.data),

  search: (q: string) =>
    api.get<Accessory[]>('/accessories/search', { params: { q } }).then((r) => r.data),

  byBarcode: (barcode: string) =>
    api.get<Accessory>(`/accessories/by-barcode/${encodeURIComponent(barcode)}`).then((r) => r.data),

  get: (id: number) =>
    api.get<Accessory>(`/accessories/${id}`).then((r) => r.data),

  update: (id: number, body: UpdateAccessoryBody) =>
    api.patch<Accessory>(`/accessories/${id}`, body).then((r) => r.data),

  labelBlob: (id: number) =>
    api.get<Blob>(`/accessories/${id}/label`, { responseType: 'blob' }).then((r) => r.data),
};
