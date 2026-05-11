import {
  CalendarClock,
  Palette,
  UserSquare,
  FileClock,
  Boxes,
  TrendingUp,
  Landmark,
  Receipt,
  AlertOctagon,
  CreditCard,
  ShieldCheck,
} from 'lucide-react';
import { HubLanding, type HubCard } from '@/components/Layout/HubLanding';
import { ar } from '@/i18n/ar';

const dailyCard: HubCard = {
  label: ar.reports.daily,
  description: ar.hubs.reportsDailyDesc,
  href: '/reports/daily',
  icon: CalendarClock,
};

const secondary: HubCard[] = [
  {
    label: ar.reports.salesByFabricColor,
    href: '/reports/secondary/salesByFabricColor',
    icon: Palette,
  },
  {
    label: ar.reports.customerLedger,
    href: '/reports/secondary/customerLedger',
    icon: UserSquare,
  },
  {
    label: ar.reports.outstandingOpenInvoices,
    href: '/reports/secondary/outstandingOpenInvoices',
    icon: FileClock,
  },
  {
    label: ar.reports.stocktakeInventory,
    href: '/reports/secondary/stocktakeInventory',
    icon: Boxes,
  },
  {
    label: ar.reports.cashFlow,
    href: '/reports/secondary/cashFlow',
    icon: TrendingUp,
  },
  {
    label: ar.reports.bankReconciliation,
    href: '/reports/secondary/bankReconciliation',
    icon: Landmark,
  },
  {
    label: ar.reports.expenses,
    href: '/reports/secondary/expenses',
    icon: Receipt,
  },
  {
    label: ar.reports.damageLoss,
    href: '/reports/secondary/damageLoss',
    icon: AlertOctagon,
  },
  {
    label: ar.reports.salesByPaymentMethod,
    href: '/reports/secondary/salesByPaymentMethod',
    icon: CreditCard,
  },
  {
    label: ar.reports.auditLog,
    href: '/reports/secondary/auditLog',
    icon: ShieldCheck,
  },
];

export function ReportsHubPage() {
  return (
    <div className="space-y-6">
      <HubLanding
        title={ar.hubs.reportsTitle}
        description={ar.hubs.reportsDescription}
        cards={[dailyCard]}
      />
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {ar.hubs.reportsSecondarySection}
        </h2>
        <HubLanding title="" cards={secondary} />
      </div>
    </div>
  );
}
