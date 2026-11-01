import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ar } from '@/i18n/ar';

type Props = {
  open: boolean;
  title: string;
  hint?: string;
  /** When false the reason may be left empty. */
  required?: boolean;
  pending?: boolean;
  error?: string | null;
  onSubmit: (reason: string) => void;
  onCancel: () => void;
};

/** Small dialog that asks for a (usually mandatory) reason before an action. */
export function ReasonDialog({ open, title, hint, required = true, pending, error, onSubmit, onCancel }: Props) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setTouched(false);
    }
  }, [open]);

  const invalid = required && reason.trim().length < 2;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {hint && <p className="text-sm text-foreground-muted">{hint}</p>}
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (!invalid) onSubmit(reason.trim());
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="reason-input">{ar.stockRequests.reasonLabel}</Label>
            <Input
              id="reason-input"
              autoFocus
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
            {touched && invalid && <p className="text-sm text-danger">{ar.stockRequests.reasonRequired}</p>}
            {error && <p className="text-sm text-danger">{error}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              {ar.common.cancel}
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? ar.loading : ar.common.confirm}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
