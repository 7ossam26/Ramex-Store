import { PlusCircle, Clock, List } from 'lucide-react';
import { HubLanding, type HubCard } from '@/components/Layout/HubLanding';
import { ar } from '@/i18n/ar';

const cards: HubCard[] = [
  {
    label: ar.shipments.create,
    description: 'تسجيل طلبية مصنع جديدة',
    href: '/shipments/create',
    icon: PlusCircle,
    visibleTo: ['owner', 'factory_sender'],
    featured: true,
  },
  {
    label: ar.shipments.pending,
    description: 'طلبيات في انتظار اعتماد المحل',
    href: '/shipments/pending',
    icon: Clock,
    visibleTo: ['owner', 'shop_seller'],
  },
  {
    label: ar.shipments.all,
    description: 'عرض كل الطلبيات بكل الحالات',
    href: '/shipments/all',
    icon: List,
  },
];

export function ShipmentsHubPage() {
  return (
    <HubLanding
      title={ar.hubs.shipmentsTitle}
      description={ar.hubs.shipmentsDescription}
      cards={cards}
      featuredMode="explicit"
    />
  );
}
