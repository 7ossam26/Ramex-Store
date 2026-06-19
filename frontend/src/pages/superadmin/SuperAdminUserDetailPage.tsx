import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, LogOut, AlertTriangle, KeyRound, Trash2, Monitor } from 'lucide-react';
import { usersApi } from '@/lib/settings-api';
import { superadminApi } from '@/lib/superadmin-api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/Skeleton';
import { Toast } from '@/components/Toast';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ResetPasswordDialog } from '../settings/ResetPasswordDialog';
import { EditUserPermissionsDialog } from '../settings/EditUserPermissionsDialog';
import { extractApiError } from '@/lib/api-error';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'مشرف عام',
  owner: 'مالك',
  shop_seller: 'بائع محل',
  factory_sender: 'مرسل مصنع',
  accountant: 'محاسب',
};

export function SuperAdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const userId = Number(id);
  const qc = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: ['superadmin-user', userId],
    queryFn: () => usersApi.list().then((list) => list.find((u) => u.id === userId) ?? null),
    enabled: !!userId,
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ['superadmin-user-sessions', userId],
    queryFn: () => superadminApi.getUserSessions(userId),
    enabled: !!userId,
  });

  const [resetting, setResetting] = useState(false);
  const [permsOpen, setPermsOpen] = useState(false);
  const [confirmSignout, setConfirmSignout] = useState(false);
  const [confirmForceChange, setConfirmForceChange] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const forceSignoutMut = useMutation({
    mutationFn: () => superadminApi.revokeUserSessions(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['superadmin-user-sessions', userId] });
      setConfirmSignout(false);
      setToast('تم تسجيل الخروج القسري');
    },
    onError: (e) => setError(extractApiError(e)),
  });

  const forceChangeMut = useMutation({
    mutationFn: () => superadminApi.setForcePasswordChange(userId),
    onSuccess: () => {
      setConfirmForceChange(false);
      setToast('سيطلب النظام تغيير كلمة المرور');
    },
    onError: (e) => setError(extractApiError(e)),
  });

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto">
        <p className="text-destructive">المستخدم غير موجود</p>
        <Link to="/superadmin/users" className="text-sm text-amber-700 underline mt-2 inline-block">
          العودة للمستخدمين
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-foreground-muted">
        <Link to="/superadmin/users" className="hover:text-foreground">المستخدمون</Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground font-medium">{user.full_name_ar}</span>
      </nav>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* User card */}
      <div className="rounded-xl border border-border-subtle bg-surface-elevated p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-foreground">{user.full_name_ar}</h1>
            <p className="text-sm font-mono text-foreground-muted">@{user.username}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setResetting(true)} className="gap-2">
              <KeyRound className="size-4" />
              كلمة المرور
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPermsOpen(true)} className="gap-2 border-amber-300 text-amber-800 hover:bg-amber-50">
              صلاحيات
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border-subtle text-sm">
          <div>
            <p className="text-foreground-muted mb-0.5">الدور</p>
            <p className="font-medium">{ROLE_LABELS[user.role] ?? user.role}</p>
          </div>
          <div>
            <p className="text-foreground-muted mb-0.5">الحالة</p>
            <p className={user.is_active ? 'text-success-foreground font-medium' : 'text-foreground-muted'}>
              {user.is_active ? 'نشط' : 'معطّل'}
            </p>
          </div>
          <div>
            <p className="text-foreground-muted mb-0.5">آخر دخول</p>
            <p>{user.last_login_at ? new Date(user.last_login_at).toLocaleString('ar-EG') : '—'}</p>
          </div>
          <div>
            <p className="text-foreground-muted mb-0.5">تاريخ الإنشاء</p>
            <p>{new Date(user.created_at).toLocaleDateString('ar-EG')}</p>
          </div>
        </div>

        {user.force_password_change && (
          <div className="flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
            <AlertTriangle className="size-4 shrink-0" />
            المستخدم مطالب بتغيير كلمة المرور عند الدخول التالي
          </div>
        )}
      </div>

      {/* Active sessions */}
      <div className="rounded-xl border border-border-subtle bg-surface-elevated overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <Monitor className="size-4" />
            الجلسات النشطة ({sessions.length})
          </h2>
          {sessions.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmSignout(true)}
              className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/5"
            >
              <LogOut className="size-4" />
              فرض تسجيل الخروج
            </Button>
          )}
        </div>
        {sessions.length === 0 ? (
          <p className="py-6 text-center text-sm text-foreground-tertiary">لا توجد جلسات نشطة</p>
        ) : (
          <div className="divide-y divide-border-subtle">
            {sessions.map((s) => (
              <div key={s.id} className="px-5 py-3 text-sm flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-foreground-muted truncate">{s.device_info ?? 'جهاز غير معروف'}</p>
                  <p className="text-xs text-foreground-tertiary">{s.ip ?? '—'}</p>
                </div>
                <p className="text-xs text-foreground-muted">
                  {s.last_seen_at
                    ? `آخر نشاط: ${new Date(s.last_seen_at).toLocaleString('ar-EG')}`
                    : new Date(s.created_at).toLocaleString('ar-EG')}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Danger zone */}
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 space-y-3">
        <h2 className="font-semibold text-destructive flex items-center gap-2">
          <AlertTriangle className="size-4" />
          منطقة الخطر
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmForceChange(true)}
            className="gap-2 border-amber-400 text-amber-700 hover:bg-amber-50"
          >
            <AlertTriangle className="size-4" />
            فرض تغيير كلمة المرور
          </Button>
        </div>
      </div>

      {/* Dialogs */}
      {resetting && user && (
        <ResetPasswordDialog user={user} onClose={() => setResetting(false)} />
      )}
      {permsOpen && user && (
        <EditUserPermissionsDialog user={user} onClose={() => setPermsOpen(false)} />
      )}
      <ConfirmDialog
        open={confirmSignout}
        title="فرض تسجيل الخروج"
        message={`هل تريد إنهاء جميع جلسات ${user.full_name_ar} الآن؟`}
        onConfirm={() => forceSignoutMut.mutate()}
        onCancel={() => setConfirmSignout(false)}
      />
      <ConfirmDialog
        open={confirmForceChange}
        title="فرض تغيير كلمة المرور"
        message={`هل تريد إجبار ${user.full_name_ar} على تغيير كلمة المرور عند الدخول التالي؟`}
        onConfirm={() => forceChangeMut.mutate()}
        onCancel={() => setConfirmForceChange(false)}
      />
      <Toast open={!!toast} message={toast ?? ''} tone="success" autoDismissMs={2500} onClose={() => setToast(null)} />
    </div>
  );
}
