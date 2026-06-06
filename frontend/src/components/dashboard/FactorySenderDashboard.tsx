import { PlusCircle, Send } from 'lucide-react';
import { HubLanding, type HubCard } from '@/components/Layout/HubLanding';

const cards: HubCard[] = [
  {
    label: 'إضافة توب',
    description: 'تسجيل توب جديد بكل بياناته وتوليد الباركود',
    href: '/items/tops/add',
    icon: PlusCircle,
  },
  {
    label: 'إنشاء طلبية',
    description: 'تسجيل طلبية مصنع جديدة وإضافة الاتواب إليها',
    href: '/shipments/create',
    icon: Send,
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
