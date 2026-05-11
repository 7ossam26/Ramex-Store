import {
  Layers,
  ArrowRightLeft,
  ClipboardList,
  Wrench,
  AlertTriangle,
  Tags,
} from 'lucide-react';
import { HubLanding, type HubCard } from '@/components/Layout/HubLanding';
import { ar } from '@/i18n/ar';

const cards: HubCard[] = [
  {
    label: ar.inventory.fabrics,
    description: ar.hubs.inventoryFabricsDesc,
    href: '/inventory/fabrics',
    icon: Layers,
  },
  {
    label: ar.inventory.stockMovements,
    description: ar.hubs.inventoryMovementsDesc,
    href: '/inventory/stock-movements',
    icon: ArrowRightLeft,
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
    icon: Wrench,
  },
  {
    label: ar.inventory.damage,
    description: ar.hubs.inventoryDamageDesc,
    href: '/inventory/damage',
    icon: AlertTriangle,
  },
  {
    label: ar.codes.hubLabel,
    description: ar.codes.hubDesc,
    href: '/inventory/codes',
    icon: Tags,
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
