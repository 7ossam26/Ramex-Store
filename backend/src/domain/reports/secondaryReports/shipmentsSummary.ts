import { db } from '../../../db/connection.js';
import { formatCairo } from '../../../lib/datetime/cairo.js';
import type { ReportPdfOptions } from '../../../lib/reports/pdfExport.js';

export type ShipmentsSummaryRow = {
  shipment_no: string;
  status: string;
  roll_count: number;
  total_weight_kg: string;
  total_selling_value_egp: string;
  created_at: string;
};

export type ShipmentsSummaryResult = {
  rows: ShipmentsSummaryRow[];
  total_shipments: number;
  total_rolls: number;
  total_weight_kg: string;
  total_selling_value_egp: string;
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  pending_approval: 'بانتظار الموافقة',
  partial_approved: 'موافقة جزئية',
  approved: 'مُعتمدة',
  rejected: 'مرفوضة',
};

export async function getShipmentsSummary(from: string, to: string): Promise<ShipmentsSummaryResult> {
  const rows = await db('shipments as s')
    .leftJoin('shipment_lines as sl', 's.id', 'sl.shipment_id')
    .leftJoin('rolls as r', 'sl.roll_id', 'r.id')
    .whereBetween('s.created_at', [from, to])
    .groupBy('s.id', 's.shipment_no', 's.status', 's.created_at')
    .orderBy('s.created_at', 'desc')
    .select(
      's.shipment_no',
      's.status',
      's.created_at',
      db.raw('COUNT(sl.id) as roll_count'),
      db.raw('COALESCE(SUM(r.weight_kg), 0) as total_weight_kg'),
      db.raw('COALESCE(SUM(sl.selling_price_egp), 0) as total_selling_value_egp'),
    );

  const mapped: ShipmentsSummaryRow[] = rows.map((r: Record<string, unknown>) => ({
    shipment_no: String(r['shipment_no']),
    status: STATUS_LABELS[String(r['status'])] ?? String(r['status']),
    roll_count: Number(r['roll_count']),
    total_weight_kg: Number(r['total_weight_kg']).toFixed(3),
    total_selling_value_egp: Number(r['total_selling_value_egp']).toFixed(2),
    created_at: formatCairo(new Date(String(r['created_at']))),
  }));

  const totalWeight = mapped.reduce((s, r) => s + Number(r.total_weight_kg), 0);
  const totalValue = mapped.reduce((s, r) => s + Number(r.total_selling_value_egp), 0);
  const totalRolls = mapped.reduce((s, r) => s + r.roll_count, 0);

  return {
    rows: mapped,
    total_shipments: mapped.length,
    total_rolls: totalRolls,
    total_weight_kg: totalWeight.toFixed(3),
    total_selling_value_egp: totalValue.toFixed(2),
  };
}

export function shipmentsSummaryToExport(
  data: ShipmentsSummaryResult,
  from: string,
  to: string,
  generatedAt: string,
): ReportPdfOptions {
  return {
    titleAr: 'ملخص الطلبيات الواردة',
    subtitleAr: `من ${from} إلى ${to}`,
    generatedAt,
    sections: [
      {
        titleAr: 'الطلبيات',
        columns: [
          { label: 'رقم الطلبية', key: 'shipment_no', width: 'auto' },
          { label: 'الحالة', key: 'status', width: 'auto' },
          { label: 'عدد التوبات', key: 'roll_count', width: 'auto' },
          { label: 'الوزن (كجم)', key: 'total_weight_kg', width: 'auto' },
          { label: 'القيمة البيعية (ج.م)', key: 'total_selling_value_egp', width: 'auto' },
          { label: 'التاريخ', key: 'created_at', width: 'auto' },
        ],
        rows: data.rows.map((r) => ({ ...r, roll_count: String(r.roll_count) })),
        totals: {
          shipment_no: 'الإجمالي',
          roll_count: String(data.total_rolls),
          total_weight_kg: data.total_weight_kg,
          total_selling_value_egp: data.total_selling_value_egp,
        },
        emptyAr: 'لا توجد طلبيات في هذه الفترة',
      },
    ],
  };
}
