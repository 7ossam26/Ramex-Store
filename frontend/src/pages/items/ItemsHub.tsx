import { PlusCircle, Boxes, Tags, Layers, Palette, Scissors, Plus } from 'lucide-react';
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
    label: ar.splitTop.navTitle,
    description: ar.hubs.itemsSplitTopDesc,
    href: '/items/tops/split',
    icon: Scissors,
  },
  {
    label: ar.addAccessory.navTitle,
    description: 'تسجيل اكسسوار جديد بالكمية بالقطع',
    href: '/items/accessories/add',
    icon: Plus,
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
    label: ar.colors.title,
    description: ar.hubs.itemsColorsDesc,
    href: '/items/colors',
    icon: Palette,
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
