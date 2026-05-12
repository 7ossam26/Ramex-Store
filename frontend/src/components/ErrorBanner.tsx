import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Props = {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
};

export function ErrorBanner({
  title = 'حدث خطأ',
  description = 'يرجى المحاولة مرة أخرى.',
  onRetry,
  retryLabel = 'إعادة المحاولة',
  className,
}: Props) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-lg border border-danger/30 bg-danger-subtle p-4 flex flex-col sm:flex-row sm:items-center gap-3',
        className,
      )}
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <AlertTriangle className="size-5 text-danger shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0">
          <p className="font-medium text-danger-foreground">{title}</p>
          <p className="text-sm text-danger-foreground/80 mt-0.5">{description}</p>
        </div>
      </div>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" size="sm" className="gap-1.5 shrink-0">
          <RefreshCw className="size-4" aria-hidden />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
