import { act, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Navigate, Route, Routes, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { BackLink } from '../src/components/BackLink';
import { resetNavigationHistory, useNavigationTracker } from '../src/lib/navigation-history';

let nav: NavigateFunction;

function Where() {
  const loc = useLocation();
  nav = useNavigate();
  return <div data-testid="where">{`${loc.pathname}${loc.search}`}</div>;
}

function Harness({ initialEntries }: { initialEntries: string[] }) {
  return (
    <MemoryRouter initialEntries={initialEntries} initialIndex={initialEntries.length - 1}>
      <Tracked />
    </MemoryRouter>
  );
}

function Tracked() {
  useNavigationTracker();
  return (
    <>
      <Where />
      <Routes>
        <Route path="/login" element={<Link to="/">home</Link>} />
        <Route path="/" element={<Link to="/invoices?page=3&status=open">invoices</Link>} />
        <Route path="/invoices" element={<><BackLink fallback="/invoices-returns" /><Link to="/invoices/42">inv</Link></>} />
        <Route path="/invoices/:id" element={<><BackLink fallback="/invoices" /><Link to="/customers/7">cust</Link></>} />
        <Route path="/customers/:id" element={<BackLink fallback="/customers" />} />
        <Route path="/customers" element={<BackLink fallback="/" />} />
        <Route path="/invoices-returns" element={<span>hub</span>} />
        <Route path="/old" element={<Navigate to="/customers/7" replace />} />
      </Routes>
    </>
  );
}

const where = () => screen.getByTestId('where').textContent;
const back = () => fireEvent.click(screen.getByText('رجوع'));

describe('history-aware Back', () => {
  beforeEach(() => resetNavigationHistory());

  it('returns to the real previous page with its query string (Invoices → Invoice → Customer → Back → Back)', () => {
    render(<Harness initialEntries={['/']} />);
    fireEvent.click(screen.getByText('invoices'));
    fireEvent.click(screen.getByText('inv'));
    fireEvent.click(screen.getByText('cust'));
    expect(where()).toBe('/customers/7');
    expect(screen.getByText('رجوع').closest('a')).toHaveAttribute('href', '/invoices/42');

    back();
    expect(where()).toBe('/invoices/42');
    back();
    expect(where()).toBe('/invoices?page=3&status=open');
  });

  it('browser Forward still works after in-app Back', () => {
    render(<Harness initialEntries={['/']} />);
    fireEvent.click(screen.getByText('invoices'));
    fireEvent.click(screen.getByText('inv'));
    back();
    expect(where()).toBe('/invoices?page=3&status=open');
    act(() => nav(1));
    expect(where()).toBe('/invoices/42');
    back();
    expect(where()).toBe('/invoices?page=3&status=open');
  });

  it('direct URL entry falls back to the parent route and walks up without looping', () => {
    render(<Harness initialEntries={['/customers/7']} />);
    expect(screen.getByText('رجوع').closest('a')).toHaveAttribute('href', '/customers');
    back();
    expect(where()).toBe('/customers');
    // Fallback replaced the entry, so /customers has no predecessor → goes up, not back to /customers/7.
    back();
    expect(where()).toBe('/');
  });

  it('a redirect (REPLACE) keeps the original predecessor', () => {
    render(<Harness initialEntries={['/']} />);
    fireEvent.click(screen.getByText('invoices'));
    act(() => nav('/old'));
    expect(where()).toBe('/customers/7');
    back();
    expect(where()).toBe('/invoices?page=3&status=open');
  });

  it('never goes Back into the login page', () => {
    render(<Harness initialEntries={['/login']} />);
    act(() => nav('/customers'));
    back();
    expect(where()).toBe('/');
  });
});
