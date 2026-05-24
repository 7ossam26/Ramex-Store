import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DraftInvoiceDocument,
  type DraftInvoiceDocumentProps,
} from '../src/components/invoices/DraftInvoiceDocument';

const labels = {
  name: 'اسم العميل',
  customerCode: 'كود العميل',
  phone: 'رقم الهاتف',
};

function makeInvoiceProps(overrides: Partial<DraftInvoiceDocumentProps> = {}): DraftInvoiceDocumentProps {
  return {
    shopName: 'RMX',
    customerName: 'Ahmed',
    phone: '01012345678',
    totalBolts: 1,
    totalQuantity: 2.5,
    customerCode: 'C-000012',
    lines: [],
    subtotal: 0,
    rounding: 0,
    total: 0,
    ...overrides,
  };
}

describe('DraftInvoiceDocument', () => {
  function renderDocument(props: DraftInvoiceDocumentProps): Document {
    const html = renderToStaticMarkup(<DraftInvoiceDocument {...props} />);
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = html;
    return doc;
  }

  it('keeps RMX as the dominant header brand', () => {
    const doc = renderDocument(makeInvoiceProps());
    const brand = Array.from(doc.querySelectorAll('.rmx-draft-brand')).find(
      (node) => node.textContent === 'RMX',
    );
    expect(brand).toBeTruthy();
  });

  it('renders header band with only the RMX brand — no country tag or extra text', () => {
    const doc = renderDocument(makeInvoiceProps());

    const header = doc.querySelector('.rmx-draft-header');
    expect(header).toBeTruthy();
    expect(header!.textContent!.trim()).toBe('RMX');
    expect(doc.querySelector('.rmx-draft-country')).toBeNull();
  });

  it('renders customer fields stacked with label above value (no colon)', () => {
    const doc = renderDocument(makeInvoiceProps());

    const block = doc.querySelector('.rmx-draft-cust-block');
    expect(block).toBeTruthy();
    expect(block!.textContent).toContain(labels.name);
    expect(block!.textContent).toContain('Ahmed');
    expect(block!.textContent).toContain(labels.customerCode);
    expect(block!.textContent).toContain('C-000012');

    // No colon-formatted row should remain
    expect(block!.textContent).not.toContain(`${labels.name}:`);
    expect(block!.textContent).not.toContain(`${labels.customerCode}:`);
  });

  it('renders phone inside the info grid, not the customer block', () => {
    const doc = renderDocument(makeInvoiceProps());

    const grid = doc.querySelector('.rmx-draft-info-grid');
    expect(grid).toBeTruthy();
    expect(grid!.textContent).toContain(labels.phone);
    expect(grid!.textContent).toContain('01012345678');

    const block = doc.querySelector('.rmx-draft-cust-block');
    expect(block!.textContent).not.toContain('01012345678');
  });
});
