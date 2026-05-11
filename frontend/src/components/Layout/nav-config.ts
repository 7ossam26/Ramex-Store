import {
  Home,
  ShoppingCart,
  Package,
  Warehouse,
  Truck,
  Users,
  Receipt,
  Wallet,
  BarChart3,
  Settings as SettingsIcon,
  ClipboardCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ar } from '@/i18n/ar';
import type { Role } from '@/lib/auth';

export type SectionKey =
  | 'home'
  | 'pos'
  | 'items'
  | 'inventory'
  | 'shipments'
  | 'customers'
  | 'invoicesReturns'
  | 'treasury'
  | 'reports'
  | 'approvals'
  | 'settings';

export type RailItem = {
  key: SectionKey;
  label: string;
  icon: LucideIcon;
  path: string;
  visibleTo?: Role[];
};

export type SubTab = {
  label: string;
  href: string;
  visibleTo?: Role[];
};

export const railItems: RailItem[] = [
  { key: 'home', label: ar.rail.home, icon: Home, path: '/' },
  { key: 'pos', label: ar.rail.pos, icon: ShoppingCart, path: '/pos', visibleTo: ['owner', 'shop_seller'] },
  { key: 'items', label: ar.rail.items, icon: Package, path: '/items' },
  { key: 'inventory', label: ar.rail.inventory, icon: Warehouse, path: '/inventory' },
  {
    key: 'shipments',
    label: ar.rail.shipments,
    icon: Truck,
    path: '/shipments',
    visibleTo: ['owner', 'shop_seller', 'factory_sender'],
  },
  { key: 'customers', label: ar.rail.customers, icon: Users, path: '/customers' },
  { key: 'invoicesReturns', label: ar.rail.invoicesReturns, icon: Receipt, path: '/invoices-returns' },
  { key: 'treasury', label: ar.rail.treasury, icon: Wallet, path: '/treasury' },
  { key: 'reports', label: ar.rail.reports, icon: BarChart3, path: '/reports' },
  {
    key: 'approvals',
    label: ar.rail.approvals,
    icon: ClipboardCheck,
    path: '/approvals',
    visibleTo: ['owner', 'shop_seller'],
  },
  { key: 'settings', label: ar.rail.settings, icon: SettingsIcon, path: '/settings', visibleTo: ['owner'] },
];

export const subTabsBySection: Record<SectionKey, SubTab[]> = {
  home: [],
  pos: [],
  items: [
    { label: ar.addTop.navTitle, href: '/items/tops/add' },
    { label: ar.labels.rollsTitle, href: '/items/rolls' },
    { label: ar.labels.title, href: '/items/labels' },
  ],
  inventory: [
    { label: ar.inventory.fabrics, href: '/inventory/fabrics' },
    { label: ar.inventory.stockMovements, href: '/inventory/stock-movements' },
    { label: ar.inventory.stocktake, href: '/inventory/stocktake' },
    { label: ar.inventory.adjustments, href: '/inventory/adjustments' },
    { label: ar.inventory.damage, href: '/inventory/damage' },
    { label: ar.codes.hubLabel, href: '/inventory/codes' },
  ],
  shipments: [
    { label: ar.shipments.create, href: '/shipments/create', visibleTo: ['owner', 'factory_sender'] },
    { label: ar.shipments.pending, href: '/shipments/pending', visibleTo: ['owner', 'shop_seller'] },
    { label: ar.shipments.all, href: '/shipments' },
  ],
  customers: [],
  invoicesReturns: [
    { label: ar.invoices.title, href: '/invoices' },
    { label: ar.returns.title, href: '/returns' },
  ],
  treasury: [
    { label: ar.treasuriesOverview.title, href: '/treasury/overview', visibleTo: ['owner'] as Role[] },
    { label: ar.cash.drawer, href: '/cash' },
    { label: ar.cash.banks, href: '/banks' },
    { label: ar.cash.expenses, href: '/expenses' },
    { label: ar.cash.reconcile, href: '/reconcile' },
  ],
  reports: [],
  approvals: [],
  settings: [],
};

export function activeSectionForPath(pathname: string): SectionKey {
  if (pathname === '/' || pathname === '') return 'home';
  if (pathname.startsWith('/pos')) return 'pos';
  if (pathname.startsWith('/items')) return 'items';
  if (pathname.startsWith('/inventory')) return 'inventory';
  if (pathname.startsWith('/shipments')) return 'shipments';
  if (pathname.startsWith('/customers')) return 'customers';
  if (
    pathname.startsWith('/invoices-returns') ||
    pathname.startsWith('/invoices') ||
    pathname.startsWith('/returns')
  ) {
    return 'invoicesReturns';
  }
  if (
    pathname.startsWith('/treasury') ||
    pathname.startsWith('/cash') ||
    pathname.startsWith('/banks') ||
    pathname.startsWith('/expenses') ||
    pathname.startsWith('/reconcile')
  ) {
    return 'treasury';
  }
  if (pathname.startsWith('/reports')) return 'reports';
  if (pathname.startsWith('/approvals')) return 'approvals';
  if (pathname.startsWith('/settings')) return 'settings';
  return 'home';
}

export function visibleRailItems(role: Role | undefined): RailItem[] {
  return railItems.filter((i) => !i.visibleTo || (role && i.visibleTo.includes(role)));
}

export function visibleSubTabs(section: SectionKey, role: Role | undefined): SubTab[] {
  return subTabsBySection[section].filter(
    (t) => !t.visibleTo || (role && t.visibleTo.includes(role)),
  );
}
