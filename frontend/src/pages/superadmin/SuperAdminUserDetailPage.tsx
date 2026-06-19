import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, KeyRound, ShieldCheck, Trash2 } from 'lucide-react';
import { usersApi } from '@/lib/settings-api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/Skeleton';
import { Toast } from '@/components/Toast';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ResetPasswordDialog } from '../settings/ResetPasswordDialog';
import { EditUserPermissionsDialog } from '../settings/EditUserPermissionsDialog';
import { extractApiError } from '@/lib/api-error';

const ROLE_OPTIONS = [
  { value: 'owner', label: 'مالك' },
  { value: 'shop_seller', label: 'بائع محل' },
  { value: 'factory_sender', label: 'مرسل مصنع' },
  { value: 'accountant', label: 'محاسب' },
];

export function SuperAdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const userId = Number(id);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: user, isLoading } = useQuery({
    queryKey: ['superadmin-user', userId],
    queryFn: () => usersApi.list().then((list) => list.find((u) => u.id === userId) ?? null),
    enabled: !!userId,
  });

  const { data: permsData } = useQuery({
    queryKey: ['user-permissions', userId],
    queryFn: () => usersApi.getPermissions(userId),
    enabled: !!userId,
  });

  // ── Section 1 local state ─────────────────────────────────────
  const [fullNameAr, setFullNameAr] = useState('');
  const [role, setRole] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [section1Init, setSection1Init] = useState(false);

  if (user && !section1Init) {
    setFullNameAr(user.full_name_ar);
    setRole(user.role);
    setIsActive(user.is_active);
    setSection1Init(true);
  }

  // ── Section 2 local state ─────────────────────────────────────
  const [newUsername, setNewUsername] = useState('');

  // ── Dialog / toast state ──────────────────────────────────────
  const [resetting, setResetting] = useState(false);
  const [permsOpen, setPermsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone: 'success' | 'danger' } | null>(null);

  const showToast = (msg: string, tone: 'success' | 'danger' = 'success') =>
    setToast({ msg, tone });

  // ── Mutations ─────────────────────────────────────────────────
  const saveSec1Mut = useMutation({
    mutationFn: () =>
      usersApi.update(userId, { full_name_ar: fullNameAr, role, is_active: isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['superadmin-user', userId] });
      qc.invalidateQueries({ queryKey: ['superadmin-users'] });
      showToast('تم حفظ التعديلات');
    },
    onError: (e) => showToast(extractApiError(e), 'danger'),
  });

  const changeUsernameMut = useMutation({
    mutationFn: () => usersApi.update(userId, { username: newUsername.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['superadmin-user', userId] });
      qc.invalidateQueries({ queryKey: ['superadmin-users'] });
      setNewUsername('');
      showToast('تم تغيير اسم المستخدم');
    },
    onError: (e) => {
      const msg = extractApiError(e);
      showToast(msg === 'USERNAME_TAKEN' ? 'اسم المستخدم مستخدم بالفعل' : msg, 'danger');
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => usersApi.delete(userId),
    onSuccess: () => navigate('/superadmin/users', { replace: true }),
    onError: (e) => {
      setConfirmDelete(false);
      showToast(extractApiError(e), 'danger');
    },
  });

  // ── Loading / not found ───────────────────────────────────────
  if (isLoading) {
    return (
      <div className="w-full space-y-4 p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6">
        <p className="text-destructive">المستخدم غير موجود</p>
        <Link to="/superadmin/users" className="text-sm text-amber-700 underline mt-2 inline-block">
          العودة للمستخدمين
        </Link>
      </div>
    );
  }

  const permCount = permsData?.roleMatrix.length ?? 0;

  return (
    <div className="w-full space-y-6 p-6" dir="rtl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-foreground-muted">
        <Link to="/superadmin/users" className="hover:text-foreground transition-colors">
          المستخدمون
        </Link>
        <ChevronRight className="size-3.5 rotate-180" />
        <span className="text-foreground font-medium">{user.full_name_ar}</span>
      </nav>

      {/* Page title */}
      <h1 className="text-2xl font-bold text-foreground">{user.full_name_ar}</h1>

      {/* 2-column grid: left = main card, right = secondary cards */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6 items-start">

        {/* ── Left: Role & Permissions ─────────────────────────── */}
        <section className="rounded-xl border border-border-subtle bg-surface-elevated divide-y divide-border-subtle">
          {/* Section header */}
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <ShieldCheck className="size-4 text-amber-600" />
                الدور والصلاحيات
              </h2>
              <p className="text-sm text-foreground-muted">
                {user.full_name_ar}
                <span className="mx-1.5 text-foreground-tertiary">·</span>
                <span className="font-mono">{user.username}</span>
              </p>
            </div>
          </div>

          {/* Section body */}
          <div className="px-6 py-5 space-y-5">
            {/* Full name */}
            <div className="space-y-1.5">
              <Label className="text-sm text-foreground-muted">الاسم الكامل</Label>
              <Input
                value={fullNameAr}
                onChange={(e) => setFullNameAr(e.target.value)}
                className="text-sm"
              />
            </div>

            {/* Role + permissions button in a row */}
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <Label className="text-sm text-foreground-muted">الدور</Label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {ROLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPermsOpen(true)}
                className="h-10 gap-2 border-amber-300 text-amber-800 hover:bg-amber-50 shrink-0"
              >
                <ShieldCheck className="size-4" />
                عرض الصلاحيات{permCount > 0 ? ` (${permCount})` : ''}
              </Button>
            </div>

            {/* Active toggle */}
            <label className="flex items-center justify-between cursor-pointer select-none group">
              <span className="text-sm font-medium text-foreground group-hover:text-foreground/80 transition-colors">
                الحساب نشط
              </span>
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                <div className="h-6 w-11 rounded-full bg-border-default transition-colors duration-150 peer-checked:bg-amber-600" />
                <div className="absolute top-1 start-1 h-4 w-4 rounded-full bg-white shadow transition-transform duration-150 peer-checked:translate-x-[-1.25rem]" />
              </div>
            </label>
          </div>

          {/* Section footer */}
          <div className="px-6 py-4 flex justify-end">
            <Button
              onClick={() => saveSec1Mut.mutate()}
              disabled={saveSec1Mut.isPending || !fullNameAr.trim()}
              className="bg-amber-700 hover:bg-amber-800 text-white"
            >
              {saveSec1Mut.isPending ? 'جارٍ الحفظ…' : 'حفظ التعديلات'}
            </Button>
          </div>
        </section>

        {/* ── Right column ─────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Section 2: Change Username */}
          <section className="rounded-xl border border-border-subtle bg-surface-elevated divide-y divide-border-subtle">
            <div className="px-6 py-4">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <span className="text-base">@</span>
                تغيير اسم المستخدم
              </h2>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm text-foreground-muted">
                الحالي: <span className="font-mono font-medium text-foreground">{user.username}</span>
              </p>
              <div className="space-y-1.5">
                <Label className="text-sm text-foreground-muted">اسم المستخدم الجديد</Label>
                <Input
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value.toLowerCase())}
                  placeholder="أحرف إنجليزية صغيرة وأرقام وشرطة سفلية"
                  dir="ltr"
                  className="text-sm font-mono"
                  autoComplete="off"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => changeUsernameMut.mutate()}
                disabled={
                  !newUsername.trim() ||
                  newUsername.trim() === user.username ||
                  changeUsernameMut.isPending
                }
                className="w-full"
              >
                {changeUsernameMut.isPending ? 'جارٍ التغيير…' : 'تغيير اسم المستخدم'}
              </Button>
            </div>
          </section>

          {/* Section 3: Reset Password */}
          <section className="rounded-xl border border-border-subtle bg-surface-elevated divide-y divide-border-subtle">
            <div className="px-6 py-4">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <KeyRound className="size-4 text-foreground-muted" />
                إعادة تعيين كلمة المرور
              </h2>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm text-foreground-muted leading-relaxed">
                يمكنك توليد كلمة مرور مؤقتة تلقائيًا أو إدخالها يدويًا، مع خيار إلزام المستخدم بتغييرها عند الدخول التالي.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setResetting(true)}
                className="w-full gap-2"
              >
                <KeyRound className="size-4" />
                إعادة تعيين كلمة المرور
              </Button>
            </div>
          </section>

          {/* Section 4: Delete User */}
          <section className="rounded-xl border border-destructive/30 bg-destructive/5 divide-y divide-destructive/20">
            <div className="px-6 py-4">
              <h2 className="font-semibold text-destructive flex items-center gap-2">
                <Trash2 className="size-4" />
                حذف المستخدم
              </h2>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm text-foreground-muted leading-relaxed">
                يحذف الحساب نهائيًا ويتعذّر استعادته لإعادة استخدامه. لا يمكن الرجوع عن الحذف. آخر مشرف عام نشط لا يمكن حذفه.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                className="w-full gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="size-4" />
                حذف المستخدم
              </Button>
            </div>
          </section>

        </div>
      </div>

      {/* ── Dialogs ─────────────────────────────────────────────── */}
      {resetting && (
        <ResetPasswordDialog user={user} onClose={() => setResetting(false)} defaultForceChange />
      )}
      {permsOpen && (
        <EditUserPermissionsDialog user={user} onClose={() => setPermsOpen(false)} />
      )}
      <ConfirmDialog
        open={confirmDelete}
        title="حذف المستخدم"
        message={`هل أنت متأكد من حذف "${user.full_name_ar}" نهائيًا؟ لا يمكن التراجع عن هذا الإجراء.`}
        onConfirm={() => deleteMut.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />

      <Toast
        open={!!toast}
        message={toast?.msg ?? ''}
        tone={toast?.tone ?? 'success'}
        autoDismissMs={2500}
        onClose={() => setToast(null)}
      />
    </div>
  );
}
