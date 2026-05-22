import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
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
import { CodesPage } from './pages/inventory/CodesPage';
import { CustomersListPage } from './pages/customers/CustomersList';
import { CustomerDetailPage } from './pages/customers/CustomerDetail';
import { POSPage } from './pages/pos/POS';
import { InvoicesListPage } from './pages/invoices/InvoicesList';
import { InvoiceDetailPage } from './pages/invoices/InvoiceDetail';
import { InvoicesReturnsHubPage } from './pages/invoicesReturns/InvoicesReturnsHub';
import { ChequesPage } from './pages/invoicesReturns/ChequesPage';
import { CashDrawerPage } from './pages/cash/CashDrawer';
import { BanksPage } from './pages/cash/Banks';
import { ExpensesPage } from './pages/cash/Expenses';
import { CashReconcilePage } from './pages/cash/CashReconcile';
import { TreasuryHubPage } from './pages/treasury/TreasuryHub';
import { TreasuriesOverviewPage } from './pages/treasury/TreasuriesOverview';
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

/* Chart-heavy report routes are lazy-loaded so Recharts is only fetched
 * when the user navigates into Reports. Saves ~250kb gzipped from the
 * initial bundle for everyone who never opens a sub-report. */
const DailyReportPage = lazy(() =>
  import('./pages/reports/DailyReport').then((m) => ({ default: m.DailyReportPage })),
);
const SecondaryReportPage = lazy(() =>
  import('./pages/reports/SecondaryReport').then((m) => ({ default: m.SecondaryReportPage })),
);

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

                <Route path="/inventory" element={<InventoryHubPage />} />
                <Route path="/inventory/stock" element={<StockViewPage />} />
                <Route path="/codes" element={<CodesPage />} />
                <Route path="/inventory/stock-movements" element={<StockMovementsPage />} />
                <Route path="/inventory/stocktake" element={<StocktakePage />} />
                <Route path="/inventory/adjustments" element={<AdjustmentsPage />} />
                <Route path="/inventory/damage" element={<DamagePage />} />

                <Route path="/shipments" element={<ShipmentsHubPage />} />
                <Route path="/shipments/all" element={<ShipmentsListPage />} />
                <Route path="/shipments/create" element={<CreateShipmentPage />} />
                <Route
                  path="/shipments/pending"
                  element={<ShipmentsListPage defaultStatus="pending_approval" />}
                />
                <Route path="/shipments/:id/continue" element={<CreateShipmentPage />} />
                <Route path="/shipments/:id" element={<ReviewShipmentPage />} />

                <Route path="/customers" element={<CustomersListPage />} />
                <Route path="/customers/:id" element={<CustomerDetailPage />} />

                <Route path="/pos" element={<POSPage />} />

                <Route path="/invoices-returns" element={<InvoicesReturnsHubPage />} />
                <Route path="/invoices" element={<InvoicesListPage />} />
                <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
                <Route path="/returns" element={<ReturnsListPage />} />
                <Route path="/returns/:id" element={<ReturnDetailPage />} />
                <Route path="/cheques" element={<ChequesPage />} />

                <Route path="/treasury" element={<TreasuryHubPage />} />
                <Route path="/treasury/overview" element={<TreasuriesOverviewPage />} />
                <Route path="/cash" element={<CashDrawerPage />} />
                <Route path="/banks" element={<BanksPage />} />
                <Route path="/expenses" element={<ExpensesPage />} />
                <Route path="/reconcile" element={<CashReconcilePage />} />

                <Route path="/notifications" element={<NotificationsPage />} />

                <Route path="/reports" element={<ReportsHubPage />} />
                <Route path="/reports/daily" element={<DailyReportPage />} />
                <Route path="/reports/secondary/:reportKey" element={<SecondaryReportPage />} />

                <Route path="/hr" element={<HrHubPage />} />
                <Route path="/hr/employees" element={<EmployeesPage />} />
                <Route path="/hr/salaries" element={<SalariesPage />} />
                <Route path="/hr/adjustments" element={<HrAdjustmentsPage />} />

                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
              </Suspense>
            </AppShell>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
