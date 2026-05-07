import { api } from './api';

export type SummaryToday = {
  date: string;
  sales_count: number;
  revenue_egp: number;
  cash_in_egp: number;
  cash_out_egp: number;
  bank_in_egp: number;
  bank_out_egp: number;
  refund_count: number;
  refund_total_egp: number;
  void_count: number;
  void_total_egp: number;
  expenses_total_egp: number;
};

export type CashPosition = {
  cash: {
    current_balance_egp: number;
    last_recon_date: string | null;
    last_recon_variance: number | null;
  };
  banks: Array<{
    id: number;
    name_ar: string;
    bank_name_ar: string | null;
    is_default: boolean;
    is_active: boolean;
    current_balance_egp: number;
    last_recon_date: string | null;
    last_recon_variance: number | null;
  }>;
};

export type TopFabricRow = {
  fabric_id: number;
  fabric_name_ar: string;
  color_id: number;
  color_name_ar: string;
  roll_count: number;
  revenue_egp: number;
};

export const ownerApi = {
  summaryToday: (): Promise<SummaryToday> =>
    api.get('/owner/summary/today').then((r) => r.data),

  cashPosition: (): Promise<CashPosition> =>
    api.get('/owner/cash-position').then((r) => r.data),

  openInvoices: (): Promise<{ rows: unknown[]; total: number }> =>
    api.get('/owner/open-invoices').then((r) => r.data),

  stockSummary: (): Promise<Array<{ warehouse: string; status: string; roll_count: number; total_weight_kg: number; total_valuation_egp: number }>> =>
    api.get('/owner/stock-summary').then((r) => r.data),

  topFabrics: (period: '7d' | '30d' | '90d' = '7d'): Promise<TopFabricRow[]> =>
    api.get('/owner/top-fabrics', { params: { period } }).then((r) => r.data),

  auditLog: (params: Record<string, string | number>): Promise<{ rows: unknown[]; total: number }> =>
    api.get('/owner/audit-log', { params }).then((r) => r.data),

  expensesSummary: (from?: string, to?: string): Promise<{ by_category: Array<{ category: string; expense_count: number; total_egp: number }>; grand_total_egp: number }> =>
    api.get('/owner/expenses-summary', { params: { from, to } }).then((r) => r.data),

  damageLoss: (from?: string, to?: string): Promise<{ by_reason: Array<{ reason_code: string; event_count: number; total_valuation_egp: number }>; grand_total_egp: number }> =>
    api.get('/owner/damage-loss', { params: { from, to } }).then((r) => r.data),

  dailyTotals: (from: string, to: string): Promise<Array<{ date: string; revenue_egp: number; cost_egp: number; net_egp: number }>> =>
    api.get('/owner/daily-totals', { params: { from, to } }).then((r) => r.data),

  hourlySalesCurve: (date: string): Promise<Array<{ hour: number; count: number; revenue_egp: number }>> =>
    api.get('/owner/hourly-sales-curve', { params: { date } }).then((r) => r.data),

  inventoryTurnover: (period: '7d' | '30d' | '90d' = '30d'): Promise<{ period: string; days_in_period: number; sold_rolls: number; current_in_stock: number; turnover_ratio: number | null }> =>
    api.get('/owner/inventory-turnover', { params: { period } }).then((r) => r.data),
};
