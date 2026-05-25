import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '@/lib/reports-api';
import { ar } from '@/i18n/ar';
import { ReportShell, ReportTable, type DateRange } from './ReportShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorBanner } from '@/components/ErrorBanner';
import { EmptyState } from '@/components/EmptyState';
import { UserSquare } from 'lucide-react';
import { SecondaryReportChart, type ChartDatum } from './SecondaryReportChart';

type ColDef = { label: string; key: string };

type ChartConfig = {
  type: 'bar' | 'horizontalBar' | 'line' | 'pie';
  title?: string;
  seriesLabel?: string;
  unit?: string;
  isCurrency?: boolean;
  /** Limit number of bars/slices rendered; remainder grouped as "أخرى". */
  topN?: number;
  derive: (raw: unknown) => ChartDatum[];
};

type ReportConfig = {
  titleAr: string;
  columns: ColDef[];
  flatten?: (data: unknown) => Record<string, string | number>[];
  totals?: (data: unknown) => Record<string, string | number> | undefined;
  needsDateRange: boolean;
  needsCustomer?: boolean;
  chart?: ChartConfig;
};

const fmt = (n: string | number) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Truncate long names so axis labels don't overflow. */
const truncate = (s: string, max = 22) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** Sort by value desc, take top N, group remainder as "أخرى". */
function topNWithRest(data: ChartDatum[], topN?: number): ChartDatum[] {
  if (!topN || data.length <= topN) return data;
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, topN);
  const rest = sorted.slice(topN);
  const restSum = rest.reduce((acc, d) => acc + d.value, 0);
  if (restSum > 0) top.push({ name: 'أخرى', value: restSum });
  return top;
}

const REPORT_CONFIGS: Record<string, ReportConfig> = {
  salesByFabricColor: {
    titleAr: ar.reports.salesByFabricColor,
    needsDateRange: true,
    columns: [
      { label: 'الخامة', key: 'fabric_name_ar' },
      { label: 'اللون', key: 'color_name_ar' },
      { label: 'عدد الاتواب', key: 'roll_count' },
      { label: 'الوزن (كجم)', key: 'total_weight_kg' },
      { label: 'الإيراد (ج.م)', key: 'total_revenue_egp' },
      { label: 'متوسط السعر/كجم', key: 'avg_price_per_kg' },
    ],
    flatten: (d) =>
      (d as Record<string, unknown>[]).map((r) => ({
        ...(r as Record<string, string | number>),
        roll_count: String((r as Record<string, unknown>)['roll_count']),
        total_revenue_egp: fmt((r as Record<string, unknown>)['total_revenue_egp'] as string),
        avg_price_per_kg: fmt((r as Record<string, unknown>)['avg_price_per_kg'] as string),
      })),
    chart: {
      type: 'horizontalBar',
      title: 'الإيراد حسب الخامة واللون',
      seriesLabel: 'الإيراد',
      isCurrency: true,
      topN: 8,
      derive: (raw) =>
        (raw as Array<{ fabric_name_ar: string; color_name_ar: string; total_revenue_egp: string }>).map(
          (r) => ({
            name: truncate(`${r.fabric_name_ar} · ${r.color_name_ar}`),
            value: Number(r.total_revenue_egp),
          }),
        ),
    },
  },
  outstandingOpenInvoices: {
    titleAr: ar.reports.outstandingOpenInvoices,
    needsDateRange: false,
    columns: [
      { label: 'رقم الفاتورة', key: 'invoice_no' },
      { label: 'العميل', key: 'customer_name_ar' },
      { label: 'الهاتف', key: 'customer_phone' },
      { label: 'تاريخ الفتح', key: 'created_at' },
      { label: 'العمر (يوم)', key: 'age_days' },
      { label: 'الإجمالي', key: 'total_egp' },
      { label: 'العربون', key: 'deposit_paid_egp' },
      { label: 'الباقي (ج.م)', key: 'balance_egp' },
      { label: 'متأخرة؟', key: 'stale_ar' },
    ],
    flatten: (d) =>
      (d as Record<string, unknown>[]).map((r) => ({
        ...(r as Record<string, string | number>),
        age_days: String((r as Record<string, unknown>)['age_days']),
        total_egp: fmt((r as Record<string, unknown>)['total_egp'] as string),
        deposit_paid_egp: fmt((r as Record<string, unknown>)['deposit_paid_egp'] as string),
        balance_egp: fmt((r as Record<string, unknown>)['balance_egp'] as string),
        stale_ar: (r as Record<string, unknown>)['is_stale'] ? 'نعم' : '',
      })),
    chart: {
      type: 'horizontalBar',
      title: 'الفواتير حسب الرصيد المتبقي (أعلى ٨)',
      seriesLabel: 'الباقي',
      isCurrency: true,
      topN: 8,
      derive: (raw) =>
        (raw as Array<{ invoice_no: string; balance_egp: string }>).map((r) => ({
          name: r.invoice_no,
          value: Number(r.balance_egp),
        })),
    },
  },
  stocktakeInventory: {
    titleAr: ar.reports.stocktakeInventory,
    needsDateRange: false,
    columns: [
      { label: 'المخزن', key: 'warehouse' },
      { label: 'الخامة', key: 'fabric_name_ar' },
      { label: 'اللون', key: 'color_name_ar' },
      { label: 'رقم التوب', key: 'roll_sr_no' },
      { label: 'الوزن (كجم)', key: 'weight_kg' },
      { label: 'الحالة', key: 'status' },
      { label: 'التقييم (ج.م)', key: 'valuation_egp' },
    ],
    flatten: (d) => {
      const summary = d as {
        rows: Record<string, unknown>[];
        total_weight_kg: string;
        total_valuation_egp: string;
      };
      return summary.rows.map((r) => ({
        ...(r as Record<string, string | number>),
        roll_sr_no: String((r as Record<string, unknown>)['roll_sr_no'] ?? ''),
        valuation_egp: fmt((r as Record<string, unknown>)['valuation_egp'] as string),
      }));
    },
    totals: (d) => {
      const summary = d as {
        total_rolls: number;
        total_weight_kg: string;
        total_valuation_egp: string;
      };
      return {
        warehouse: 'الإجمالي',
        weight_kg: summary.total_weight_kg,
        valuation_egp: fmt(summary.total_valuation_egp),
      };
    },
    chart: {
      type: 'bar',
      title: 'التقييم حسب المخزن',
      seriesLabel: 'التقييم',
      isCurrency: true,
      derive: (raw) => {
        const summary = raw as { rows: Array<{ warehouse: string; valuation_egp: string }> };
        const byWarehouse = new Map<string, number>();
        for (const r of summary.rows) {
          byWarehouse.set(r.warehouse, (byWarehouse.get(r.warehouse) ?? 0) + Number(r.valuation_egp));
        }
        return Array.from(byWarehouse.entries()).map(([name, value]) => ({
          name: truncate(name),
          value,
        }));
      },
    },
  },
  cashFlow: {
    titleAr: ar.reports.cashFlow,
    needsDateRange: true,
    columns: [
      { label: 'التاريخ', key: 'created_at' },
      { label: 'الاتجاه', key: 'direction' },
      { label: 'النوع', key: 'event_type' },
      { label: 'المبلغ (ج.م)', key: 'amount_egp' },
      { label: 'الرصيد المتراكم', key: 'running_balance_egp' },
      { label: 'ملاحظات', key: 'notes_ar' },
    ],
    flatten: (d) => {
      const res = d as { rows: Record<string, unknown>[] };
      return res.rows.map((r) => ({
        ...(r as Record<string, string | number>),
        amount_egp: fmt((r as Record<string, unknown>)['amount_egp'] as string),
        running_balance_egp: fmt((r as Record<string, unknown>)['running_balance_egp'] as string),
        notes_ar: String((r as Record<string, unknown>)['notes_ar'] ?? ''),
      }));
    },
    chart: {
      type: 'line',
      title: 'الرصيد المتراكم على مدار الفترة',
      seriesLabel: 'الرصيد المتراكم',
      isCurrency: true,
      derive: (raw) => {
        const res = raw as { rows: Array<{ created_at: string; running_balance_egp: string }> };
        return res.rows.map((r) => ({
          name: new Date(r.created_at).toLocaleDateString('en-GB', {
            timeZone: 'Africa/Cairo',
            day: '2-digit',
            month: '2-digit',
          }),
          value: Number(r.running_balance_egp),
        }));
      },
    },
  },
  bankReconciliation: {
    titleAr: ar.reports.bankReconciliation,
    needsDateRange: true,
    columns: [
      { label: 'البنك', key: 'bank_name_ar' },
      { label: 'تاريخ التسوية', key: 'reconciled_at' },
      { label: 'الرصيد المتوقع', key: 'expected_balance_egp' },
      { label: 'الرصيد الفعلي', key: 'actual_balance_egp' },
      { label: 'الفرق (ج.م)', key: 'variance_egp' },
      { label: 'بواسطة', key: 'performed_by' },
    ],
    flatten: (d) =>
      (d as Record<string, unknown>[]).map((r) => ({
        ...(r as Record<string, string | number>),
        expected_balance_egp: fmt((r as Record<string, unknown>)['expected_balance_egp'] as string),
        actual_balance_egp: fmt((r as Record<string, unknown>)['actual_balance_egp'] as string),
        variance_egp: fmt((r as Record<string, unknown>)['variance_egp'] as string),
      })),
    chart: {
      type: 'bar',
      title: 'الفرق في التسويات',
      seriesLabel: 'الفرق',
      isCurrency: true,
      derive: (raw) =>
        (raw as Array<{ reconciled_at: string; variance_egp: string }>).map((r) => ({
          name: new Date(r.reconciled_at).toLocaleDateString('en-GB', {
            timeZone: 'Africa/Cairo',
            day: '2-digit',
            month: '2-digit',
          }),
          value: Number(r.variance_egp),
        })),
    },
  },
  expenses: {
    titleAr: ar.reports.expenses,
    needsDateRange: true,
    columns: [
      { label: 'التاريخ', key: 'created_at' },
      { label: 'الفئة', key: 'category' },
      { label: 'المبلغ (ج.م)', key: 'amount_egp' },
      { label: 'المصدر', key: 'paid_from' },
      { label: 'الحالة', key: 'status' },
      { label: 'بواسطة', key: 'created_by' },
      { label: 'ملاحظات', key: 'notes_ar' },
    ],
    flatten: (d) => {
      const res = d as { rows: Record<string, unknown>[] };
      return res.rows.map((r) => ({
        ...(r as Record<string, string | number>),
        amount_egp: fmt((r as Record<string, unknown>)['amount_egp'] as string),
        notes_ar: String((r as Record<string, unknown>)['notes_ar'] ?? ''),
      }));
    },
    chart: {
      type: 'pie',
      title: 'المصروفات حسب الفئة',
      seriesLabel: 'الإجمالي',
      isCurrency: true,
      derive: (raw) => {
        const res = raw as { rows: Array<{ category: string; amount_egp: string }> };
        const byCategory = new Map<string, number>();
        for (const r of res.rows) {
          byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + Number(r.amount_egp));
        }
        const labels = ar.cash.expenseCategories as Record<string, string>;
        return Array.from(byCategory.entries()).map(([name, value]) => ({
          name: labels[name] ?? name,
          value,
        }));
      },
    },
  },
  salesByPaymentMethod: {
    titleAr: ar.reports.salesByPaymentMethod,
    needsDateRange: true,
    columns: [
      { label: 'وسيلة الدفع', key: 'method_ar' },
      { label: 'نوع الدفع', key: 'kind_ar' },
      { label: 'عدد العمليات', key: 'count' },
      { label: 'الإجمالي (ج.م)', key: 'total_egp' },
    ],
    flatten: (d) => {
      const res = d as {
        rows: Array<{ method: string; payment_kind: string; count: number; total_egp: string }>;
      };
      return res.rows.map((r) => ({
        method_ar: r.method === 'cash' ? 'نقدي' : 'انستاباي',
        kind_ar: r.payment_kind === 'deposit' ? 'عربون' : 'دفعة نهائية',
        count: String(r.count),
        total_egp: fmt(r.total_egp),
      }));
    },
    chart: {
      type: 'pie',
      title: 'المبيعات حسب وسيلة الدفع',
      seriesLabel: 'الإجمالي',
      isCurrency: true,
      derive: (raw) => {
        const res = raw as { rows: Array<{ method: string; total_egp: string }> };
        const byMethod = new Map<string, number>();
        for (const r of res.rows) {
          const label = r.method === 'cash' ? 'نقدي' : 'انستاباي';
          byMethod.set(label, (byMethod.get(label) ?? 0) + Number(r.total_egp));
        }
        return Array.from(byMethod.entries()).map(([name, value]) => ({ name, value }));
      },
    },
  },
  auditLog: {
    titleAr: ar.reports.auditLog,
    needsDateRange: true,
    columns: [
      { label: 'التاريخ', key: 'created_at' },
      { label: 'المستخدم', key: 'actor' },
      { label: 'الإجراء', key: 'action' },
      { label: 'الكيان', key: 'entity' },
      { label: 'المعرف', key: 'entity_id' },
      { label: 'الخطورة', key: 'severity' },
      { label: 'وسم', key: 'tag' },
    ],
    flatten: (d) => {
      const res = d as { rows: Record<string, unknown>[] };
      return res.rows.map((r) => ({
        ...(r as Record<string, string | number>),
        entity_id: String((r as Record<string, unknown>)['entity_id'] ?? ''),
        tag: String((r as Record<string, unknown>)['tag'] ?? ''),
      }));
    },
    chart: {
      type: 'bar',
      title: 'عدد العمليات حسب الكيان',
      seriesLabel: 'العدد',
      derive: (raw) => {
        const res = raw as { rows: Array<{ entity: string }> };
        const byEntity = new Map<string, number>();
        for (const r of res.rows) {
          byEntity.set(r.entity, (byEntity.get(r.entity) ?? 0) + 1);
        }
        return Array.from(byEntity.entries()).map(([name, value]) => ({
          name: truncate(name, 16),
          value,
        }));
      },
    },
  },
  returnsReport: {
    titleAr: ar.reports.returnsReport,
    needsDateRange: true,
    columns: [
      { label: 'رقم الإرجاع', key: 'return_no' },
      { label: 'النوع', key: 'kind' },
      { label: 'الفاتورة', key: 'invoice_no' },
      { label: 'العميل', key: 'customer_name_ar' },
      { label: 'الهاتف', key: 'customer_phone' },
      { label: 'طريقة الاسترداد', key: 'refund_method' },
      { label: 'المبلغ (ج.م)', key: 'total_refund_egp' },
      { label: 'التاريخ', key: 'processed_at' },
    ],
    flatten: (d) => {
      const res = d as { rows: Record<string, unknown>[] };
      return res.rows.map((r) => ({
        ...(r as Record<string, string | number>),
        notes_ar: String((r as Record<string, unknown>)['notes_ar'] ?? ''),
      }));
    },
    totals: (d) => {
      const res = d as { total_refund_egp: string };
      return { return_no: 'الإجمالي', total_refund_egp: fmt(res.total_refund_egp) };
    },
    chart: {
      type: 'pie',
      title: 'المرتجعات حسب طريقة الاسترداد',
      seriesLabel: 'الإجمالي',
      isCurrency: true,
      derive: (raw) => {
        const res = raw as { by_method: Array<{ refund_method: string; total_egp: string }> };
        const METHOD_AR: Record<string, string> = { cash: 'نقدي', instapay: 'انستاباي', customer_credit: 'رصيد العميل' };
        return res.by_method.map((r) => ({
          name: METHOD_AR[r.refund_method] ?? r.refund_method,
          value: Number(r.total_egp),
        }));
      },
    },
  },
  stockByWarehouse: {
    titleAr: ar.reports.stockByWarehouse,
    needsDateRange: false,
    columns: [
      { label: 'المخزن', key: 'warehouse' },
      { label: 'الحالة', key: 'status' },
      { label: 'عدد الاتواب', key: 'roll_count' },
      { label: 'الوزن (كجم)', key: 'total_weight_kg' },
      { label: 'الطول (م)', key: 'total_length_m' },
    ],
    flatten: (d) => {
      const res = d as { rows: Record<string, unknown>[] };
      return res.rows.map((r) => ({
        ...(r as Record<string, string | number>),
        roll_count: String((r as Record<string, unknown>)['roll_count']),
      }));
    },
    totals: (d) => {
      const res = d as { grand_total_rolls: number; grand_total_weight_kg: string };
      return { warehouse: 'الإجمالي', roll_count: String(res.grand_total_rolls), total_weight_kg: res.grand_total_weight_kg };
    },
    chart: {
      type: 'bar',
      title: 'توزيع الاتواب حسب المخزن',
      seriesLabel: 'عدد الاتواب',
      derive: (raw) => {
        const res = raw as { by_warehouse: Array<{ warehouse: string; total_rolls: number }> };
        return res.by_warehouse.map((r) => ({ name: r.warehouse, value: r.total_rolls }));
      },
    },
  },
  agingInventory: {
    titleAr: ar.reports.agingInventory,
    needsDateRange: false,
    columns: [
      { label: 'الخامة', key: 'fabric_name_ar' },
      { label: 'اللون', key: 'color_name_ar' },
      { label: 'المخزن', key: 'warehouse' },
      { label: 'رقم التوب', key: 'roll_sr_no' },
      { label: 'الوزن (كجم)', key: 'weight_kg' },
      { label: 'الأيام', key: 'age_days' },
      { label: 'الفترة', key: 'bucket' },
    ],
    flatten: (d) => {
      const res = d as { rows: Record<string, unknown>[] };
      return res.rows.map((r) => ({
        ...(r as Record<string, string | number>),
        age_days: String((r as Record<string, unknown>)['age_days']),
        roll_sr_no: String((r as Record<string, unknown>)['roll_sr_no'] ?? ''),
      }));
    },
    totals: (d) => {
      const res = d as { grand_total_rolls: number; grand_total_weight_kg: string };
      return { fabric_name_ar: 'الإجمالي', weight_kg: res.grand_total_weight_kg };
    },
    chart: {
      type: 'bar',
      title: 'الاتواب حسب فترة التخزين',
      seriesLabel: 'عدد الاتواب',
      derive: (raw) => {
        const res = raw as { by_bucket: Array<{ bucket: string; roll_count: number }> };
        return res.by_bucket.map((r) => ({ name: r.bucket, value: r.roll_count }));
      },
    },
  },
  shipmentsSummary: {
    titleAr: ar.reports.shipmentsSummary,
    needsDateRange: true,
    columns: [
      { label: 'رقم الطلبية', key: 'shipment_no' },
      { label: 'الحالة', key: 'status' },
      { label: 'عدد الاتواب', key: 'roll_count' },
      { label: 'الوزن (كجم)', key: 'total_weight_kg' },
      { label: 'التاريخ', key: 'created_at' },
    ],
    flatten: (d) => {
      const res = d as { rows: Record<string, unknown>[] };
      return res.rows.map((r) => ({
        ...(r as Record<string, string | number>),
        roll_count: String((r as Record<string, unknown>)['roll_count']),
      }));
    },
    totals: (d) => {
      const res = d as { total_rolls: number; total_weight_kg: string };
      return { shipment_no: 'الإجمالي', roll_count: String(res.total_rolls), total_weight_kg: res.total_weight_kg };
    },
  },
  outstandingCheques: {
    titleAr: ar.reports.outstandingCheques,
    needsDateRange: true,
    columns: [
      { label: 'رقم الفاتورة', key: 'invoice_no' },
      { label: 'العميل', key: 'customer_name_ar' },
      { label: 'الهاتف', key: 'customer_phone' },
      { label: 'نوع الدفع', key: 'payment_kind' },
      { label: 'المبلغ (ج.م)', key: 'amount_egp' },
      { label: 'التاريخ', key: 'created_at' },
    ],
    flatten: (d) => {
      const res = d as { rows: Record<string, unknown>[] };
      return res.rows.map((r) => ({
        ...(r as Record<string, string | number>),
        amount_egp: fmt((r as Record<string, unknown>)['amount_egp'] as string),
      }));
    },
    totals: (d) => {
      const res = d as { total_egp: string; count: number };
      return { invoice_no: `الإجمالي (${res.count})`, amount_egp: fmt(res.total_egp) };
    },
    chart: {
      type: 'horizontalBar',
      title: 'الشيكات حسب العميل (أعلى ٨)',
      seriesLabel: 'المبلغ',
      isCurrency: true,
      topN: 8,
      derive: (raw) => {
        const res = raw as { rows: Array<{ customer_name_ar: string; amount_egp: string }> };
        const byCustomer = new Map<string, number>();
        for (const r of res.rows) {
          byCustomer.set(r.customer_name_ar, (byCustomer.get(r.customer_name_ar) ?? 0) + Number(r.amount_egp));
        }
        return Array.from(byCustomer.entries()).map(([name, value]) => ({ name: truncate(name), value }));
      },
    },
  },
  payrollSummary: {
    titleAr: ar.reports.payrollSummary,
    needsDateRange: true,
    columns: [
      { label: 'الشهر', key: 'month' },
      { label: 'الموظف', key: 'employee_name_ar' },
      { label: 'الوظيفة', key: 'role_ar' },
      { label: 'الراتب الأساسي (ج.م)', key: 'gross_egp' },
      { label: 'التسويات (ج.م)', key: 'adjustments_egp' },
      { label: 'الصافي (ج.م)', key: 'net_egp' },
      { label: 'طريقة الصرف', key: 'paid_via' },
    ],
    flatten: (d) => {
      const res = d as { rows: Record<string, unknown>[] };
      return res.rows.map((r) => ({
        ...(r as Record<string, string | number>),
        gross_egp: fmt((r as Record<string, unknown>)['gross_egp'] as string),
        adjustments_egp: fmt((r as Record<string, unknown>)['adjustments_egp'] as string),
        net_egp: fmt((r as Record<string, unknown>)['net_egp'] as string),
      }));
    },
    totals: (d) => {
      const res = d as { total_gross_egp: string; total_net_egp: string };
      return { month: 'الإجمالي', gross_egp: fmt(res.total_gross_egp), net_egp: fmt(res.total_net_egp) };
    },
    chart: {
      type: 'bar',
      title: 'الرواتب الصافية حسب الشهر',
      seriesLabel: 'الصافي',
      isCurrency: true,
      derive: (raw) => {
        const res = raw as { by_month: Array<{ month: string; total_net_egp: string }> };
        return res.by_month.map((r) => ({ name: r.month, value: Number(r.total_net_egp) }));
      },
    },
  },
  hrAdjustments: {
    titleAr: ar.reports.hrAdjustments,
    needsDateRange: true,
    columns: [
      { label: 'الموظف', key: 'employee_name_ar' },
      { label: 'الوظيفة', key: 'role_ar' },
      { label: 'النوع', key: 'kind' },
      { label: 'الشهر', key: 'salary_month' },
      { label: 'المبلغ (ج.م)', key: 'amount_egp' },
    ],
    flatten: (d) => {
      const res = d as { rows: Record<string, unknown>[] };
      return res.rows.map((r) => ({
        ...(r as Record<string, string | number>),
        amount_egp: fmt((r as Record<string, unknown>)['amount_egp'] as string),
      }));
    },
    totals: (d) => {
      const res = d as { total_advances_egp: string; total_deductions_egp: string };
      const total = (Number(res.total_advances_egp) + Number(res.total_deductions_egp)).toFixed(2);
      return { employee_name_ar: 'الإجمالي', amount_egp: fmt(total) };
    },
    chart: {
      type: 'bar',
      title: 'السُّلف والخصومات حسب الموظف',
      seriesLabel: 'إجمالي التسويات',
      isCurrency: true,
      derive: (raw) => {
        const res = raw as { by_employee: Array<{ employee_name_ar: string; total_advances_egp: string; total_deductions_egp: string }> };
        return res.by_employee.map((r) => ({
          name: truncate(r.employee_name_ar),
          value: Number(r.total_advances_egp) + Number(r.total_deductions_egp),
        }));
      },
    },
  },
  customerLedger: {
    titleAr: ar.reports.customerLedger,
    needsDateRange: true,
    needsCustomer: true,
    columns: [
      { label: 'التاريخ', key: 'created_at' },
      { label: 'النوع', key: 'entry_type' },
      { label: 'الاتجاه', key: 'direction' },
      { label: 'المبلغ (ج.م)', key: 'amount_egp' },
      { label: 'رقم الفاتورة', key: 'invoice_no' },
      { label: 'الرصيد المتراكم', key: 'running_balance_egp' },
      { label: 'ملاحظات', key: 'notes_ar' },
    ],
    flatten: (d) => {
      const res = d as { entries: Record<string, unknown>[] };
      return res.entries.map((r) => ({
        ...(r as Record<string, string | number>),
        invoice_no: String((r as Record<string, unknown>)['invoice_no'] ?? ''),
        notes_ar: String((r as Record<string, unknown>)['notes_ar'] ?? ''),
        amount_egp: fmt((r as Record<string, unknown>)['amount_egp'] as string),
        running_balance_egp: fmt((r as Record<string, unknown>)['running_balance_egp'] as string),
      }));
    },
    chart: {
      type: 'line',
      title: 'الرصيد المتراكم',
      seriesLabel: 'الرصيد',
      isCurrency: true,
      derive: (raw) => {
        const res = raw as { entries: Array<{ created_at: string; running_balance_egp: string }> };
        return res.entries.map((r) => ({
          name: new Date(r.created_at).toLocaleDateString('en-GB', {
            timeZone: 'Africa/Cairo',
            day: '2-digit',
            month: '2-digit',
          }),
          value: Number(r.running_balance_egp),
        }));
      },
    },
  },
};

function cairoToday(): string {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }))
    .toISOString()
    .slice(0, 10);
}

export function SecondaryReportPage() {
  const { reportKey } = useParams<{ reportKey: string }>();
  const key = reportKey ?? '';
  const config = REPORT_CONFIGS[key];

  const [range, setRange] = useState<DateRange>({ from: cairoToday(), to: cairoToday() });
  const [customerId, setCustomerId] = useState('');

  const params: Record<string, string | number | undefined> = {
    from: range.from,
    to: range.to,
    ...(config?.needsCustomer && customerId ? { customerId: Number(customerId) } : {}),
  };

  const enabled = !config?.needsCustomer || Boolean(customerId);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['report-secondary', key, range.from, range.to, customerId],
    queryFn: () => reportsApi.getSecondary(key, params),
    enabled,
  });

  if (!config) {
    return (
      <div className="max-w-6xl mx-auto">
        <ErrorBanner title="تقرير غير موجود" description={key} />
      </div>
    );
  }

  const token = localStorage.getItem('ramex_token') ?? '';
  const exportParams = new URLSearchParams({
    from: range.from,
    to: range.to,
    token,
    ...(customerId ? { customerId } : {}),
  });
  const pdfUrl = `/api/reports/secondary/${key}/export?${exportParams}&format=pdf`;
  const excelUrl = `/api/reports/secondary/${key}/export?${exportParams}&format=excel`;
  const printUrl = `/api/reports/secondary/${key}/export?${exportParams}&format=print`;

  const rows = data
    ? config.flatten
      ? config.flatten(data)
      : Array.isArray(data)
      ? (data as Record<string, string | number>[])
      : []
    : [];
  const totals = data && config.totals ? config.totals(data) : undefined;

  // Build chart datum (top-N applied per config). Only render when we have raw data + a chart config.
  const chartData: ChartDatum[] = data && config.chart ? topNWithRest(config.chart.derive(data), config.chart.topN) : [];

  const chartPane =
    config.chart && data && rows.length > 0 ? (
      <SecondaryReportChart
        type={config.chart.type}
        data={chartData}
        title={config.chart.title}
        seriesLabel={config.chart.seriesLabel}
        isCurrency={config.chart.isCurrency}
      />
    ) : null;

  return (
    <ReportShell
      title={config.titleAr}
      showDateRange={config.needsDateRange}
      dateRange={range}
      onDateRangeChange={setRange}
      exportPdfUrl={enabled ? pdfUrl : undefined}
      exportExcelUrl={enabled ? excelUrl : undefined}
      printUrl={enabled ? printUrl : undefined}
      loading={isLoading}
      chart={chartPane}
      extraFilters={
        config.needsCustomer ? (
          <div className="space-y-1">
            <Label className="text-xs text-foreground-muted">
              {ar.reports.selectCustomer} (ID)
            </Label>
            <Input
              type="number"
              inputMode="numeric"
              step="1"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder="رقم العميل"
              className="h-10 w-32"
            />
          </div>
        ) : undefined
      }
    >
      {error && (
        <ErrorBanner
          title="حدث خطأ في تحميل البيانات"
          onRetry={() => refetch()}
        />
      )}
      {!enabled && (
        <EmptyState
          title={`${ar.reports.selectCustomer} لعرض التقرير`}
          icon={UserSquare}
        />
      )}
      {enabled && !isLoading && !error && (
        <ReportTable
          columns={config.columns}
          rows={rows}
          totals={totals as Record<string, string | number> | undefined}
          emptyText={ar.reports.noData}
        />
      )}
    </ReportShell>
  );
}
