import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { permissionsApi } from '@/lib/settings-api';
import { PermissionEditor } from '@/components/superadmin/PermissionEditor';
import { Toast } from '@/components/Toast';
import { extractApiError } from '@/lib/api-error';

const ROLE_LABELS: Record<string, string> = {
  owner: 'المالك',
  shop_seller: 'بائع المحل',
  factory_sender: 'مرسل المصنع',
  accountant: 'المحاسب',
};

export function SuperAdminRoleEditorPage() {
  const { role } = useParams<{ role: string }>();
  const qc = useQueryClient();

  const { data: matrix = [] } = useQuery({
    queryKey: ['settings-permissions'],
    queryFn: permissionsApi.getMatrix,
  });

  const [dirty, setDirty] = useState<Map<string, boolean>>(new Map());
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function matrixKey(r: string, resource: string, action: string) {
    return `${r}:${resource}:${action}`;
  }

  function isAllowed(r: string, resource: string, action: string): boolean {
    const k = matrixKey(r, resource, action);
    if (dirty.has(k)) return dirty.get(k)!;
    const row = matrix.find((m) => m.role === r && m.resource === resource && m.action === action);
    return row ? row.is_allowed : false;
  }

  function onToggle(r: string, resource: string, action: string) {
    const k = matrixKey(r, resource, action);
    const current = isAllowed(r, resource, action);
    setDirty((prev) => new Map(prev).set(k, !current));
  }

  function onBulkSet(r: string, updates: Array<{ resource: string; action: string }>, allowed: boolean) {
    setDirty((prev) => {
      const next = new Map(prev);
      for (const { resource, action } of updates) {
        next.set(matrixKey(r, resource, action), allowed);
      }
      return next;
    });
  }

  const savePermsMut = useMutation({
    mutationFn: (updates: Array<{ role: string; resource: string; action: string; is_allowed: boolean }>) =>
      permissionsApi.bulkUpdate(updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-permissions'] });
      setDirty(new Map());
      setToast('تم حفظ الصلاحيات');
    },
    onError: (e) => setError(extractApiError(e)),
  });

  function onSave() {
    const updates: Array<{ role: string; resource: string; action: string; is_allowed: boolean }> = [];
    for (const [k, v] of dirty.entries()) {
      const [r, resource, action] = k.split(':');
      if (r && resource && action) updates.push({ role: r, resource, action, is_allowed: v });
    }
    if (updates.length > 0) savePermsMut.mutate(updates);
  }

  if (!role || !ROLE_LABELS[role]) {
    return (
      <div className="max-w-4xl mx-auto">
        <p className="text-destructive">دور غير معروف</p>
        <Link to="/superadmin/roles" className="text-sm text-amber-700 underline mt-2 inline-block">
          العودة للأدوار
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-foreground-muted">
        <Link to="/superadmin/roles" className="hover:text-foreground">الأدوار</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium">{ROLE_LABELS[role]}</span>
      </nav>

      <div>
        <h1 className="text-xl font-bold text-foreground">تعديل صلاحيات: {ROLE_LABELS[role]}</h1>
        <p className="text-sm text-foreground-muted">تفعيل أو تعطيل الصلاحيات لهذا الدور</p>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <PermissionEditor
        role={role}
        isAllowed={isAllowed}
        onToggle={onToggle}
        onBulkSet={onBulkSet}
        dirty={dirty}
        onSave={onSave}
        saving={savePermsMut.isPending}
      />

      <Toast open={!!toast} message={toast ?? ''} tone="success" autoDismissMs={2500} onClose={() => setToast(null)} />
    </div>
  );
}
