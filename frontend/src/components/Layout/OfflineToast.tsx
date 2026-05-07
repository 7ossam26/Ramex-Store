import { useOnline } from '@/lib/online-status';
import { ar } from '@/i18n/ar';

export function OfflineToast() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="fixed top-0 inset-x-0 z-50 bg-red-600 text-white text-center py-2 text-sm font-medium">
      {ar.offline}
    </div>
  );
}
