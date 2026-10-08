// Inventory page: أتواب «جاري الشحن» are visible for tracking but never
// counted as available stock.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { StockSummaryRow } from '@/lib/inventory-types';

const rows: StockSummaryRow[] = [
  row({ fabric_id: 1, fabric_name_ar: 'قطن', color_id: 1, color_name_ar: 'أحمر', count_in_stock: 0, count_in_transit: 4 }),
  row({ fabric_id: 2, fabric_name_ar: 'كتان', color_id: 2, color_name_ar: 'أزرق', count_in_stock: 7, count_in_transit: 0 }),
  row({ fabric_id: 3, fabric_name_ar: 'حرير', color_id: 3, color_name_ar: 'أخضر', count_in_stock: 0, count_in_transit: 0 }),
];

function row(p: Partial<StockSummaryRow>): StockSummaryRow {
  return {
    fabric_id: 0, fabric_name_ar: '', fabric_code: 'F', color_id: 0, color_name_ar: '', color_code: 'C',
    count_in_stock: 0, count_reserved: 0, count_sold: 0, count_total: 0, count_in_transit: 0,
    weight_kg_in_stock: 0, weight_kg_in_transit: 0, avg_reference_price_per_unit: 0,
    last_reference_price_per_unit: 0, selling_price_egp: 0, min_quantity_rolls: 2,
    ...p,
  };
}

vi.mock('@/lib/inventory-api', () => ({
  inventoryApi: {
    getStockSummary: vi.fn(async () => rows),
    exportStockSummary: vi.fn(),
  },
}));
vi.mock('@/lib/accessories-api', () => ({ accessoriesApi: { list: vi.fn(async () => []) } }));
vi.mock('@/lib/permissions', () => ({ usePermissions: () => ({ can: () => true }) }));

import { StockViewPage } from '@/pages/inventory/StockView';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <StockViewPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function tableRow(name: string): HTMLElement {
  const cell = screen.getAllByText(new RegExp(name)).find((el) => el.closest('tr'));
  return cell!.closest('tr') as HTMLElement;
}

describe('Inventory page — «جاري الشحن»', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom has no matchMedia; reduced motion makes the KPI tick-up render the final value.
    window.matchMedia = ((query: string) => ({
      matches: true, media: query, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });

  it('shows the in-transit total as its own KPI', async () => {
    renderPage();
    const meta = await screen.findByText('توب في الطريق — غير متاح للبيع');
    const card = meta.closest('.rounded-lg') as HTMLElement;
    expect(within(card).getByText('جاري الشحن')).toBeInTheDocument();
    await waitFor(() => expect(card.querySelector('.text-3xl')?.textContent).toBe('4'));
  });

  it('a row with nothing available but أتواب on the way is «جاري الشحن», not «نفد»', async () => {
    renderPage();
    await screen.findAllByText(/قطن — أحمر/);
    const transit = tableRow('قطن — أحمر');
    expect(within(transit).getByText('0 توب')).toBeInTheDocument(); // available stays 0
    const pill = within(transit).getByTestId('in-transit-pill');
    expect(pill.textContent?.replace(/\s+/g, ' ').trim()).toBe('+4 جاري الشحن');
    expect(pill.closest('.bg-info-subtle')).not.toBeNull(); // info-tone StatusPill
    expect(within(tableRow('كتان — أزرق')).queryByTestId('in-transit-pill')).toBeNull();
    expect(within(transit).queryByText('نفد')).not.toBeInTheDocument();

    expect(within(tableRow('حرير — أخضر')).getByText('نفد')).toBeInTheDocument();
    expect(within(tableRow('كتان — أزرق')).getByText('7 توب')).toBeInTheDocument();
  });

  it('the «جاري الشحن» filter shows only rows with أتواب on the way', async () => {
    renderPage();
    await screen.findAllByText(/قطن — أحمر/);
    const chip = screen.getAllByRole('button').find((b) => b.textContent?.includes('جاري الشحن') && b.textContent?.includes('1'));
    fireEvent.click(chip!);
    expect(tableRow('قطن — أحمر')).toBeInTheDocument();
    expect(screen.queryAllByText(/كتان — أزرق/)).toHaveLength(0);
    expect(screen.queryAllByText(/حرير — أخضر/)).toHaveLength(0);
  });
});
