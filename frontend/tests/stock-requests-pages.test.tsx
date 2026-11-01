// طلبات الأتواب — the factory prepare screen (scanner feedback, unavailable with a
// mandatory reason, counter) and the request detail (history, replacement / retry,
// role-dependent actions).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AxiosError, AxiosHeaders } from 'axios';
import type { StockRequestDetail, StockRequestItem } from '@/lib/stock-requests-types';

const { perms, srApi, invApi } = vi.hoisted(() => ({
  perms: new Set<string>(),
  srApi: {
    get: vi.fn(),
    openDraft: vi.fn(),
    markUnavailable: vi.fn(),
    addItems: vi.fn(),
    cancelItem: vi.fn(),
    cancel: vi.fn(),
    availableRolls: vi.fn(async () => []),
  },
  invApi: {
    addShipmentRollByBarcode: vi.fn(),
    removeShipmentLine: vi.fn(),
    submitShipment: vi.fn(),
    listFabrics: vi.fn(async () => []),
    listColors: vi.fn(async () => []),
  },
}));

vi.mock('@/lib/permissions', () => ({
  usePermissions: () => ({
    can: (resource: string, action = 'read') => perms.has(`${resource}.${action}`),
    canSee: () => true,
    loading: false,
  }),
}));

vi.mock('@/lib/stock-requests-api', () => ({ stockRequestsApi: srApi }));

vi.mock('@/lib/inventory-api', () => ({ inventoryApi: invApi }));

import { PrepareStockRequestPage } from '@/pages/stockRequests/PrepareStockRequest';
import { StockRequestDetailPage } from '@/pages/stockRequests/StockRequestDetail';

function item(p: Partial<StockRequestItem>): StockRequestItem {
  return {
    id: 1, status: 'requested', outcome: 'waiting', roll_id: 100, internal_barcode: 'RMX-R-000100', external_barcode: null,
    fabric_id: 1, fabric_name_ar: 'قطن', fabric_unit: 'kg', color_name_ar: 'أحمر', color_code: 'R',
    weight_kg: '10.000', length_m: null, roll_status: 'in_stock', roll_warehouse: 'factory', live_available: true,
    shipment_id: null, shipment_no: null, shipment_status: null, line_id: null, line_status: null, reject_reason_ar: null,
    replaces_item_id: null, replaced_by_item_id: null, unavailable_reason_ar: null, unavailable_at: null,
    unavailable_by_user_id: null, unavailable_by_name: null, auto_unavailable: false, can_replace: false,
    created_at: '2026-11-01T10:00:00Z', events: [],
    ...p,
  };
}

function detail(p: Partial<StockRequestDetail>): StockRequestDetail {
  const items = p.items ?? [];
  return {
    id: 5, request_no: 'REQ-2026-000005', status: 'in_progress', requested_by_user_id: 2, requested_by_name: 'زياد',
    notes_ar: null, cancelled_at: null, cancel_reason_ar: null, created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z',
    counts: { total: items.length, requested: 0, packing: 0, dispatched: 0, unavailable: 0, cancelled: 0, awaiting_review: 0, accepted: 0, rejected: 0 },
    draft_shipment: null, shipments: [], items,
    ...p,
  };
}

function apiError(message: string, error = 'ROLL_NOT_IN_REQUEST') {
  return new AxiosError(message, '409', undefined, undefined, {
    status: 409, statusText: 'Conflict', headers: {}, config: { headers: new AxiosHeaders() }, data: { error, message },
  });
}

function renderAt(path: string, element: React.ReactNode, pattern: string) {
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

function scanInto(barcode: string) {
  const input = screen.getByPlaceholderText('امسح باركود التوب');
  fireEvent.change(input, { target: { value: barcode } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

beforeEach(() => {
  vi.clearAllMocks();
  perms.clear();
});

// ---------------------------------------------------------------------------------------
describe('factory — prepare a request', () => {
  const draft = { id: 77, shipment_no: 'SHP-2026-000010', status: 'draft' as const, created_by_user_id: 3, submitted_at: null, reviewed_at: null, line_count: 1, accepted_count: 0, rejected_count: 0, pending_count: 1 };
  const prepared = detail({
    draft_shipment: draft,
    items: [
      item({ id: 1, status: 'packing', outcome: 'packing', shipment_id: 77, line_id: 900, internal_barcode: 'RMX-R-000001' }),
      item({ id: 2, roll_id: 102, internal_barcode: 'RMX-R-000002' }),
      item({ id: 3, roll_id: 103, internal_barcode: 'RMX-R-000003' }),
    ],
  });

  it('shows how many tops are in this shipment and how many remain', async () => {
    srApi.get.mockResolvedValue(prepared);
    renderAt('/stock-requests/5/prepare', <PrepareStockRequestPage />, '/stock-requests/:id/prepare');
    expect(await screen.findByTestId('prepare-counter')).toHaveTextContent('في الشحنة الحالية 1 — متبقي 2');
  });

  it('a scanned top that was not requested is refused with a clear message', async () => {
    srApi.get.mockResolvedValue(prepared);
    invApi.addShipmentRollByBarcode.mockRejectedValue(apiError('هذا التوب غير مطلوب في هذا الطلب — لا يمكن إضافته للشحنة'));
    renderAt('/stock-requests/5/prepare', <PrepareStockRequestPage />, '/stock-requests/:id/prepare');
    await screen.findByTestId('prepare-counter');

    scanInto('RMX-R-999999');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('غير مطلوب');
    expect(alert).toHaveTextContent('RMX-R-999999');
    expect(invApi.addShipmentRollByBarcode).toHaveBeenCalledWith(77, 'RMX-R-999999');
  });

  it('a requested top is scanned onto the open draft of the request', async () => {
    srApi.get.mockResolvedValue(prepared);
    invApi.addShipmentRollByBarcode.mockResolvedValue({});
    renderAt('/stock-requests/5/prepare', <PrepareStockRequestPage />, '/stock-requests/:id/prepare');
    await screen.findByTestId('prepare-counter');

    scanInto('RMX-R-000002');
    await waitFor(() => expect(invApi.addShipmentRollByBarcode).toHaveBeenCalledWith(77, 'RMX-R-000002'));
    expect(await screen.findByText('✓ RMX-R-000002')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('marking a top unavailable requires a reason', async () => {
    srApi.get.mockResolvedValue(prepared);
    srApi.markUnavailable.mockResolvedValue(prepared);
    renderAt('/stock-requests/5/prepare', <PrepareStockRequestPage />, '/stock-requests/:id/prepare');
    const row = await screen.findByTestId('prep-item-2');
    fireEvent.click(within(row).getByRole('button', { name: 'غير متوفر' }));

    fireEvent.click(await screen.findByRole('button', { name: 'تأكيد' }));
    expect(await screen.findByText('السبب مطلوب')).toBeInTheDocument();
    expect(srApi.markUnavailable).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('السبب'), { target: { value: 'مكسور من الطرف' } });
    fireEvent.click(screen.getByRole('button', { name: 'تأكيد' }));
    await waitFor(() => expect(srApi.markUnavailable).toHaveBeenCalledWith(5, 2, 'مكسور من الطرف'));
  });

  it('without an open draft the factory starts one; nothing can be scanned before', async () => {
    srApi.get.mockResolvedValue(detail({ items: [item({ id: 2 })] }));
    srApi.openDraft.mockResolvedValue({ id: 77 });
    renderAt('/stock-requests/5/prepare', <PrepareStockRequestPage />, '/stock-requests/:id/prepare');
    fireEvent.click(await screen.findByRole('button', { name: 'بدء تجهيز شحنة' }));
    await waitFor(() => expect(srApi.openDraft).toHaveBeenCalledWith(5));
    expect(screen.queryByPlaceholderText('امسح باركود التوب')).not.toBeInTheDocument();
  });

  it('the send button stays disabled while nothing is scanned', async () => {
    srApi.get.mockResolvedValue(detail({ draft_shipment: draft, items: [item({ id: 2 })] }));
    renderAt('/stock-requests/5/prepare', <PrepareStockRequestPage />, '/stock-requests/:id/prepare');
    expect(await screen.findByRole('button', { name: 'إرسال الشحنة للمحل' })).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------------------
describe('request detail — history and replacements', () => {
  const full = detail({
    items: [
      item({ id: 1, status: 'dispatched', outcome: 'accepted', shipment_id: 70, shipment_no: 'SHP-2026-000001', roll_warehouse: 'shop' }),
      item({
        id: 2, roll_id: 102, internal_barcode: 'RMX-R-000002', status: 'dispatched', outcome: 'rejected', shipment_id: 70,
        shipment_no: 'SHP-2026-000001', reject_reason_ar: 'عيب في النسيج', can_replace: true,
        events: [
          { id: 11, event_type: 'requested', from_status: null, to_status: 'requested', actor_user_id: 2, actor_name: 'زياد', note_ar: null, shipment_id: null, created_at: '2026-11-01T10:00:00Z' },
          { id: 12, event_type: 'packed', from_status: 'requested', to_status: 'packing', actor_user_id: 3, actor_name: 'أحمد', note_ar: null, shipment_id: 70, created_at: '2026-11-01T11:00:00Z' },
          { id: 13, event_type: 'line_rejected', from_status: 'dispatched', to_status: 'dispatched', actor_user_id: 2, actor_name: 'زياد', note_ar: 'عيب في النسيج', shipment_id: 70, created_at: '2026-11-01T12:00:00Z' },
        ],
      }),
      item({ id: 3, roll_id: 103, internal_barcode: 'RMX-R-000003', status: 'unavailable', outcome: 'unavailable', unavailable_reason_ar: 'مكسور', unavailable_by_name: 'أحمد', unavailable_by_user_id: 3, can_replace: true }),
      item({ id: 4, roll_id: 104, internal_barcode: 'RMX-R-000004' }),
    ],
  });

  it('the shop sees every item with its reason and can ask for a replacement or a retry', async () => {
    perms.add('stock_requests.read').add('stock_requests.write');
    srApi.get.mockResolvedValue(full);
    srApi.addItems.mockResolvedValue(full);
    renderAt('/stock-requests/5', <StockRequestDetailPage />, '/stock-requests/:id');

    const rejected = await screen.findByTestId('item-2');
    expect(within(rejected).getByText('مرفوض')).toBeInTheDocument();
    expect(within(rejected).getByText(/عيب في النسيج/)).toBeInTheDocument();
    expect(within(screen.getByTestId('item-3')).getByText(/مكسور — أحمد/)).toBeInTheDocument();

    // replacement offered only where it makes sense
    expect(within(screen.getByTestId('item-1')).queryByRole('button', { name: /طلب بديل/ })).not.toBeInTheDocument();
    expect(within(rejected).getByRole('button', { name: /طلب بديل/ })).toBeInTheDocument();
    expect(within(screen.getByTestId('item-3')).getByRole('button', { name: /طلب بديل/ })).toBeInTheDocument();
    // a waiting item can be cancelled, a decided one cannot
    expect(within(screen.getByTestId('item-4')).getByRole('button', { name: 'إلغاء البند' })).toBeInTheDocument();
    expect(within(rejected).queryByRole('button', { name: 'إلغاء البند' })).not.toBeInTheDocument();

    fireEvent.click(within(rejected).getByRole('button', { name: /إعادة طلب نفس التوب/ }));
    await waitFor(() => expect(srApi.addItems).toHaveBeenCalledWith(5, { roll_ids: [102], replaces_item_id: 2 }));
  });

  it('the history of an item is shown on demand', async () => {
    perms.add('stock_requests.read');
    srApi.get.mockResolvedValue(full);
    renderAt('/stock-requests/5', <StockRequestDetailPage />, '/stock-requests/:id');
    const rejected = await screen.findByTestId('item-2');
    expect(within(rejected).queryByText('رفضه المحل')).not.toBeInTheDocument();
    fireEvent.click(within(rejected).getByRole('button', { name: 'السجل' }));
    expect(within(rejected).getByText('تم الطلب')).toBeInTheDocument();
    expect(within(rejected).getByText('تم المسح في الشحنة')).toBeInTheDocument();
    expect(within(rejected).getByText('رفضه المحل')).toBeInTheDocument();
  });

  it('a read-only user (e.g. the accountant) gets no actions', async () => {
    perms.add('stock_requests.read');
    srApi.get.mockResolvedValue(full);
    renderAt('/stock-requests/5', <StockRequestDetailPage />, '/stock-requests/:id');
    await screen.findByTestId('item-2');
    expect(screen.queryByRole('button', { name: /طلب بديل/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'إلغاء البند' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /إلغاء الطلب/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /تجهيز الطلب/ })).not.toBeInTheDocument();
  });

  it('the factory sees the prepare action but not the shop actions', async () => {
    perms.add('stock_requests.read').add('stock_request_fulfilment.write');
    srApi.get.mockResolvedValue(full);
    renderAt('/stock-requests/5', <StockRequestDetailPage />, '/stock-requests/:id');
    await screen.findByTestId('item-2');
    expect(screen.getByRole('button', { name: /تجهيز الطلب/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /طلب بديل/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /إلغاء الطلب/ })).not.toBeInTheDocument();
  });
});
