// Regression: /shipments/create (and the review page) used to stay on «جاري التحميل...»
// forever when the initial API call failed — e.g. a 500 because the database was
// missing a migration. They must show an error with a retry instead, and recover.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AxiosError, AxiosHeaders } from 'axios';

const { invApi } = vi.hoisted(() => ({
  invApi: {
    listShipments: vi.fn(),
    getShipment: vi.fn(),
    listFabrics: vi.fn(async () => []),
    listColors: vi.fn(async () => []),
    listFactoryRolls: vi.fn(async () => []),
    createShipmentDraft: vi.fn(),
  },
}));
vi.mock('@/lib/inventory-api', () => ({ inventoryApi: invApi }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 1, role: 'owner', username: 'o', full_name_ar: 'o' }, loading: false }) }));
vi.mock('@/lib/permissions', () => ({ usePermissions: () => ({ can: () => true, canSee: () => true, loading: false }) }));

import { CreateShipmentPage } from '@/pages/shipments/CreateShipment';
import { ReviewShipmentPage } from '@/pages/shipments/ReviewShipment';

function serverError(message: string) {
  return new AxiosError('Request failed with status code 500', '500', undefined, undefined, {
    status: 500, statusText: 'Internal Server Error', headers: {}, config: { headers: new AxiosHeaders() },
    data: { error: 'internal', message },
  });
}

function renderAt(path: string, pattern: string, element: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={pattern} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('/shipments/create — initial load failure', () => {
  it('shows an error with a retry instead of loading forever, and recovers on retry', async () => {
    invApi.listShipments
      .mockRejectedValueOnce(serverError('relation "stock_requests" does not exist'))
      .mockResolvedValueOnce([]);
    renderAt('/shipments/create', '/shipments/create', <CreateShipmentPage />);

    expect(await screen.findByText('تعذر تحميل صفحة إنشاء الطلبية')).toBeInTheDocument();
    expect(screen.getByText(/does not exist/)).toBeInTheDocument();
    expect(screen.queryByText('جاري التحميل...')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /إعادة المحاولة/ }));
    expect(await screen.findByRole('button', { name: 'إنشاء طلبية' })).toBeInTheDocument();
    expect(invApi.listShipments).toHaveBeenCalledTimes(2);
  });

  it('a failing /shipments/:id/continue lookup also ends in the error state', async () => {
    invApi.getShipment.mockRejectedValueOnce(serverError('boom'));
    renderAt('/shipments/7/continue', '/shipments/:id/continue', <CreateShipmentPage />);
    expect(await screen.findByText('تعذر تحميل صفحة إنشاء الطلبية')).toBeInTheDocument();
    expect(invApi.listShipments).not.toHaveBeenCalled();
  });

  it('still offers to create a draft when everything loads (unchanged happy path)', async () => {
    invApi.listShipments.mockResolvedValueOnce([]);
    renderAt('/shipments/create', '/shipments/create', <CreateShipmentPage />);
    expect(await screen.findByRole('button', { name: 'إنشاء طلبية' })).toBeInTheDocument();
  });
});

describe('/shipments/:id (review) — load failure', () => {
  it('shows an error with a retry instead of loading forever', async () => {
    invApi.getShipment.mockRejectedValue(serverError('relation "stock_requests" does not exist'));
    renderAt('/shipments/3', '/shipments/:id', <ReviewShipmentPage />);
    expect(await screen.findByText('تعذر تحميل الطلبية')).toBeInTheDocument();
    expect(screen.queryByText('جاري التحميل...')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /إعادة المحاولة/ }));
    await waitFor(() => expect(invApi.getShipment.mock.calls.length).toBeGreaterThanOrEqual(2));
  });
});
