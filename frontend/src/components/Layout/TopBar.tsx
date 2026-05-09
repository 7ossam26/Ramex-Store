import { Link } from 'react-router-dom';
import { ModuleDropdown } from './ModuleDropdown';
import { UserMenu } from './UserMenu';
import { MobileNavDrawer, type NavGroup } from './MobileNavDrawer';
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

  const itemsGroup = {
    label: 'الأصناف',
    items: [
      { label: ar.addTop.navTitle, href: '/items/tops/add' },
      { label: ar.labels.rollsTitle, href: '/items/rolls' },
      { label: ar.labels.title, href: '/items/labels' },
    ],
  };
  const salesGroup = {
    label: ar.topbar.sales,
    items: [
      { label: ar.pos.title, href: '/pos' },
      { label: ar.invoices.title, href: '/invoices' },
      { label: ar.returns.title, href: '/returns' },
    ],
  };
  const customersGroup = {
    label: ar.topbar.customers,
    items: [
      { label: ar.customers.allCustomers, href: '/customers' },
      { label: ar.customers.addCustomer, href: '/customers?create=1' },
    ],
  };
  const paymentsGroup = {
    label: ar.topbar.payments,
    items: [
      { label: 'الخزنة الكاش', href: '/cash' },
      { label: 'البنوك', href: '/banks' },
      { label: 'المصروفات', href: '/expenses' },
      { label: 'التسوية اليومية', href: '/reconcile' },
    ],
  };
  const reportsGroup = {
    label: ar.topbar.reports,
    items: [
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
    ],
  };

  const mobileGroups: NavGroup[] = [itemsGroup];
  mobileGroups.push({ label: ar.topbar.inventory, items: inventoryItems });
  if (showShipments) mobileGroups.push({ label: ar.topbar.shipments, items: shipmentsItems });
  mobileGroups.push(salesGroup, customersGroup, paymentsGroup, reportsGroup);
  if (isOwner) {
    mobileGroups.push({
      label: ar.topbar.settings,
      items: [{ label: ar.settings.title, href: '/settings' }],
    });
  }
  if (isOwner || role === 'shop_seller') {
    mobileGroups.push({
      label: ar.approvals.title,
      items: [{ label: ar.approvals.pendingTab, href: '/approvals' }],
    });
  }

  return (
    <header className="h-14 bg-canvas border-b border-border flex items-center px-3 md:px-4 gap-2 md:gap-4 sticky top-0 z-30">
      <MobileNavDrawer groups={mobileGroups} />
      <Link
        to="/"
        className="size-9 rounded bg-primary text-primary-foreground inline-flex items-center justify-center font-bold cursor-pointer hover:opacity-80 transition-opacity shrink-0"
        title="الرئيسية"
      >
        R
      </Link>
      <nav className="hidden lg:flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
        <ModuleDropdown label={itemsGroup.label} items={itemsGroup.items} />
        <ModuleDropdown label={ar.topbar.inventory} items={inventoryItems} />
        {showShipments && <ModuleDropdown label={ar.topbar.shipments} items={shipmentsItems} />}
        <ModuleDropdown label={salesGroup.label} items={salesGroup.items} />
        <ModuleDropdown label={customersGroup.label} items={customersGroup.items} />
        <ModuleDropdown label={paymentsGroup.label} items={paymentsGroup.items} />
        <ModuleDropdown label={ar.topbar.invoices} items={[{ label: ar.invoices.title, href: '/invoices' }]} />
        <ModuleDropdown label={reportsGroup.label} items={reportsGroup.items} />
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
      <div className="flex-1 lg:hidden" />
      <NotificationBell />
      <UserMenu />
    </header>
  );
}
