// Regression: pages / cards were offered to roles the SERVER refuses, and two report
// pages rendered nothing at all when their API call failed.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AxiosError, AxiosHeaders } from 'axios';

const { perms, reportsApi } = vi.hoisted(() => ({
  perms: new Set<string>(),
  reportsApi: { getGeneral: vi.fn(), getDaily: vi.fn() },
}));
vi.mock('@/lib/permissions', () => ({
  usePermissions: () => ({
    can: (r: string, a = 'read') => perms.has(`${r}.${a}`),
    canSee: (r: string) => perms.has(`${r}.read`),
    loading: false,
  }),
}));
vi.mock('@/lib/reports-api', () => ({ reportsApi }));

import { ReportsHubPage } from '@/pages/reports/ReportsHub';
import { GeneralReportPage } from '@/pages/reports/GeneralReport';
import { visibleSettingsSections } from '@/navigation/settings.config';
import { visibleNav } from '@/navigation/nav.config';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  perms.clear();
  vi.clearAllMocks();
  // Node 25 ships a non-functional global localStorage that shadows jsdom's; give this file a working one.
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
});

describe('reports hub', () => {
  it('shows only the reports the server lets this role open', () => {
    perms.add('reports.daily.read').add('reports.stockByWarehouse.read'); // e.g. the shop
    wrap(<ReportsHubPage />);
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links).toContain('/reports/daily');
    expect(links).toContain('/reports/secondary/stockByWarehouse');
    expect(links).not.toContain('/reports/general');           // needs reports.general
    expect(links).not.toContain('/reports/secondary/auditLog'); // needs reports.auditLog
  });
});

describe('general report', () => {
  it('shows an error with retry instead of an empty page when the API refuses', async () => {
    reportsApi.getGeneral.mockRejectedValue(new AxiosError('Forbidden', '403', undefined, undefined, {
      status: 403, statusText: 'Forbidden', headers: {}, config: { headers: new AxiosHeaders() }, data: { error: 'forbidden' },
    }));
    wrap(<GeneralReportPage />);
    expect(await screen.findByText('تعذر تحميل التقرير')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /إعادة المحاولة/ })).toBeInTheDocument();
  });
});

describe('settings sections', () => {
  it('owner is not offered the sections backed by the super-admin-only /api/settings', () => {
    const ids = visibleSettingsSections('owner').map((s) => s.id);
    expect(ids).not.toContain('general');
    expect(ids).not.toContain('reasonCodes');
    expect(ids).toContain('fabricCodes');
    expect(visibleSettingsSections('super_admin').map((s) => s.id)).toEqual(
      expect.arrayContaining(['general', 'reasonCodes', 'fabricCodes', 'usersPermissions', 'system']),
    );
  });
});

describe('sidebar', () => {
  const routes = (role: Parameters<typeof visibleNav>[0], allowed: string[]) =>
    visibleNav(role, (r) => allowed.includes(r)).flatMap((s) => [s.route, ...(s.children ?? []).flatMap((g) => g.items.map((i) => i.route))]);

  it('the treasury overview (cash_drawer.approve on the server) is not offered to the shop', () => {
    expect(routes('shop_seller', ['cash_drawer'])).not.toContain('/treasury/overview');
    expect(routes('owner', ['cash_drawer'])).toContain('/treasury/overview');
  });

  it('report links use each report\'s own permission', () => {
    const shop = routes('shop_seller', ['reports.daily', 'reports.stockByWarehouse']);
    expect(shop).toContain('/reports/daily');
    expect(shop).toContain('/reports/secondary/stockByWarehouse');
    expect(shop).not.toContain('/reports/general');
    expect(shop).not.toContain('/reports/secondary/agingInventory');
  });
});
