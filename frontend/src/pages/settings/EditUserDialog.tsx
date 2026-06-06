import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ar } from '@/i18n/ar';
import { usersApi, type UserRow } from '@/lib/settings-api';
import { extractApiError } from '@/lib/api-error';
import { Toast } from '@/components/Toast';

type Props = {
  user: UserRow | null;
  onClose: () => void;
};

export function EditUserDialog({ user, onClose }: Props) {
  const qc = useQueryClient();
  const [fullNameAr, setFullNameAr] = useState(user?.full_name_ar ?? '');
  const [role, setRole] = useState(user?.role ?? 'shop_seller');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const updateMut = useMutation({
    mutationFn: () => usersApi.update(user!.id, { full_name_ar: fullNameAr, role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-users'] });
      setSaved(true);
      setTimeout(onClose, 1200);
    },
    onError: (e) => setError(extractApiError(e)),
  });

  if (!user) return null;

  return (
    <>
      <Dialog open={!!user} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>{ar.settings.users.editUser}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label>{ar.settings.users.fullNameAr}</Label>
              <Input
                value={fullNameAr}
                onChange={(e) => setFullNameAr(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{ar.settings.users.role}</Label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="owner">{ar.settings.users.roles.owner}</option>
                <option value="shop_seller">{ar.settings.users.roles.shop_seller}</option>
                <option value="factory_sender">{ar.settings.users.roles.factory_sender}</option>
                <option value="accountant">{ar.settings.users.roles.accountant}</option>
              </select>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onClose}>{ar.common.cancel}</Button>
            <Button
              size="sm"
              onClick={() => updateMut.mutate()}
              disabled={!fullNameAr.trim() || updateMut.isPending}
            >
              {ar.common.save}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Toast
        open={saved}
        message={ar.common.success}
        tone="success"
        autoDismissMs={2000}
        onClose={() => setSaved(false)}
      />
    </>
  );
}
