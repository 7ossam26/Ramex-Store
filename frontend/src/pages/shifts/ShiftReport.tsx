import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { FileText, Sheet, Printer } from 'lucide-react';
import { shiftsApi } from '@/lib/shifts-api';
import { type DailyReport } from '@/lib/reports-api';
import { ar } from '@/i18n/ar';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { DailyReportContent } from '@/pages/reports/DailyReport';

export function ShiftReportPage() {
  const { id } = useParams<{ id: string }>();
  const shiftId = Number(id);

  const { data, isLoading } = useQuery<DailyReport>({
    queryKey: ['shift-report', shiftId],
    queryFn: () => shiftsApi.getReport(shiftId),
    enabled: Boolean(shiftId),
  });

  return (
    <div className="space-y-6 p-4 lg:p-6" dir="rtl">
      <PageHeader
        title={ar.shifts.shiftReportTitle}
        backTo="/shifts"
        actions={
          data && (
            <div className="flex gap-2">
              <a href={shiftsApi.exportUrl(shiftId, 'pdf')} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <FileText className="size-3.5" />
                  PDF
                </Button>
              </a>
              <a href={shiftsApi.exportUrl(shiftId, 'excel')} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Sheet className="size-3.5" />
                  Excel
                </Button>
              </a>
              <a href={shiftsApi.exportUrl(shiftId, 'print')} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Printer className="size-3.5" />
                  طباعة
                </Button>
              </a>
            </div>
          )
        }
      />

      {isLoading && (
        <p className="text-sm text-foreground-muted">{ar.loading}</p>
      )}

      {data && <DailyReportContent report={data} />}
    </div>
  );
}
