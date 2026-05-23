import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sun } from 'lucide-react';
import { shiftsApi } from '@/lib/shifts-api';
import { ar } from '@/i18n/ar';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { extractApiError } from '@/lib/api-error';

type Props = {
  onStaleShift?: () => void;
};

export function StartDayPanel({ onStaleShift }: Props) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const openMut = useMutation({
    mutationFn: () => shiftsApi.open(notes.trim() || null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift-current'] });
      qc.invalidateQueries({ queryKey: ['cash-balance'] });
    },
    onError: (e) => {
      const msg = extractApiError(e);
      if (msg === 'STALE_OPEN_SHIFT' || (e as { response?: { data?: { error?: string } } })?.response?.data?.error === 'STALE_OPEN_SHIFT') {
        onStaleShift?.();
      } else {
        setError(msg);
      }
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4" dir="rtl">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-border-subtle bg-surface-elevated p-8 shadow-lg">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="rounded-full bg-accent-subtle p-4">
            <Sun className="size-10 text-accent-foreground" aria-hidden />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{ar.shifts.startDay}</h1>
          <p className="text-sm text-foreground-muted">
            جاهز للبدء؟
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes" className="text-sm">{ar.shifts.notes}</Label>
          <textarea
            id="notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="مثال: فتح المحل"
            className="w-full rounded-md border border-border-default bg-surface-elevated px-3 py-2 text-sm placeholder:text-foreground-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent resize-none"
          />
        </div>

        {error && (
          <p className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-foreground">
            {error}
          </p>
        )}

        <Button
          className="w-full"
          variant="accent"
          size="lg"
          disabled={openMut.isPending}
          onClick={() => {
            setError(null);
            openMut.mutate();
          }}
        >
          {openMut.isPending ? 'جاري الفتح...' : ar.shifts.startShiftCta}
        </Button>
      </div>
    </div>
  );
}
