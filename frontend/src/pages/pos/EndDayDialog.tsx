import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { FileText, Sheet, Printer } from 'lucide-react';
import { shiftsApi, type Shift } from '@/lib/shifts-api';
import { type DailyReport } from '@/lib/reports-api';
import { ar } from '@/i18n/ar';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { extractApiError } from '@/lib/api-error';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ResponsiveDialog';
import { DailyReportContent } from '@/pages/reports/DailyReport';

type Props = {
  open: boolean;
  shift: Shift;
  onClose: () => void;
};

type Step = 'confirm' | 'report';

export function EndDayDialog({ open, shift, onClose }: Props) {
  const [step, setStep] = useState<Step>('confirm');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [closedShift, setClosedShift] = useState<Shift | null>(null);
  const [report, setReport] = useState<DailyReport | null>(null);

  const closeMut = useMutation({
    mutationFn: async () => {
      const closed = await shiftsApi.close(notes.trim() || null);
      const rpt = await shiftsApi.getReport(closed.id);
      return { closed, rpt };
    },
    onSuccess: ({ closed, rpt }) => {
      setClosedShift(closed);
      setReport(rpt);
      setStep('report');
      setError(null);
    },
    onError: (e) => setError(extractApiError(e)),
  });

  function handleOpenChange(v: boolean) {
    if (!v) handleDone();
  }

  function handleDone() {
    setStep('confirm');
    setNotes('');
    setError(null);
    setClosedShift(null);
    setReport(null);
    onClose();
  }

  const exportId = closedShift?.id ?? shift.id;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
        dir="rtl"
      >
        {step === 'confirm' && (
          <>
            <DialogHeader>
              <DialogTitle>{ar.shifts.endDay}</DialogTitle>
            </DialogHeader>

            <p className="text-sm text-foreground-muted">{ar.shifts.closeShiftConfirm}</p>

            <div className="space-y-1.5">
              <Label htmlFor="end-notes" className="text-sm">{ar.shifts.notes}</Label>
              <textarea
                id="end-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="مثال: إغلاق المحل"
                className="w-full rounded-md border border-border-default bg-surface-elevated px-3 py-2 text-sm placeholder:text-foreground-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent resize-none"
              />
            </div>

            {error && (
              <p className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-foreground">
                {error}
              </p>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={handleDone} disabled={closeMut.isPending}>
                {ar.common.cancel}
              </Button>
              <Button
                className="bg-danger text-danger-foreground hover:opacity-90"
                disabled={closeMut.isPending}
                onClick={() => {
                  setError(null);
                  closeMut.mutate();
                }}
              >
                {closeMut.isPending ? 'جاري الإغلاق...' : ar.shifts.endShiftCta}
              </Button>
            </div>
          </>
        )}

        {step === 'report' && report && (
          <>
            <DialogHeader>
              <DialogTitle>{ar.shifts.shiftReportTitle}</DialogTitle>
            </DialogHeader>

            <div className="flex flex-wrap gap-2 mb-4">
              <a href={shiftsApi.exportUrl(exportId, 'pdf')} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <FileText className="size-3.5" />
                  PDF
                </Button>
              </a>
              <a href={shiftsApi.exportUrl(exportId, 'excel')} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Sheet className="size-3.5" />
                  Excel
                </Button>
              </a>
              <a href={shiftsApi.exportUrl(exportId, 'print')} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Printer className="size-3.5" />
                  طباعة
                </Button>
              </a>
            </div>

            <DailyReportContent report={report} />

            <div className="flex justify-end pt-4 border-t border-border-subtle">
              <Button onClick={handleDone}>تم</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
