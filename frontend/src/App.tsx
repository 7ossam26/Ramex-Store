import { lazy, Suspense, type ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { usePermissions } from '@/lib/permissions';
import { LoginPage } from './pages/Login';
import { HomePage } from './pages/Home';
import { SuperAdminSection } from './pages/superadmin/SuperAdminSection';
import { SuperAdminUserDetailPage } from './pages/superadmin/SuperAdminUserDetailPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { NoAccessPage } from './pages/NoAccess';
import { AppShell } from './components/AppShell';
import { ProtectedRoute } from './components/ProtectedRoute';
import { CreateShipmentPage } from './pages/shipments/CreateShipment';
import { ShipmentsListPage } from './pages/shipments/ShipmentsList';
import { ReviewShipmentPage } from './pages/shipments/ReviewShipment';
import { ShipmentsHubPage } from './pages/shipments/ShipmentsHub';
import { FabricsPage } from './pages/inventory/Fabrics';
import { StockViewPage } from './pages/inventory/StockView';
import { StockMovementsPage } from './pages/inventory/StockMovements';
import { StocktakePage } from './pages/inventory/Stocktake';
import { AdjustmentsPage } from './pages/inventory/Adjustments';
import { DamagePage } from './pages/inventory/Damage';
import { InventoryHubPage } from './pages/inventory/InventoryHub';
import { CustomersListPage } from './pages/customers/CustomersList';
import { CustomerDetailPage } from './pages/customers/CustomerDetail';
import { POSPage } from './pages/pos/POS';
import { InvoicesListPage } from './pages/invoices/InvoicesList';
import { InvoiceDetailPage } from './pages/invoices/InvoiceDetail';
import { DraftInvoicePrintPage } from './pages/invoices/DraftInvoicePrintPage';
import { InvoicesReturnsHubPage } from './pages/invoicesReturns/InvoicesReturnsHub';
import { ChequesPage } from './pages/invoicesReturns/ChequesPage';
import { CashDrawerPage } from './pages/cash/CashDrawer';
import { BanksPage } from './pages/cash/Banks';
import { ExpensesPage } from './pages/cash/Expenses';
import { CashReconcilePage } from './pages/cash/CashReconcile';
import { TreasuryHubPage } from './pages/treasury/TreasuryHub';
import { TreasuriesOverviewPage } from './pages/treasury/TreasuriesOverview';
import { SuppliersPage } from './pages/treasury/SuppliersPage';
import { ReturnsListPage } from './pages/returns/ReturnsList';
import { ReturnDetailPage } from './pages/returns/ReturnDetail';
import { LabelsPage } from './pages/items/Labels';
import { RollsPage } from './pages/items/Rolls';
import { AddTopPage } from './pages/items/AddTop';
import { SplitTopPage } from './pages/items/SplitTop';
import { ItemsHubPage } from './pages/items/ItemsHub';
import { ColorsPage } from './pages/items/Colors';
import { NotificationsPage } from './pages/notifications/NotificationsPage';
import { ReportsHubPage } from './pages/reports/ReportsHub';
import { SettingsPage } from './pages/settings/SettingsPage';
import { EmployeesPage } from './pages/hr/Employees';
import { ShiftHistoryPage } from './pages/shifts/ShiftHistory';
import { ShiftReportPage } from './pages/shifts/ShiftReport';

/* Chart-heavy report routes are lazy-loaded so Recharts is only fetched
 * when the user navigates into Reports. Saves ~250kb gzipped from the
 * initial bundle for everyone who never opens a sub-report. */
const GeneralReportPage = lazy(() =>
  import('./pages/reports/GeneralReport').then((m) => ({ default: m.GeneralReportPage })),
);
const DailyReportPage = lazy(() =>
  import('./pages/reports/DailyReport').then((m) => ({ default: m.DailyReportPage })),
);
const SecondaryReportPage = lazy(() =>
  import('./pages/reports/SecondaryReport').then((m) => ({ default: m.SecondaryReportPage })),
);

/** Redirects to "/no-access" if the user doesn't have any read-level access to the given
 *  resource. Uses canSee so resources whose read-equivalent action is `view`
 *  (hr, suppliers) are still admitted. */
function PermGate({ resource, children }: { resource: string; children: ReactNode }) {
  const { canSee, loading } = usePermissions();
  if (loading) return null;
  if (!canSee(resource)) return <Navigate to="/no-access" replace />;
  return <>{children}</>;
}

function RouteFallback() {
  return (
    <div className="flex items-center justify-center py-24" aria-live="polite">
      <div className="size-8 rounded-full border-2 border-border-default border-t-accent animate-spin" aria-hidden />
      <span className="sr-only">جاري التحميل</span>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Draft invoice print view — full-page, no AppShell chrome */}
      <Route
        path="/invoices/:id/draft"
        element={
          <ProtectedRoute>
            <DraftInvoicePrintPage />
          </ProtectedRoute>
        }
      />
      {/* User detail page — inside the regular AppShell so it inherits the system navbar */}
      <Route
        path="/superadmin/users/:id"
        element={
          <ProtectedRoute>
            <AppShell>
              <SuperAdminUserDetailPage />
            </AppShell>
          </ProtectedRoute>
        }
      />
      {/* Super admin section — amber shell, own layout */}
      <Route
        path="/superadmin/*"
        element={
          <ProtectedRoute>
            <SuperAdminSection />
          </ProtectedRoute>
        }
      />
      {/* Force password change — own full-page layout */}
      <Route
        path="/change-password"
        element={
          <ProtectedRoute>
            <ChangePasswordPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppShell>
              <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/no-access" element={<NoAccessPage />} />

                <Route path="/items" element={<PermGate resource="fabric_rolls"><ItemsHubPage /></PermGate>} />
                <Route path="/items/rolls" element={<PermGate resource="fabric_rolls"><RollsPage /></PermGate>} />
                <Route path="/items/fabrics" element={<PermGate resource="fabric_rolls"><FabricsPage /></PermGate>} />
                <Route path="/items/labels" element={<PermGate resource="fabric_rolls"><LabelsPage /></PermGate>} />
                <Route path="/items/tops/add" element={<PermGate resource="fabric_rolls"><AddTopPage /></PermGate>} />
                <Route path="/items/tops/split" element={<PermGate resource="fabric_rolls"><SplitTopPage /></PermGate>} />
                <Route path="/items/colors" element={<PermGate resource="fabric_rolls"><ColorsPage /></PermGate>} />

                <Route path="/inventory" element={<PermGate resource="inventory"><InventoryHubPage /></PermGate>} />
                <Route path="/inventory/stock" element={<PermGate resource="inventory"><StockViewPage /></PermGate>} />
                <Route path="/inventory/stock-movements" element={<PermGate resource="inventory"><StockMovementsPage /></PermGate>} />
                <Route path="/inventory/stocktake" element={<PermGate resource="inventory"><StocktakePage /></PermGate>} />
                <Route path="/inventory/adjustments" element={<PermGate resource="inventory"><AdjustmentsPage /></PermGate>} />
                <Route path="/inventory/damage" element={<PermGate resource="inventory"><DamagePage /></PermGate>} />

                <Route path="/shipments" element={<PermGate resource="shipments"><ShipmentsHubPage /></PermGate>} />
                <Route path="/shipments/all" element={<PermGate resource="shipments"><ShipmentsListPage /></PermGate>} />
                <Route path="/shipments/create" element={<PermGate resource="shipments"><CreateShipmentPage /></PermGate>} />
                <Route
                  path="/shipments/pending"
                  element={<PermGate resource="shipments"><ShipmentsListPage defaultStatus="pending_approval" /></PermGate>}
                />
                <Route path="/shipments/:id/continue" element={<PermGate resource="shipments"><CreateShipmentPage /></PermGate>} />
                <Route path="/shipments/:id/view" element={<PermGate resource="shipments"><ReviewShipmentPage readOnly /></PermGate>} />
                <Route path="/shipments/:id" element={<PermGate resource="shipments"><ReviewShipmentPage /></PermGate>} />

                <Route path="/customers" element={<PermGate resource="customers"><CustomersListPage /></PermGate>} />
                <Route path="/customers/:id" element={<PermGate resource="customers"><CustomerDetailPage /></PermGate>} />

                <Route path="/pos" element={<PermGate resource="invoices"><POSPage /></PermGate>} />

                <Route path="/invoices-returns" element={<InvoicesReturnsHubPage />} />
                <Route path="/invoices" element={<PermGate resource="invoices"><InvoicesListPage /></PermGate>} />
                <Route path="/invoices/:id" element={<PermGate resource="invoices"><InvoiceDetailPage /></PermGate>} />
                <Route path="/returns" element={<PermGate resource="returns"><ReturnsListPage /></PermGate>} />
                <Route path="/returns/:id" element={<PermGate resource="returns"><ReturnDetailPage /></PermGate>} />
                <Route path="/cheques" element={<PermGate resource="invoices"><ChequesPage /></PermGate>} />

                <Route path="/treasury" element={<TreasuryHubPage />} />
                <Route path="/treasury/overview" element={<PermGate resource="cash_drawer"><TreasuriesOverviewPage /></PermGate>} />
                <Route path="/treasury/suppliers" element={<PermGate resource="suppliers"><SuppliersPage /></PermGate>} />
                <Route path="/cash" element={<PermGate resource="cash_drawer"><CashDrawerPage /></PermGate>} />
                <Route path="/banks" element={<PermGate resource="cash_drawer"><BanksPage /></PermGate>} />
                <Route path="/expenses" element={<PermGate resource="cash_drawer"><ExpensesPage /></PermGate>} />
                <Route path="/reconcile" element={<PermGate resource="cash_drawer"><CashReconcilePage /></PermGate>} />

                <Route path="/notifications" element={<NotificationsPage />} />

                <Route path="/reports" element={<PermGate resource="reports.daily"><ReportsHubPage /></PermGate>} />
                <Route path="/reports/general" element={<PermGate resource="reports.daily"><GeneralReportPage /></PermGate>} />
                <Route path="/reports/daily" element={<PermGate resource="reports.daily"><DailyReportPage /></PermGate>} />
                <Route path="/reports/secondary/:reportKey" element={<PermGate resource="reports.daily"><SecondaryReportPage /></PermGate>} />

                <Route path="/hr" element={<PermGate resource="hr"><EmployeesPage /></PermGate>} />
                <Route path="/hr/employees" element={<PermGate resource="hr"><EmployeesPage /></PermGate>} />

                <Route path="/settings" element={<PermGate resource="settings"><SettingsPage /></PermGate>} />

                <Route path="/shifts" element={<PermGate resource="cash_drawer"><ShiftHistoryPage /></PermGate>} />
                <Route path="/shifts/:id" element={<PermGate resource="cash_drawer"><ShiftReportPage /></PermGate>} />
              </Routes>
              </Suspense>
            </AppShell>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
