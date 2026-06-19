import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ar } from '@/i18n/ar';
import { usersApi, type UserRow } from '@/lib/settings-api';
import { extractApiError } from '@/lib/api-error';
import { Toast } from '@/components/Toast';
import { KeyRound } from 'lucide-react';

type Props = {
  user: UserRow | null;
  onClose: () => void;
  /** When true the "force password change" toggle defaults to ON. Defaults to false. */
  defaultForceChange?: boolean;
};

export function ResetPasswordDialog({ user, onClose, defaultForceChange = false }: Props) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [forcePasswordChange, setForcePasswordChange] = useState(defaultForceChange);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saved, setSaved] = useState(false);

  const resetMut = useMutation({
    mutationFn: () => usersApi.resetPassword(user!.id, newPassword, forcePasswordChange),
    onSuccess: () => {
      setSaved(true);
      setShowConfirm(false);
      setTimeout(onClose, 1500);
    },
    onError: (e) => {
      setApiError(extractApiError(e));
      setShowConfirm(false);
    },
  });

  function validate(): boolean {
    if (newPassword.length < 8) {
      setValidationError(ar.settings.users.passwordMin);
      return false;
    }
    if (newPassword !== confirmPassword) {
      setValidationError(ar.settings.users.passwordMismatch);
      return false;
    }
    setValidationError(null);
    return true;
  }

  function handleSave() {
    if (validate()) setShowConfirm(true);
  }

  if (!user) return null;

  return (
    <>
      <Dialog open={!!user && !showConfirm} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>{ar.settings.users.resetPassword}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label>{ar.settings.users.newPassword}</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setValidationError(null); }}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{ar.settings.users.confirmPassword}</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setValidationError(null); }}
                className="text-sm"
              />
            </div>
            {/* Force password change toggle */}
            <label className="flex items-start gap-3 rounded-lg border border-border-subtle bg-surface-row-alt p-3 cursor-pointer select-none">
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
                  فرض تغيير كلمة المرور عند الدخول التالي
                </div>
                <p className="text-xs text-foreground-muted mt-0.5">
                  سيُطلب من المستخدم تغيير كلمة المرور فور تسجيل دخوله القادم
                </p>
              </div>
            </label>

            {(validationError || apiError) && (
              <p className="text-xs text-destructive">{validationError ?? apiError}</p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onClose}>{ar.common.cancel}</Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSave}
              disabled={!newPassword || !confirmPassword || resetMut.isPending}
              className="border-red-400 text-red-600 hover:bg-red-50"
            >
              {ar.settings.users.resetPassword}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showConfirm}
        title={ar.settings.users.resetPassword}
        message={ar.settings.users.resetPasswordConfirm}
        onConfirm={() => resetMut.mutate()}
        onCancel={() => setShowConfirm(false)}
      />

      <Toast
        open={saved}
        message={ar.settings.users.resetPasswordDone}
        tone="success"
        autoDismissMs={2000}
        onClose={() => setSaved(false)}
      />
    </>
  );
}
