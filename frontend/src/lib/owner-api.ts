import { api } from './api';
import type { NotificationRow } from './notifications-api';

export type OwnerOpenInvoiceRow = {
  id: number;
  invoice_no: string;
  total_egp: number;
  paid_egp: number;
  balance_egp: number;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  age_days: number;
};

export type StockSummaryRow = {
  warehouse: string;
  status: string;
  roll_count: number;
  total_weight_kg: number;
  total_valuation_egp: number;
};

export type DailyTotalRow = {
  date: string;
  revenue_egp: number;
  cost_egp: number;
  net_egp: number;
};

export type HourlySalesRow = {
  hour: number;
  count: number;
  revenue_egp: number;
};

export type InventoryTurnover = {
  period: string;
  days_in_period: number;
  sold_rolls: number;
  current_in_stock: number;
  turnover_ratio: number | null;
};

export type ExpensesSummary = {
  by_category: Array<{ category: string; expense_count: number; total_egp: number }>;
  grand_total_egp: number;
};

export type DamageLossSummary = {
  by_reason: Array<{ reason_code: string; event_count: number; total_valuation_egp: number }>;
  grand_total_egp: number;
};

export type AuditLogRow = {
  id: number;
  user_id: number | null;
  action: string;
  entity: string;
  entity_id: number | string | null;
  severity: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  actor_username: string | null;
  actor_name_ar: string | null;
};

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

  openInvoices: (): Promise<OwnerOpenInvoiceRow[]> =>
    api.get('/owner/open-invoices').then((r) => r.data),

  stockSummary: (): Promise<StockSummaryRow[]> =>
    api.get('/owner/stock-summary').then((r) => r.data),

  topFabrics: (period: '7d' | '30d' | '90d' = '7d'): Promise<TopFabricRow[]> =>
    api.get('/owner/top-fabrics', { params: { period } }).then((r) => r.data),

  notifications: (params: { include_archived?: boolean; page?: number; limit?: number } = {}):
    Promise<{ rows: NotificationRow[]; total: number }> =>
    api.get('/owner/notifications', { params }).then((r) => r.data),

  auditLog: (params: Record<string, string | number>): Promise<{ rows: AuditLogRow[]; total: number }> =>
    api.get('/owner/audit-log', { params }).then((r) => r.data),

  expensesSummary: (from?: string, to?: string): Promise<ExpensesSummary> =>
    api.get('/owner/expenses-summary', { params: { from, to } }).then((r) => r.data),

  damageLoss: (from?: string, to?: string): Promise<DamageLossSummary> =>
    api.get('/owner/damage-loss', { params: { from, to } }).then((r) => r.data),

  dailyTotals: (from: string, to: string): Promise<DailyTotalRow[]> =>
    api.get('/owner/daily-totals', { params: { from, to } }).then((r) => r.data),

  hourlySalesCurve: (date: string): Promise<HourlySalesRow[]> =>
    api.get('/owner/hourly-sales-curve', { params: { date } }).then((r) => r.data),

  inventoryTurnover: (period: '7d' | '30d' | '90d' = '30d'): Promise<InventoryTurnover> =>
    api.get('/owner/inventory-turnover', { params: { period } }).then((r) => r.data),
};
