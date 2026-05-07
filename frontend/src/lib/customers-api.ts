import { api } from './api';
import type { Customer, CustomerDetail, LedgerEntry } from './customers-types';

export const customersApi = {
  list: (params?: { search?: string; sort?: string; page?: number; limit?: number }) =>
    api
      .get<{ rows: Customer[]; total: number }>('/customers', { params })
      .then((r) => r.data),

  get: (id: number, params?: { page?: number; limit?: number }) =>
    api.get<CustomerDetail>(`/customers/${id}`, { params }).then((r) => r.data),

  create: (body: {
    name_ar: string;
    phone: string;
    phone_secondary?: string | null;
    address_ar?: string | null;
    tax_no?: string | null;
    notes_ar?: string | null;
  }) => api.post<Customer>('/customers', body).then((r) => r.data),

  quickCreate: (body: { name_ar: string; phone: string }) =>
    api.post<Customer>('/customers/quick', body).then((r) => r.data),

  update: (
    id: number,
    body: {
      name_ar?: string;
      phone?: string;
      phone_secondary?: string | null;
      address_ar?: string | null;
      tax_no?: string | null;
      notes_ar?: string | null;
    },
  ) => api.patch<Customer>(`/customers/${id}`, body).then((r) => r.data),

  byPhone: (phone: string) =>
    api.get<Customer>(`/customers/by-phone/${phone}`).then((r) => r.data),

  getLedger: (id: number, params?: { page?: number; limit?: number }) =>
    api
      .get<{ rows: LedgerEntry[]; total: number; page: number; limit: number }>(
        `/customers/${id}/ledger`,
        { params },
      )
      .then((r) => r.data),
};
