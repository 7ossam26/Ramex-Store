import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ar } from '@/i18n/ar';

type Props = {
  open: boolean;
  message: string;
  title?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({ open, message, title, onConfirm, onCancel }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title ?? ar.common.confirm}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-foreground">{message}</p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            {ar.common.cancel}
          </Button>
          <Button size="sm" onClick={onConfirm}>
            {ar.common.confirm}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
