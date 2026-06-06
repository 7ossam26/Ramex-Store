import { lazy, Suspense, type ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { usePermissions } from '@/lib/permissions';
import { LoginPage } from './pages/Login';
import { HomePage } from './pages/Home';
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
import { ItemsHubPage } from './pages/items/ItemsHub';
import { NotificationsPage } from './pages/notifications/NotificationsPage';
import { ReportsHubPage } from './pages/reports/ReportsHub';
import { SettingsPage } from './pages/settings/SettingsPage';
import { HrHubPage } from './pages/hr/HrHub';
import { EmployeesPage } from './pages/hr/Employees';
import { SalariesPage } from './pages/hr/Salaries';
import { AdjustmentsPage as HrAdjustmentsPage } from './pages/hr/Adjustments';
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

/** Redirects to "/" if the user doesn't have any read-level access to the given
 *  resource. Uses canSee so resources whose read-equivalent action is `view`
 *  (hr, suppliers) are still admitted. */
function PermGate({ resource, children }: { resource: string; children: ReactNode }) {
  const { canSee, loading } = usePermissions();
  if (loading) return null;
  if (!canSee(resource)) return <Navigate to="/" replace />;
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
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppShell>
              <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<HomePage />} />

                <Route path="/items" element={<ItemsHubPage />} />
                <Route path="/items/rolls" element={<RollsPage />} />
                <Route path="/items/fabrics" element={<FabricsPage />} />
                <Route path="/items/labels" element={<LabelsPage />} />
                <Route path="/items/tops/add" element={<AddTopPage />} />

                <Route path="/inventory" element={<PermGate resource="inventory"><InventoryHubPage /></PermGate>} />
                <Route path="/inventory/stock" element={<PermGate resource="inventory"><StockViewPage /></PermGate>} />
                <Route path="/inventory/stock-movements" element={<PermGate resource="inventory"><StockMovementsPage /></PermGate>} />
                <Route path="/inventory/stocktake" element={<PermGate resource="inventory"><StocktakePage /></PermGate>} />
                <Route path="/inventory/adjustments" element={<PermGate resource="inventory"><AdjustmentsPage /></PermGate>} />
                <Route path="/inventory/damage" element={<PermGate resource="inventory"><DamagePage /></PermGate>} />

                <Route path="/shipments" element={<ShipmentsHubPage />} />
                <Route path="/shipments/all" element={<ShipmentsListPage />} />
                <Route path="/shipments/create" element={<CreateShipmentPage />} />
                <Route
                  path="/shipments/pending"
                  element={<ShipmentsListPage defaultStatus="pending_approval" />}
                />
                <Route path="/shipments/:id/continue" element={<CreateShipmentPage />} />
                <Route path="/shipments/:id/view" element={<ReviewShipmentPage readOnly />} />
                <Route path="/shipments/:id" element={<ReviewShipmentPage />} />

                <Route path="/customers" element={<PermGate resource="customers"><CustomersListPage /></PermGate>} />
                <Route path="/customers/:id" element={<PermGate resource="customers"><CustomerDetailPage /></PermGate>} />

                <Route path="/pos" element={<POSPage />} />

                <Route path="/invoices-returns" element={<InvoicesReturnsHubPage />} />
                <Route path="/invoices" element={<PermGate resource="invoices"><InvoicesListPage /></PermGate>} />
                <Route path="/invoices/:id" element={<PermGate resource="invoices"><InvoiceDetailPage /></PermGate>} />
                <Route path="/returns" element={<PermGate resource="returns"><ReturnsListPage /></PermGate>} />
                <Route path="/returns/:id" element={<PermGate resource="returns"><ReturnDetailPage /></PermGate>} />
                <Route path="/cheques" element={<ChequesPage />} />

                <Route path="/treasury" element={<TreasuryHubPage />} />
                <Route path="/treasury/overview" element={<TreasuriesOverviewPage />} />
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

                <Route path="/hr" element={<HrHubPage />} />
                <Route path="/hr/employees" element={<EmployeesPage />} />
                <Route path="/hr/salaries" element={<SalariesPage />} />
                <Route path="/hr/adjustments" element={<HrAdjustmentsPage />} />

                <Route path="/settings" element={<SettingsPage />} />

                <Route path="/shifts" element={<ShiftHistoryPage />} />
                <Route path="/shifts/:id" element={<ShiftReportPage />} />
              </Routes>
              </Suspense>
            </AppShell>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
