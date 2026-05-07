import { ModuleDropdown } from './ModuleDropdown';
import { UserMenu } from './UserMenu';
import { ar } from '@/i18n/ar';
import { useAuth } from '@/lib/auth';

export function TopBar() {
  const { user } = useAuth();
  const role = user?.role;

  const inventoryItems = [
    { label: ar.inventory.fabrics, href: '/inventory/fabrics' },
    { label: ar.inventory.stockMovements, href: '/inventory/stock-movements' },
    { label: ar.inventory.stocktake, href: '/inventory/stocktake' },
    { label: ar.inventory.adjustments, href: '/inventory/adjustments' },
    { label: ar.inventory.damage, href: '/inventory/damage' },
  ];

  const shipmentsItems = (() => {
    const items: Array<{ label: string; href: string }> = [];
    if (role === 'factory_sender' || role === 'owner') {
      items.push({ label: ar.shipments.create, href: '/shipments/create' });
    }
    if (role === 'shop_seller' || role === 'owner') {
      items.push({ label: ar.shipments.pending, href: '/shipments/pending' });
    }
    items.push({ label: ar.shipments.all, href: '/shipments' });
    return items;
  })();

  const showShipments = role === 'factory_sender' || role === 'shop_seller' || role === 'owner';

  return (
    <header className="h-14 bg-canvas border-b border-border flex items-center px-4 gap-4">
      <div className="size-9 rounded bg-primary text-primary-foreground inline-flex items-center justify-center font-bold">
        R
      </div>
      <nav className="flex items-center gap-1 flex-1">
        <ModuleDropdown label={ar.topbar.inventory} items={inventoryItems} />
        {showShipments && <ModuleDropdown label={ar.topbar.shipments} items={shipmentsItems} />}
        <ModuleDropdown label={ar.topbar.sales} items={[{ label: 'نقطة البيع', href: '/pos' }]} />
        <ModuleDropdown
          label={ar.topbar.customers}
          items={[
            { label: ar.customers.allCustomers, href: '/customers' },
            { label: ar.customers.addCustomer, href: '/customers?create=1' },
          ]}
        />
        <ModuleDropdown label={ar.topbar.payments} items={[{ label: 'الخزنة', href: '/cash' }]} />
        <ModuleDropdown label={ar.topbar.invoices} items={[{ label: 'الفواتير', href: '/invoices' }]} />
        <ModuleDropdown label={ar.topbar.reports} items={[{ label: 'تقرير اليوم', href: '/reports/daily' }]} />
        <ModuleDropdown label={ar.topbar.settings} items={[{ label: 'الإعدادات العامة', href: '/settings' }]} />
      </nav>
      <UserMenu />
    </header>
  );
}
