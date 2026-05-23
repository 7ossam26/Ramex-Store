import { AlertOctagon, ArrowDownUp, ClipboardList, LayoutDashboard, Scale } from 'lucide-react';
import { HubLanding, type HubCard } from '@/components/Layout/HubLanding';
import { ar } from '@/i18n/ar';

const cards: HubCard[] = [
  {
    label: 'نظرة عامة على المخزون',
    description: ar.hubs.inventoryOverviewDesc,
    href: '/inventory/stock',
    icon: LayoutDashboard,
  },
  {
    label: ar.inventory.stockMovements,
    description: ar.hubs.inventoryMovementsDesc,
    href: '/inventory/stock-movements',
    icon: ArrowDownUp,
  },
  {
    label: ar.inventory.stocktake,
    description: ar.hubs.inventoryStocktakeDesc,
    href: '/inventory/stocktake',
    icon: ClipboardList,
  },
  {
    label: ar.inventory.adjustments,
    description: ar.hubs.inventoryAdjustmentsDesc,
    href: '/inventory/adjustments',
    icon: Scale,
  },
  {
    label: ar.inventory.damage,
    description: ar.hubs.inventoryDamageDesc,
    href: '/inventory/damage',
    icon: AlertOctagon,
  },
];

export function InventoryHubPage() {
  return (
    <HubLanding
      title={ar.hubs.inventoryTitle}
      description={ar.hubs.inventoryDescription}
      cards={cards}
    />
  );
}
