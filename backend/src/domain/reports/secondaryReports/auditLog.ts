import { db } from '../../../db/connection.js';
import { formatCairo } from '../../../lib/datetime/cairo.js';
import type { ReportPdfOptions } from '../../../lib/reports/pdfExport.js';

export type AuditLogRow = {
  id: number;
  created_at: string;
  actor: string;
  action: string;
  entity: string;
  entity_id: string | null;
  severity: string;
  tag: string | null;
  ip: string | null;
};

export type AuditLogResult = {
  rows: AuditLogRow[];
  total: number;
};

export async function getAuditLog(opts: {
  from?: string;
  to?: string;
  userId?: number;
  entity?: string;
  action?: string;
  severity?: string;
  tag?: string;
  page?: number;
  limit?: number;
}): Promise<AuditLogResult> {
  const page = opts.page ?? 1;
  const limit = opts.limit ?? 100;
  const offset = (page - 1) * limit;

  const base = db('audit_log as al').join('users as u', 'al.user_id', 'u.id');

  if (opts.from) base.where('al.created_at', '>=', opts.from);
  if (opts.to) base.where('al.created_at', '<=', opts.to);
  if (opts.userId) base.where('al.user_id', opts.userId);
  if (opts.entity) base.where('al.entity', opts.entity);
  if (opts.action) base.where('al.action', opts.action);
  if (opts.severity) base.where('al.severity', opts.severity);
  if (opts.tag) base.where('al.tag', opts.tag);

  const [countRow] = await base.clone().clearSelect().count<Array<{ count: string }>>('al.id as count');
  const rows = await base
    .clone()
    .select('al.id', 'al.created_at', 'u.username as actor', 'al.action', 'al.entity', 'al.entity_id', 'al.severity', 'al.tag', 'al.ip')
    .orderBy('al.created_at', 'desc')
    .limit(limit)
    .offset(offset);

  return {
    rows: rows.map((r: Record<string, unknown>) => ({
      id: Number(r['id']),
      created_at: formatCairo(String(r['created_at'])),
      actor: String(r['actor']),
      action: String(r['action']),
      entity: String(r['entity']),
      entity_id: r['entity_id'] != null ? String(r['entity_id']) : null,
      severity: String(r['severity']),
      tag: r['tag'] as string | null,
      ip: r['ip'] as string | null,
    })),
    total: Number((countRow as { count: string }).count),
  };
}

export function auditLogToExport(
  result: AuditLogResult,
  opts: { from?: string; to?: string },
  generatedAt: string,
): ReportPdfOptions {
  const subtitle = opts.from && opts.to ? `من ${opts.from} إلى ${opts.to}` : undefined;
  return {
    titleAr: 'سجل التدقيق',
    subtitleAr: subtitle,
    generatedAt,
    sections: [
      {
        titleAr: `سجل التدقيق (${result.total} سجل)`,
        columns: [
          { label: 'التاريخ', key: 'created_at', width: 'auto' },
          { label: 'المستخدم', key: 'actor', width: 'auto' },
          { label: 'الإجراء', key: 'action', width: 'auto' },
          { label: 'الكيان', key: 'entity', width: 'auto' },
          { label: 'المعرف', key: 'entity_id', width: 'auto' },
          { label: 'الخطورة', key: 'severity', width: 'auto' },
          { label: 'وسم', key: 'tag', width: 'auto' },
          { label: 'IP', key: 'ip', width: 'auto' },
        ],
        rows: result.rows.map((r) => ({
          ...r,
          entity_id: r.entity_id ?? '',
          tag: r.tag ?? '',
          ip: r.ip ?? '',
        })),
        emptyAr: 'لا توجد سجلات في هذه الفترة',
      },
    ],
  };
}
