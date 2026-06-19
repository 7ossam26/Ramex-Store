import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { ar } from '@/i18n/ar';
import type { ReactNode } from 'react';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="p-8 text-center">{ar.loading}</div>;
  if (!user) return <Navigate to="/login" replace />;

  // Force password change — redirect everywhere except the change-password page itself
  if (user.force_password_change && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return <>{children}</>;
}
