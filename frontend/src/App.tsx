import { Routes, Route } from 'react-router-dom';
import { LoginPage } from './pages/Login';
import { HomePage } from './pages/Home';
import { AppShell } from './components/Layout/AppShell';
import { ProtectedRoute } from './components/ProtectedRoute';

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
              </Routes>
            </AppShell>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
