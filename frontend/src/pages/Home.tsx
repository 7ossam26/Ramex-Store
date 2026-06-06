import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { isOwnerOrAbove } from '@/lib/roles';
import { OwnerDashboard, SellerDashboard, FactorySenderDashboard } from '@/components/dashboard';
import { usePermissions } from '@/lib/permissions';
import { allLeaves } from '@/navigation/nav.config';

/* Role-aware landing.
 *   owner          → rich 3-fold analytics dashboard
 *   shop_seller    → slim "shift at a glance"
 *   factory_sender → factory stock + shipments KPI dashboard
 *   accountant     → reports hub (their main workspace)
 *   (no features)  → /no-access */
export function HomePage() {
  const { user } = useAuth();
  const { canSee, loading } = usePermissions();
  const role = user?.role;

  if (loading) return null;

  // A user with zero accessible features (beyond home) has nowhere to go.
  const featureLeaves = allLeaves(role, canSee).filter((l) => l.route !== '/');
  if (featureLeaves.length === 0) return <Navigate to="/no-access" replace />;

  if (isOwnerOrAbove(role)) return <OwnerDashboard />;
  if (role === 'shop_seller') return <SellerDashboard />;
  if (role === 'accountant') return <Navigate to="/reports" replace />;
  return <FactorySenderDashboard />;
}
