import { Banknote, Landmark, Receipt, Calculator, LayoutDashboard, CreditCard } from 'lucide-react';
import { HubLanding, type HubCard } from '@/components/Layout/HubLanding';
import { ar } from '@/i18n/ar';

const cards: HubCard[] = [
  {
    label: ar.treasuriesOverview.title,
    description: ar.hubs.treasuriesOverviewDesc,
    href: '/treasury/overview',
    icon: LayoutDashboard,
    visibleTo: ['owner', 'super_admin'],
    featured: true,
  },
  {
    label: ar.cash.drawer,
    description: ar.hubs.cashDesc,
    href: '/cash',
    icon: Banknote,
    permission: 'cash_drawer',
  },
  {
    label: ar.cash.banks,
    description: ar.hubs.banksDesc,
    href: '/banks',
    icon: Landmark,
    permission: 'cash_drawer',
  },
  {
    label: ar.cash.expenses,
    description: ar.hubs.expensesDesc,
    href: '/expenses',
    icon: Receipt,
    permission: 'cash_drawer',
  },
  {
    label: ar.cash.reconcile,
    description: ar.hubs.reconcileDesc,
    href: '/reconcile',
    icon: Calculator,
    permission: 'cash_drawer',
  },
  {
    label: ar.supplierPayables.title,
    description: ar.hubs.supplierPayablesDesc,
    href: '/treasury/suppliers',
    icon: CreditCard,
    permission: 'suppliers',
  },
];

export function TreasuryHubPage() {
  return (
    <HubLanding
      title={ar.hubs.treasuryTitle}
      description={ar.hubs.treasuryDescription}
      cards={cards}
    />
  );
}
