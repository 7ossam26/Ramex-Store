import { useAuth } from '@/lib/auth';
import { isOwnerOrAbove } from '@/lib/roles';
import { OwnerDashboard, SellerDashboard, FactorySenderDashboard } from '@/components/dashboard';

/* Role-aware landing.
 *   owner          → rich 3-fold analytics dashboard
 *   shop_seller    → slim "shift at a glance"
 *   factory_sender → factory stock + shipments KPI dashboard */
export function HomePage() {
  const { user } = useAuth();
  const role = user?.role;

  if (isOwnerOrAbove(role)) return <OwnerDashboard />;
  if (role === 'shop_seller') return <SellerDashboard />;
  return <FactorySenderDashboard />;
}
