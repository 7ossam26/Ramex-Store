import { PlusCircle, Boxes, Tags, Layers } from 'lucide-react';
import { HubLanding, type HubCard } from '@/components/Layout/HubLanding';
import { ar } from '@/i18n/ar';

const cards: HubCard[] = [
  {
    label: ar.addTop.navTitle,
    description: ar.hubs.itemsAddTopDesc,
    href: '/items/tops/add',
    icon: PlusCircle,
  },
  {
    label: ar.labels.rollsTitle,
    description: ar.hubs.itemsRollsDesc,
    href: '/items/rolls',
    icon: Boxes,
  },
  {
    label: ar.inventory.fabrics,
    description: ar.hubs.inventoryFabricsDesc,
    href: '/items/fabrics',
    icon: Layers,
  },
  {
    label: ar.labels.title,
    description: ar.hubs.itemsLabelsDesc,
    href: '/items/labels',
    icon: Tags,
  },
];

export function ItemsHubPage() {
  return (
    <HubLanding
      title={ar.hubs.itemsTitle}
      description={ar.hubs.itemsDescription}
      cards={cards}
    />
  );
}
