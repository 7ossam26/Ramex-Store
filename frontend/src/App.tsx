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
              </Routes>
            </AppShell>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
