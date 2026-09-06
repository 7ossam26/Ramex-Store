import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvoiceDetail } from '../src/lib/sales-types';
import { InvoiceDetailPage } from '../src/pages/invoices/InvoiceDetail';

const apiMocks = vi.hoisted(() => ({
  getInvoice: vi.fn(),
  getStatusHistory: vi.fn(),
  getBankAccounts: vi.fn(),
}));

vi.mock('../src/lib/sales-api', () => ({
  salesApi: {
    get: apiMocks.getInvoice,
    statusHistory: apiMocks.getStatusHistory,
    bankAccounts: apiMocks.getBankAccounts,
  },
}));

vi.mock('../src/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 1, role: 'shop_seller', username: 'seller' },
  }),
}));

function line(
  id: number,
  itemType: 'roll' | 'accessory',
  quantity: number,
  unitPrice: number,
  weightKg = quantity,
): InvoiceDetail['lines'][number] {
  const lineTotal = quantity * unitPrice;
  return {
    id,
    invoice_id: 42,
    item_type: itemType,
    roll_id: itemType === 'roll' ? id : null,
    accessory_id: itemType === 'accessory' ? id : null,
    qty_pieces: itemType === 'accessory' ? quantity : null,
    sold_quantity: itemType === 'roll' ? quantity.toFixed(3) : null,
    sold_unit: itemType === 'roll' ? 'meter' : null,
    selling_price_egp: lineTotal.toFixed(2),
    line_discount_egp: '0.00',
    line_total_egp: lineTotal.toFixed(2),
    final_price_per_unit: unitPrice.toFixed(2),
    fabric_name_ar: itemType === 'roll' ? `قماش ${id}` : null,
    fabric_unit: itemType === 'roll' ? 'meter' : null,
    color_name_ar: itemType === 'roll' ? 'أزرق' : null,
    color_code: itemType === 'roll' ? 'BLU' : null,
    roll_sr_no: itemType === 'roll' ? `ROLL-${id}` : null,
    weight_kg: itemType === 'roll' ? weightKg.toFixed(3) : null,
    length_m: itemType === 'roll' ? quantity.toFixed(3) : null,
    reference_price_per_unit: null,
    accessory_name_ar: itemType === 'accessory' ? `إكسسوار ${id}` : null,
    internal_barcode: `ITEM-${id}`,
  };
}

const invoice: InvoiceDetail = {
  id: 42,
  invoice_no: 'INV-2026-000042',
  customer_id: 7,
  cashier_user_id: 1,
  status: 'completed',
  fulfillment_destination: 'shop',
  subtotal_egp: '13800.00',
  cart_discount_egp: '0.00',
  final_discount_egp: '0.00',
  tax_egp: '0.00',
  rounding_egp: '0.00',
  total_egp: '13800.00',
  paid_egp: '13800.00',
  balance_egp: '0.00',
  notes_ar: null,
  created_at: '2026-09-06T10:00:00.000Z',
  closed_at: '2026-09-06T10:00:00.000Z',
  pickup_at: '2026-09-06T10:00:00.000Z',
  cancelled_at: null,
  cancelled_reason_ar: null,
  customer_name_ar: 'عميل الاختبار',
  customer_phone: '01012345678',
  customer_code: 'C-0007',
  customer_address_ar: 'القاهرة',
  cashier_username: 'seller',
  lines: [
    line(1, 'roll', 55, 180, 28),
    line(2, 'roll', 20, 250, 11.25),
    line(3, 'accessory', 120, 40),
    line(4, 'accessory', 100, 20),
    {
      ...line(5, 'accessory', 5, 45),
      selling_price_egp: '45.00',
      final_price_per_unit: null,
    },
  ],
  payments: [],
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={['/invoices/42']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('InvoiceDetailPage line-item pricing', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    apiMocks.getInvoice.mockResolvedValue(invoice);
    apiMocks.getStatusHistory.mockResolvedValue([]);
    apiMocks.getBankAccounts.mockResolvedValue([]);
  });

  it.each([
    ['قماش 1 / أزرق', '180.00', '9,900.00'],
    ['قماش 2 / أزرق', '250.00', '5,000.00'],
    ['إكسسوار 3', '40.00', '4,800.00'],
    ['إكسسوار 4', '20.00', '2,000.00'],
    ['إكسسوار 5', '45.00', '225.00'],
  ])('shows the stored unit price and line total for %s', async (item, unitPrice, total) => {
    renderPage();

    const itemCell = await screen.findByText(item);
    const row = itemCell.closest('tr');
    expect(row).not.toBeNull();
    await waitFor(() => {
      expect(within(row!).getByText(unitPrice)).toBeInTheDocument();
      expect(within(row!).getByText(total)).toBeInTheDocument();
    });
  });

  it.each([
    ['قماش 1 / أزرق', '55.000 متر'],
    ['قماش 2 / أزرق', '20.000 متر'],
    ['إكسسوار 3', '120 قطعة'],
  ])('shows the sold quantity and matching unit for %s', async (item, quantity) => {
    renderPage();

    const itemCell = await screen.findByText(item);
    const row = itemCell.closest('tr');
    expect(row).not.toBeNull();
    expect(within(row!).getByText(quantity)).toBeInTheDocument();
  });
});
