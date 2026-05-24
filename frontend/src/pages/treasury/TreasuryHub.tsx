import { Banknote, Landmark, Receipt, Calculator, LayoutDashboard } from 'lucide-react';
import { HubLanding, type HubCard } from '@/components/Layout/HubLanding';
import { ar } from '@/i18n/ar';

const cards: HubCard[] = [
  {
    label: ar.treasuriesOverview.title,
    description: ar.hubs.treasuriesOverviewDesc,
    href: '/treasury/overview',
    icon: LayoutDashboard,
    visibleTo: ['owner'],
    featured: true,
  },
  {
    label: ar.cash.drawer,
    description: ar.hubs.cashDesc,
    href: '/cash',
    icon: Banknote,
  },
  {
    label: ar.cash.banks,
    description: ar.hubs.banksDesc,
    href: '/banks',
    icon: Landmark,
  },
  {
    label: ar.cash.expenses,
    description: ar.hubs.expensesDesc,
    href: '/expenses',
    icon: Receipt,
  },
  {
    label: ar.cash.reconcile,
    description: ar.hubs.reconcileDesc,
    href: '/reconcile',
    icon: Calculator,
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
