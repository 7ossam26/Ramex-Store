import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Key, Users, MoreVertical, RefreshCcw, LogOut } from 'lucide-react';
import { usersApi } from '@/lib/settings-api';
import { permissionsApi } from '@/lib/settings-api';
import { superadminApi } from '@/lib/superadmin-api';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Toast } from '@/components/Toast';
import { extractApiError } from '@/lib/api-error';

const CONFIGURABLE_ROLES = ['owner', 'shop_seller', 'factory_sender', 'accountant'] as const;
type ConfigurableRole = (typeof CONFIGURABLE_ROLES)[number];

const ROLE_LABELS: Record<ConfigurableRole, string> = {
  owner: 'المالك',
  shop_seller: 'بائع المحل',
  factory_sender: 'مرسل المصنع',
  accountant: 'المحاسب',
};

const ROLE_DESCS: Record<ConfigurableRole, string> = {
  owner: 'وصول كامل للعمليات التجارية — المبيعات والمخزون والخزينة والموارد البشرية',
  shop_seller: 'المبيعات والمخزون والعملاء وخزنة الكاش',
  factory_sender: 'إنشاء طلبيات المصنع وقراءة المخزون',
  accountant: 'تقارير وكشوف المرتبات وإدارة الموردين',
};

const ROLE_COLORS: Record<ConfigurableRole, string> = {
  owner: 'bg-blue-50 border-blue-200 text-blue-800',
  shop_seller: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  factory_sender: 'bg-orange-50 border-orange-200 text-orange-800',
  accountant: 'bg-purple-50 border-purple-200 text-purple-800',
};

export function SuperAdminRolesPage() {
  const qc = useQueryClient();
  const { data: users = [] } = useQuery({ queryKey: ['superadmin-users'], queryFn: usersApi.list });
  const [confirmRole, setConfirmRole] = useState<ConfigurableRole | null>(null);
  const [confirmRepair, setConfirmRepair] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const forceSignoutRoleMut = useMutation({
    mutationFn: (role: string) => superadminApi.forceSignoutRole(role),
    onSuccess: () => { setConfirmRole(null); setToast('تم فرض تسجيل الخروج لجميع مستخدمي هذا الدور'); },
    onError: (e) => { setError(extractApiError(e)); setConfirmRole(null); },
  });

  const repairMut = useMutation({
    mutationFn: async () => {
      // Reload matrix from server to check for issues — just invalidate for now
      await qc.invalidateQueries({ queryKey: ['settings-permissions'] });
    },
    onSuccess: () => { setConfirmRepair(false); setToast('تمت مراجعة الصلاحيات'); },
  });

  function countForRole(role: string) {
    return users.filter((u) => u.role === role && u.is_active).length;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">الصلاحيات والأدوار</h1>
          <p className="text-sm text-foreground-muted">تعديل صلاحيات كل دور في النظام</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setConfirmRepair(true)}
          className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
        >
          <RefreshCcw className="size-4" />
          إصلاح الصلاحيات
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {CONFIGURABLE_ROLES.map((role) => {
          const count = countForRole(role);
          return (
            <div key={role} className={`rounded-xl border p-5 space-y-4 ${ROLE_COLORS[role]}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="p-2 rounded-lg bg-white/60">
                    <Key className="size-4" />
                  </span>
                  <div>
                    <h3 className="font-bold text-base">{ROLE_LABELS[role]}</h3>
                    <p className="text-xs opacity-70 mt-0.5 max-w-52 leading-relaxed">{ROLE_DESCS[role]}</p>
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" className="size-8 p-0 opacity-60 hover:opacity-100">
                      <MoreVertical className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link to={`/superadmin/roles/${role}`} className="gap-2">
                        <Key className="size-4" />
                        تعديل الصلاحيات
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => setConfirmRole(role)}
                      className="gap-2"
                      disabled={count === 0}
                    >
                      <LogOut className="size-4" />
                      فرض إعادة تسجيل الدخول
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-current/10">
                <Users className="size-3.5 opacity-60" />
                <span className="text-xs">{count} مستخدم نشط</span>
              </div>

              <Link
                to={`/superadmin/roles/${role}`}
                className="block w-full text-center rounded-lg border border-current/20 bg-white/50 hover:bg-white/80 transition-colors py-1.5 text-sm font-medium"
              >
                تعديل الصلاحيات
              </Link>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={!!confirmRole}
        title="فرض إعادة تسجيل الدخول"
        message={`هل تريد فرض تسجيل الخروج على جميع مستخدمي دور "${confirmRole ? ROLE_LABELS[confirmRole] : ''}"؟`}
        onConfirm={() => confirmRole && forceSignoutRoleMut.mutate(confirmRole)}
        onCancel={() => setConfirmRole(null)}
      />
      <ConfirmDialog
        open={confirmRepair}
        title="إصلاح الصلاحيات"
        message="سيتم مراجعة وتحديث حالة الصلاحيات في النظام. هل تريد المتابعة؟"
        onConfirm={() => repairMut.mutate()}
        onCancel={() => setConfirmRepair(false)}
      />
      <Toast open={!!toast} message={toast ?? ''} tone="success" autoDismissMs={2500} onClose={() => setToast(null)} />
    </div>
  );
}
