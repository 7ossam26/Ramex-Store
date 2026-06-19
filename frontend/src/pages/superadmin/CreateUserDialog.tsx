import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usersApi } from '@/lib/settings-api';
import { extractApiError } from '@/lib/api-error';
import { Toast } from '@/components/Toast';
import { KeyRound } from 'lucide-react';

const ROLE_OPTIONS = [
  { value: 'owner', label: 'مالك' },
  { value: 'shop_seller', label: 'بائع محل' },
  { value: 'factory_sender', label: 'مرسل مصنع' },
  { value: 'accountant', label: 'محاسب' },
];

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CreateUserDialog({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [username, setUsername] = useState('');
  const [fullNameAr, setFullNameAr] = useState('');
  const [role, setRole] = useState('shop_seller');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [forcePasswordChange, setForcePasswordChange] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const createMut = useMutation({
    mutationFn: () =>
      usersApi.create({ username, full_name_ar: fullNameAr, role, password, force_password_change: forcePasswordChange }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['superadmin-users'] });
      setSaved(true);
      setTimeout(handleClose, 1400);
    },
    onError: (e) => {
      const msg = extractApiError(e);
      setError(msg === 'USERNAME_TAKEN' ? 'اسم المستخدم مستخدم بالفعل' : msg);
    },
  });

  function handleClose() {
    setUsername('');
    setFullNameAr('');
    setRole('shop_seller');
    setPassword('');
    setConfirmPassword('');
    setForcePasswordChange(true);
    setError(null);
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل'); return; }
    if (password !== confirmPassword) { setError('كلمة المرور وتأكيدها غير متطابقتين'); return; }
    createMut.mutate();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة مستخدم جديد</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label>اسم المستخدم (بالإنجليزية)</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="مثال: ahmed_ali"
                dir="ltr"
                className="text-sm"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label>الاسم الكامل (بالعربية)</Label>
              <Input
                value={fullNameAr}
                onChange={(e) => setFullNameAr(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label>الدور</Label>
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
            <div className="space-y-1.5">
              <Label>كلمة المرور الأولية</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label>تأكيد كلمة المرور</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="text-sm"
              />
            </div>

            {/* Force password change toggle */}
            <label className="flex items-start gap-3 rounded-lg border border-border-subtle bg-amber-50/60 p-3 cursor-pointer select-none">
              <div className="relative mt-0.5 shrink-0">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={forcePasswordChange}
                  onChange={(e) => setForcePasswordChange(e.target.checked)}
                />
                <div className="h-5 w-9 rounded-full bg-border-default transition-colors duration-150 peer-checked:bg-amber-600" />
                <div className="absolute top-0.5 start-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-150 peer-checked:translate-x-[-1rem]" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <KeyRound className="size-3.5 text-amber-600" />
                  فرض تغيير كلمة المرور عند أول تسجيل دخول
                </div>
                <p className="text-xs text-foreground-muted mt-0.5">
                  سيُطلب من المستخدم تغيير كلمة المرور فور تسجيل دخوله للمرة الأولى
                </p>
              </div>
            </label>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={handleClose}>إلغاء</Button>
              <Button
                type="submit"
                size="sm"
                className="bg-amber-700 hover:bg-amber-800 text-white"
                disabled={!username.trim() || !fullNameAr.trim() || !password || !confirmPassword || createMut.isPending}
              >
                {createMut.isPending ? 'جارٍ الإنشاء…' : 'إنشاء المستخدم'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Toast
        open={saved}
        message="تم إنشاء المستخدم بنجاح"
        tone="success"
        autoDismissMs={2000}
        onClose={() => setSaved(false)}
      />
    </>
  );
}
