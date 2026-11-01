import { PlusCircle, Clock, List, Package, ClipboardList } from 'lucide-react';
import { HubLanding, type HubCard } from '@/components/Layout/HubLanding';
import { ar } from '@/i18n/ar';

const cards: HubCard[] = [
  {
    label: ar.stockRequests.newRequest,
    description: ar.stockRequests.newRequestDesc,
    href: '/stock-requests/new',
    icon: Package,
    visibleTo: ['owner', 'shop_seller', 'super_admin'],
    permission: 'stock_requests',
    featured: true,
  },
  {
    label: ar.stockRequests.factoryTitle,
    description: ar.stockRequests.factoryListDesc,
    href: '/stock-requests',
    icon: ClipboardList,
    visibleTo: ['factory_sender'],
    permission: 'stock_requests',
    featured: true,
  },
  {
    label: ar.stockRequests.title,
    description: ar.stockRequests.listDesc,
    href: '/stock-requests',
    icon: ClipboardList,
    visibleTo: ['owner', 'shop_seller', 'super_admin'],
    permission: 'stock_requests',
  },
  {
    // Manual shipment without a shop request: owner fallback only.
    label: 'إنشاء طلبية يدوية',
    description: 'طلبية مصنع بدون طلب من المحل (للمالك فقط)',
    href: '/shipments/create',
    icon: PlusCircle,
    visibleTo: ['owner', 'super_admin'],
  },
  {
    label: ar.shipments.pending,
    description: 'طلبيات في انتظار اعتماد المحل',
    href: '/shipments/pending',
    icon: Clock,
    visibleTo: ['owner', 'shop_seller', 'super_admin'],
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
