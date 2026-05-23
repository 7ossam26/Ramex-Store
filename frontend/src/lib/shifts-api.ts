import { api } from './api';
import type { DailyReport } from './reports-api';

export type ShiftStatus = 'open' | 'closed';

export type Shift = {
  id: number;
  opened_at: string;
  opened_by_user_id: number;
  opened_by_username: string | null;
  closed_at: string | null;
  closed_by_user_id: number | null;
  closed_by_username: string | null;
  opening_cash_balance_egp: string;
  closing_cash_balance_egp: string | null;
  status: ShiftStatus;
  notes_ar: string | null;
  created_at: string;
};

export type ShiftListResult = {
  rows: Shift[];
  total: number;
};

export const shiftsApi = {
  async current(): Promise<Shift | null> {
    const res = await api.get<Shift | null>('/shifts/current');
    return res.data;
  },

  async open(notesAr?: string | null): Promise<Shift> {
    const res = await api.post<Shift>('/shifts/open', { notes_ar: notesAr ?? null });
    return res.data;
  },

  async close(notesAr?: string | null): Promise<Shift> {
    const res = await api.post<Shift>('/shifts/close', { notes_ar: notesAr ?? null });
    return res.data;
  },

  async list(params?: { from?: string; to?: string; page?: number; limit?: number }): Promise<ShiftListResult> {
    const res = await api.get<ShiftListResult>('/shifts', { params });
    return res.data;
  },

  async getReport(id: number): Promise<DailyReport> {
    const res = await api.get<DailyReport>(`/shifts/${id}/report`);
    return res.data;
  },

  exportUrl(id: number, format: 'pdf' | 'excel' | 'print'): string {
    const token = localStorage.getItem('ramex_token') ?? '';
    return `/api/shifts/${id}/export?format=${format}&token=${token}`;
  },
};
