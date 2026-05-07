import { ModuleDropdown } from './ModuleDropdown';
import { UserMenu } from './UserMenu';
import { NotificationBell } from '@/components/NotificationBell';
import { ar } from '@/i18n/ar';
import { useAuth } from '@/lib/auth';

export function TopBar() {
  const { user } = useAuth();
  const role = user?.role;
  const isOwner = role === 'owner';

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
        <ModuleDropdown
          label="الأصناف"
          items={[
            { label: ar.labels.rollsTitle, href: '/items/rolls' },
            { label: ar.labels.title, href: '/items/labels' },
          ]}
        />
        <ModuleDropdown label={ar.topbar.inventory} items={inventoryItems} />
        {showShipments && <ModuleDropdown label={ar.topbar.shipments} items={shipmentsItems} />}
        <ModuleDropdown
          label={ar.topbar.sales}
          items={[
            { label: ar.pos.title, href: '/pos' },
            { label: ar.invoices.title, href: '/invoices' },
            { label: ar.returns.title, href: '/returns' },
          ]}
        />
        <ModuleDropdown
          label={ar.topbar.customers}
          items={[
            { label: ar.customers.allCustomers, href: '/customers' },
            { label: ar.customers.addCustomer, href: '/customers?create=1' },
          ]}
        />
        <ModuleDropdown
          label={ar.topbar.payments}
          items={[
            { label: 'الخزنة الكاش', href: '/cash' },
            { label: 'البنوك', href: '/banks' },
            { label: 'المصروفات', href: '/expenses' },
            { label: 'التسوية اليومية', href: '/reconcile' },
          ]}
        />
        <ModuleDropdown label={ar.topbar.invoices} items={[{ label: ar.invoices.title, href: '/invoices' }]} />
        <ModuleDropdown
          label={ar.topbar.reports}
          items={[
            { label: ar.reports.daily, href: '/reports/daily' },
            { label: ar.reports.salesByFabricColor, href: '/reports/secondary/salesByFabricColor' },
            { label: ar.reports.customerLedger, href: '/reports/secondary/customerLedger' },
            { label: ar.reports.outstandingOpenInvoices, href: '/reports/secondary/outstandingOpenInvoices' },
            { label: ar.reports.stocktakeInventory, href: '/reports/secondary/stocktakeInventory' },
            { label: ar.reports.cashFlow, href: '/reports/secondary/cashFlow' },
            { label: ar.reports.bankReconciliation, href: '/reports/secondary/bankReconciliation' },
            { label: ar.reports.expenses, href: '/reports/secondary/expenses' },
            { label: ar.reports.damageLoss, href: '/reports/secondary/damageLoss' },
            { label: ar.reports.salesByPaymentMethod, href: '/reports/secondary/salesByPaymentMethod' },
            { label: ar.reports.auditLog, href: '/reports/secondary/auditLog' },
          ]}
        />
        {isOwner && (
          <ModuleDropdown
            label={ar.topbar.settings}
            items={[{ label: ar.settings.title, href: '/settings' }]}
          />
        )}
        {(isOwner || role === 'shop_seller') && (
          <ModuleDropdown
            label={ar.approvals.title}
            items={[{ label: ar.approvals.pendingTab, href: '/approvals' }]}
          />
        )}
      </nav>
      <NotificationBell />
      <UserMenu />
    </header>
  );
}
