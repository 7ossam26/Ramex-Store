import { PlusCircle, ClipboardList } from 'lucide-react';
import { HubLanding, type HubCard } from '@/components/Layout/HubLanding';

const cards: HubCard[] = [
  {
    label: 'إضافة توب',
    description: 'تسجيل توب جديد بكل بياناته وتوليد الباركود',
    href: '/items/tops/add',
    icon: PlusCircle,
    permission: 'fabric_rolls',
  },
  {
    label: 'طلبات المحل',
    description: 'تجهيز طلبات المحل بمسح الأتواب وإرسال الشحنات',
    href: '/stock-requests',
    icon: ClipboardList,
    permission: 'stock_requests',
  },
];

export function FactorySenderDashboard() {
  return (
    <HubLanding
      title="مرحباً"
      description="اختر ما تريد البدء به"
      cards={cards}
      featuredMode="none"
    />
  );
}
