import { Users, DollarSign, ArrowDownUp } from 'lucide-react';
import { HubLanding, type HubCard } from '@/components/Layout/HubLanding';
import { ar } from '@/i18n/ar';

const cards: HubCard[] = [
  {
    label: ar.hr.employees,
    description: ar.hubs.hrEmployeesDesc,
    href: '/hr/employees',
    icon: Users,
  },
  {
    label: ar.hr.salaries,
    description: ar.hubs.hrSalariesDesc,
    href: '/hr/salaries',
    icon: DollarSign,
  },
  {
    label: ar.hr.adjustments,
    description: ar.hubs.hrAdjustmentsDesc,
    href: '/hr/adjustments',
    icon: ArrowDownUp,
  },
];

export function HrHubPage() {
  return (
    <HubLanding
      title={ar.hubs.hrTitle}
      description={ar.hubs.hrDescription}
      cards={cards}
    />
  );
}
