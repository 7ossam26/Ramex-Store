import { ModuleDropdown } from './ModuleDropdown';
import { UserMenu } from './UserMenu';
import { ar } from '@/i18n/ar';

export function TopBar() {
  return (
    <header className="h-14 bg-canvas border-b border-border flex items-center px-4 gap-4">
      <div className="size-9 rounded bg-primary text-primary-foreground inline-flex items-center justify-center font-bold">
        R
      </div>
      <nav className="flex items-center gap-1 flex-1">
        <ModuleDropdown label={ar.topbar.inventory} items={[{ label: 'الخامات', href: '/inventory/fabrics' }]} />
        <ModuleDropdown label={ar.topbar.sales} items={[{ label: 'نقطة البيع', href: '/pos' }]} />
        <ModuleDropdown label={ar.topbar.customers} items={[{ label: 'قائمة العملاء', href: '/customers' }]} />
        <ModuleDropdown label={ar.topbar.payments} items={[{ label: 'الخزنة', href: '/cash' }]} />
        <ModuleDropdown label={ar.topbar.invoices} items={[{ label: 'الفواتير', href: '/invoices' }]} />
        <ModuleDropdown label={ar.topbar.reports} items={[{ label: 'تقرير اليوم', href: '/reports/daily' }]} />
        <ModuleDropdown label={ar.topbar.settings} items={[{ label: 'الإعدادات العامة', href: '/settings' }]} />
      </nav>
      <UserMenu />
    </header>
  );
}
