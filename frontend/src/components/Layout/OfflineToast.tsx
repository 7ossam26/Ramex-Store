import { useOnline } from '@/lib/online-status';
import { ar } from '@/i18n/ar';

export function OfflineToast() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      data-print="hide"
      className="fixed top-0 inset-x-0 z-toast bg-danger text-foreground-on-accent text-center py-2 text-sm font-medium print:hidden"
    >
      {ar.offline}
    </div>
  );
}
