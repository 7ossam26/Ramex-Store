import { FileText, RotateCcw } from 'lucide-react';
import { HubLanding, type HubCard } from '@/components/Layout/HubLanding';
import { ar } from '@/i18n/ar';

const cards: HubCard[] = [
  {
    label: ar.invoices.title,
    description: ar.hubs.invoicesDesc,
    href: '/invoices',
    icon: FileText,
  },
  {
    label: ar.returns.title,
    description: ar.hubs.returnsDesc,
    href: '/returns',
    icon: RotateCcw,
  },
];

export function InvoicesReturnsHubPage() {
  return (
    <HubLanding
      title={ar.hubs.invoicesReturnsTitle}
      description={ar.hubs.invoicesReturnsDescription}
      cards={cards}
    />
  );
}
