import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MoreVertical, UserPlus, Search, Shield, ShieldOff, LogOut, KeyRound,
  Trash2, Edit, Eye, AlertTriangle,
} from 'lucide-react';
import { usersApi, type UserRow } from '@/lib/settings-api';
import { superadminApi } from '@/lib/superadmin-api';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Toast } from '@/components/Toast';
import { cn } from '@/lib/utils';
import { extractApiError } from '@/lib/api-error';
import { EditUserDialog } from '../settings/EditUserDialog';
import { ResetPasswordDialog } from '../settings/ResetPasswordDialog';

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'مشرف عام',
  owner: 'مالك',
  shop_seller: 'بائع محل',
  factory_sender: 'مرسل مصنع',
  accountant: 'محاسب',
};

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
      active ? 'bg-success/10 text-success-foreground' : 'bg-muted text-muted-foreground',
    )}>
      <span className={cn('size-1.5 rounded-full', active ? 'bg-success-foreground' : 'bg-muted-foreground')} />
      {active ? 'نشط' : 'معطّل'}
    </span>
  );
}

function DeleteUserDialog({
  user, onClose, onDone,
}: { user: UserRow | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const deleteMut = useMutation({
    mutationFn: () => usersApi.delete(user!.id),
    onSuccess: () => { onDone(); onClose(); },
    onError: (e) => setError(extractApiError(e)),
  });

  function handleClose() {
    setReason('');
    setConfirmName('');
    setError(null);
    onClose();
  }

  if (!user) return null;

  const canSubmit = reason.trim().length > 0 && confirmName === user.username && !deleteMut.isPending;

  return (
    <Dialog open={!!user} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5" />
            حذف المستخدم
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground">
            سيتم حذف حساب <strong>{user.username}</strong> نهائيًا. هذا الإجراء لا يمكن التراجع عنه.
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="space-y-1.5">
            <Label>سبب الحذف</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="اكتب سبب حذف المستخدم…"
            />
          </div>

          <div className="space-y-1.5">
            <Label>اكتب اسم المستخدم للتأكيد: <span className="font-mono text-foreground">{user.username}</span></Label>
            <Input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={user.username}
              dir="ltr"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="text-destructive border-destructive/40 hover:bg-destructive/10"
              onClick={() => deleteMut.mutate()}
              disabled={!canSubmit}
            >
              {deleteMut.isPending ? 'جارٍ الحذف…' : 'حذف نهائي'}
            </Button>
            <Button size="sm" variant="outline" onClick={handleClose}>إلغاء</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SuperAdminUsersPage() {
  const qc = useQueryClient();
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['superadmin-users'],
    queryFn: usersApi.list,
  });

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [resettingUser, setResettingUser] = useState<UserRow | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showAddUser, setShowAddUser] = useState(false);

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      usersApi.update(id, { is_active }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['superadmin-users'] }); setToast('تم التحديث'); },
  });

  const forceSignoutMut = useMutation({
    mutationFn: (id: number) => superadminApi.forceSignout(id),
    onSuccess: () => setToast('تم تسجيل الخروج القسري'),
  });

  const forceChangeMut = useMutation({
    mutationFn: (id: number) => superadminApi.setForcePasswordChange(id),
    onSuccess: () => setToast('سيطلب النظام تغيير كلمة المرور عند الدخول التالي'),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (q && !u.username.toLowerCase().includes(q) && !u.full_name_ar.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [users, search, roleFilter]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground">المستخدمون</h1>
          <p className="text-sm text-foreground-muted">{users.length} مستخدم في النظام</p>
        </div>
        <Button size="sm" className="gap-2 bg-amber-700 hover:bg-amber-800 text-white" onClick={() => setShowAddUser(true)}>
          <UserPlus className="size-4" />
          إضافة مستخدم
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute top-1/2 -translate-y-1/2 end-3 size-4 text-foreground-tertiary" />
          <input
            type="search"
            placeholder="بحث…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            dir="rtl"
            className="h-9 rounded-md border border-border-default bg-surface-elevated pe-9 ps-3 text-sm text-foreground w-52 placeholder:text-foreground-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="h-9 rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
        >
          <option value="">كل الأدوار</option>
          {Object.entries(ROLE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border-subtle overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-surface-row-alt text-foreground-muted">
            <tr>
              <th className="py-3 px-4 text-start font-medium">الاسم</th>
              <th className="py-3 px-4 text-start font-medium">اسم المستخدم</th>
              <th className="py-3 px-4 text-start font-medium">الدور</th>
              <th className="py-3 px-4 text-start font-medium">الحالة</th>
              <th className="py-3 px-4 text-start font-medium">آخر دخول</th>
              <th className="py-3 px-4 w-14" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle bg-surface-elevated">
            {isLoading && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-foreground-tertiary text-sm">جاري التحميل…</td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-foreground-tertiary text-sm">لا توجد نتائج</td>
              </tr>
            )}
            {filtered.map((u) => (
              <tr key={u.id} className="hover:bg-surface-hover transition-colors duration-150">
                <td className="py-3 px-4">
                  <div className="font-medium text-foreground">{u.full_name_ar}</div>
                  {u.force_password_change && (
                    <span className="text-xs text-amber-600">يجب تغيير كلمة المرور</span>
                  )}
                </td>
                <td className="py-3 px-4 font-mono text-foreground-muted">{u.username}</td>
                <td className="py-3 px-4 text-foreground-muted">{ROLE_LABELS[u.role] ?? u.role}</td>
                <td className="py-3 px-4">
                  <StatusBadge active={u.is_active} />
                </td>
                <td className="py-3 px-4 text-xs text-foreground-muted">
                  {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString('ar-EG') : '—'}
                </td>
                <td className="py-3 px-4">
                  {u.role !== 'super_admin' && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost" className="size-8 p-0">
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to={`/superadmin/users/${u.id}`} className="flex items-center gap-2">
                            <Eye className="size-4" />
                            عرض التفاصيل
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setEditingUser(u)} className="gap-2">
                          <Edit className="size-4" />
                          تعديل
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setResettingUser(u)} className="gap-2">
                          <KeyRound className="size-4" />
                          تغيير كلمة المرور
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => toggleMut.mutate({ id: u.id, is_active: !u.is_active })}
                          className="gap-2"
                        >
                          {u.is_active ? <ShieldOff className="size-4" /> : <Shield className="size-4" />}
                          {u.is_active ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => forceChangeMut.mutate(u.id)}
                          className="gap-2"
                        >
                          <AlertTriangle className="size-4 text-amber-600" />
                          فرض تغيير كلمة المرور
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => forceSignoutMut.mutate(u.id)}
                          className="gap-2"
                        >
                          <LogOut className="size-4" />
                          فرض تسجيل الخروج
                        </DropdownMenuItem>
                        <div className="h-px bg-border my-1" />
                        <DropdownMenuItem
                          onSelect={() => setDeletingUser(u)}
                          className="gap-2 text-destructive focus:text-destructive"
                        >
                          <Trash2 className="size-4" />
                          حذف المستخدم
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <EditUserDialog user={editingUser} onClose={() => { setEditingUser(null); qc.invalidateQueries({ queryKey: ['superadmin-users'] }); }} />
      <ResetPasswordDialog user={resettingUser} onClose={() => setResettingUser(null)} />
      <DeleteUserDialog
        user={deletingUser}
        onClose={() => setDeletingUser(null)}
        onDone={() => { qc.invalidateQueries({ queryKey: ['superadmin-users'] }); setToast('تم حذف المستخدم'); }}
      />

      {showAddUser && (
        <EditUserDialog
          user={null}
          onClose={() => { setShowAddUser(false); qc.invalidateQueries({ queryKey: ['superadmin-users'] }); }}
        />
      )}

      <Toast open={!!toast} message={toast ?? ''} tone="success" autoDismissMs={2500} onClose={() => setToast(null)} />
    </div>
  );
}
