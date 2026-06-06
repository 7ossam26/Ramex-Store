import { api } from './api';

export const reportsApi = {
  getGeneral: (from: string, to: string) =>
    api.get('/reports/general', { params: { from, to } }).then((r) => r.data),

  getDaily: (date: string) =>
    api.get('/reports/daily', { params: { date } }).then((r) => r.data),

  getSecondary: (reportKey: string, params: Record<string, string | number | undefined>) =>
    api.get(`/reports/secondary/${reportKey}`, { params }).then((r) => r.data),

  exportUrl: (path: string, params: Record<string, string | undefined>) => {
    const token = localStorage.getItem('ramex_token');
    const query = new URLSearchParams({ ...params, token: token ?? '' }).toString();
    return `/api${path}?${query}`;
  },
};

export type DailyReport = {
  date: string;
  shift_start_cairo: string;
  shift_end_cairo: string;
  generated_at: string;
  sales_summary: {
    invoice_count: number;
    gross_subtotal_egp: string;
    total_cart_discount_egp: string;
    total_tax_egp: string;
    total_net_egp: string;
    refund_count: number;
    refund_total_egp: string;
    void_count: number;
    void_total_egp: string;
  };
  discounts: Array<{
    invoice_no: string;
    cart_discount_egp: string;
    line_discounts_egp: string;
    total_discount_egp: string;
  }>;
  refunds_voids: Array<{
    type: 'refund' | 'void';
    invoice_no: string;
    invoice_id: number;
    amount_egp: string;
    created_at: string;
    notes_ar: string | null;
  }>;
  cash: {
    opening_balance_egp: string;
    total_in_egp: string;
    total_out_egp: string;
    closing_balance_egp: string;
    movements: Array<{
      direction: 'in' | 'out';
      event_type: string;
      amount_egp: string;
      notes_ar: string | null;
      created_at: string;
    }>;
  };
  bank_movements: Array<{
    bank_name_ar: string;
    direction: 'in' | 'out';
    event_type: string;
    amount_egp: string;
    created_at: string;
  }>;
  sales_by_fabric: Array<{
    fabric_name_ar: string;
    color_name_ar: string;
    roll_sr_no: string | null;
    weight_kg: string;
    revenue_egp: string;
  }>;
  open_invoices_summary: {
    opened_today_count: number;
    opened_today_value_egp: string;
    closed_today_count: number;
    closed_today_value_egp: string;
  };
  stock_movements: Array<{ event_type: string; count: number }>;
};

export type GeneralReport = {
  from: string;
  to: string;
  generated_at: string;
  summary: {
    total_sales_egp: string;
    invoice_count: number;
  };
  hourly_sales: Array<{ hour: string; total_egp: number }>;
  sales_by_fabric: Array<{ name: string; value: number }>;
  store_rows: Array<{
    store_name_ar: string;
    total_sales_egp: string;
    invoice_count: number;
    avg_invoice_egp: string;
  }>;
};
