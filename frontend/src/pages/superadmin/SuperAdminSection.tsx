import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SuperAdminShell } from '@/components/SuperAdminShell/SuperAdminShell';
import { useAuth } from '@/lib/auth';
import { SuperAdminHubPage } from './SuperAdminHubPage';

const SuperAdminUsersPage = lazy(() =>
  import('./SuperAdminUsersPage').then((m) => ({ default: m.SuperAdminUsersPage })),
);
const SuperAdminUserDetailPage = lazy(() =>
  import('./SuperAdminUserDetailPage').then((m) => ({ default: m.SuperAdminUserDetailPage })),
);
const SuperAdminRolesPage = lazy(() =>
  import('./SuperAdminRolesPage').then((m) => ({ default: m.SuperAdminRolesPage })),
);
const SuperAdminRoleEditorPage = lazy(() =>
  import('./SuperAdminRoleEditorPage').then((m) => ({ default: m.SuperAdminRoleEditorPage })),
);
const SuperAdminAccessMatrixPage = lazy(() =>
  import('./SuperAdminAccessMatrixPage').then((m) => ({ default: m.SuperAdminAccessMatrixPage })),
);
const SuperAdminAuditLogPage = lazy(() =>
  import('./SuperAdminAuditLogPage').then((m) => ({ default: m.SuperAdminAuditLogPage })),
);
const SuperAdminBackupPage = lazy(() =>
  import('./SuperAdminBackupPage').then((m) => ({ default: m.SuperAdminBackupPage })),
);

function Loading() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="size-8 rounded-full border-2 border-amber-200 border-t-amber-700 animate-spin" />
    </div>
  );
}

function SuperAdminGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user && user.role !== 'super_admin') return <Navigate to="/no-access" replace />;
  return <>{children}</>;
}

export function SuperAdminSection() {
  return (
    <SuperAdminGuard>
      <SuperAdminShell>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<SuperAdminHubPage />} />
            <Route path="/users" element={<SuperAdminUsersPage />} />
            <Route path="/users/:id" element={<SuperAdminUserDetailPage />} />
            <Route path="/roles" element={<SuperAdminRolesPage />} />
            <Route path="/roles/:role" element={<SuperAdminRoleEditorPage />} />
            <Route path="/access-matrix" element={<SuperAdminAccessMatrixPage />} />
            <Route path="/audit-log" element={<SuperAdminAuditLogPage />} />
            <Route path="/backup" element={<SuperAdminBackupPage />} />
          </Routes>
        </Suspense>
      </SuperAdminShell>
    </SuperAdminGuard>
  );
}
