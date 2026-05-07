import { Routes, Route } from 'react-router-dom';
import { LoginPage } from './pages/Login';
import { HomePage } from './pages/Home';
import { AppShell } from './components/Layout/AppShell';
import { ProtectedRoute } from './components/ProtectedRoute';
import { CreateShipmentPage } from './pages/shipments/CreateShipment';
import { ShipmentsListPage } from './pages/shipments/ShipmentsList';
import { ReviewShipmentPage } from './pages/shipments/ReviewShipment';
import { StockMovementsPage } from './pages/inventory/StockMovements';
import { StocktakePage } from './pages/inventory/Stocktake';
import { AdjustmentsPage } from './pages/inventory/Adjustments';
import { DamagePage } from './pages/inventory/Damage';
import { CustomersListPage } from './pages/customers/CustomersList';
import { CustomerDetailPage } from './pages/customers/CustomerDetail';
import { POSPage } from './pages/pos/POS';
import { InvoicesListPage } from './pages/invoices/InvoicesList';
import { InvoiceDetailPage } from './pages/invoices/InvoiceDetail';
import { CashDrawerPage } from './pages/cash/CashDrawer';
import { BanksPage } from './pages/cash/Banks';
import { ExpensesPage } from './pages/cash/Expenses';
import { CashReconcilePage } from './pages/cash/CashReconcile';
import { ReturnsListPage } from './pages/returns/ReturnsList';
import { ReturnDetailPage } from './pages/returns/ReturnDetail';
import { LabelsPage } from './pages/items/Labels';
import { RollsPage } from './pages/items/Rolls';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppShell>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/shipments" element={<ShipmentsListPage />} />
                <Route path="/shipments/create" element={<CreateShipmentPage />} />
                <Route
                  path="/shipments/pending"
                  element={<ShipmentsListPage defaultStatus="pending_approval" />}
                />
                <Route path="/shipments/:id" element={<ReviewShipmentPage />} />
                <Route path="/inventory/stock-movements" element={<StockMovementsPage />} />
                <Route path="/inventory/stocktake" element={<StocktakePage />} />
                <Route path="/inventory/adjustments" element={<AdjustmentsPage />} />
                <Route path="/inventory/damage" element={<DamagePage />} />
                <Route path="/customers" element={<CustomersListPage />} />
                <Route path="/customers/:id" element={<CustomerDetailPage />} />
                <Route path="/pos" element={<POSPage />} />
                <Route path="/invoices" element={<InvoicesListPage />} />
                <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
                <Route path="/cash" element={<CashDrawerPage />} />
                <Route path="/banks" element={<BanksPage />} />
                <Route path="/expenses" element={<ExpensesPage />} />
                <Route path="/reconcile" element={<CashReconcilePage />} />
                <Route path="/returns" element={<ReturnsListPage />} />
                <Route path="/returns/:id" element={<ReturnDetailPage />} />
                <Route path="/items/rolls" element={<RollsPage />} />
                <Route path="/items/labels" element={<LabelsPage />} />
              </Routes>
            </AppShell>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
