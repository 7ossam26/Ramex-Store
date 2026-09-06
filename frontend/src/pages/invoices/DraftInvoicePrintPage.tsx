import { useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { salesApi } from '@/lib/sales-api';
import type { InvoiceDetail, InvoiceLineDetail } from '@/lib/sales-types';
import { invoiceLineQuantity } from '@/lib/invoice-line-quantity';
import {
  DraftInvoiceDocument,
  demoDraftInvoice,
  type DraftInvoiceDocumentProps,
  type DraftInvoiceLine,
} from '@/components/invoices/DraftInvoiceDocument';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/Skeleton';
import { ErrorBanner } from '@/components/ErrorBanner';

export function mapLineToDraft(l: InvoiceLineDetail): DraftInvoiceLine {
  if (l.item_type === 'accessory') {
    const qty = Number(l.qty_pieces ?? 0);
    const perUnit =
      l.final_price_per_unit != null
        ? Number(l.final_price_per_unit)
        : qty > 0
          ? Number(l.selling_price_egp) / qty
          : 0;
    return {
      description: l.accessory_name_ar ?? l.internal_barcode,
      bolts: 0,
      quantity: qty,
      quantityUnit: 'قطعة',
      unitPrice: perUnit,
      discountPct: 0,
      amount: Number(l.line_total_egp),
    };
  }

  const saleQuantity = invoiceLineQuantity(l);
  const qty = saleQuantity.quantity;
  const perUnit =
    l.final_price_per_unit != null
      ? Number(l.final_price_per_unit)
      : qty > 0
        ? Number(l.selling_price_egp) / qty
        : 0;
  return {
    description: `${l.fabric_name_ar} / ${l.color_name_ar}`,
    bolts: 1,
    quantity: qty,
    quantityUnit: saleQuantity.unit === 'meter' ? 'متر' : 'كجم',
    unitPrice: perUnit,
    discountPct: 0,
    amount: Number(l.line_total_egp),
  };
}

export function mapInvoiceToDraft(inv: InvoiceDetail): DraftInvoiceDocumentProps {
  const totalQty = inv.lines.reduce(
    (sum, l) => sum + (l.item_type === 'roll' ? invoiceLineQuantity(l).quantity : 0),
    0,
  );
  return {
    shopName: 'RMX',
    customerName: inv.customer_name_ar,
    phone: inv.customer_phone,
    totalBolts: inv.lines.filter((l) => l.item_type === 'roll').length,
    totalQuantity: totalQty,
    customerCode: inv.customer_code,
    lines: inv.lines.map(mapLineToDraft),
    issuedAt: inv.created_at,
    invoiceNo: inv.invoice_no,
    subtotal: Number(inv.subtotal_egp),
    rounding: Number(inv.rounding_egp),
    total: Number(inv.total_egp),
    ...(inv.status === 'open' && {
      invoiceType: 'open' as const,
      depositPaid: Number(inv.paid_egp),
      balance: Number(inv.balance_egp),
    }),
  };
}

export function DraftInvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const isPreview = params.get('preview') === '1';
  const variant = params.get('variant');
  const isReprint = variant === 'reprint';
  const idNum = Number(id);
  const auditFired = useRef(false);

  const invoiceQ = useQuery<InvoiceDetail>({
    queryKey: ['invoice', idNum],
    queryFn: () => salesApi.get(idNum),
    enabled: !isPreview,
  });

  const auditMut = useMutation({
    mutationFn: () => salesApi.auditReprint(idNum),
  });

  /* Fire reprint audit exactly once after the invoice loads. */
  useEffect(() => {
    if (!isReprint || isPreview || !invoiceQ.data || auditFired.current) return;
    auditFired.current = true;
    auditMut.mutate();
  }, [isReprint, isPreview, invoiceQ.data]);

  const docProps: DraftInvoiceDocumentProps | null = isPreview
    ? demoDraftInvoice
    : invoiceQ.data
      ? mapInvoiceToDraft(invoiceQ.data)
      : null;

  return (
    <div className="rmx-draft-doc-route">
      {/* Screen-only toolbar — hidden in print via CSS */}
      <div
        className="rmx-draft-doc-toolbar"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          display: 'flex',
          gap: '8px',
          padding: '8px 16px',
          background: '#374151',
          width: '210mm',
          boxSizing: 'border-box',
          alignItems: 'center',
        }}
        data-print="hide"
      >
        <Button
          size="sm"
          variant="outline"
          style={{ color: '#fff', borderColor: '#9ca3af', backgroundColor: 'transparent' }}
          onClick={() => window.print()}
        >
          طباعة
        </Button>
        <Button
          size="sm"
          variant="outline"
          style={{ color: '#fff', borderColor: '#9ca3af', backgroundColor: 'transparent' }}
          onClick={() => window.history.length <= 1 ? window.close() : navigate(-1)}
        >
          رجوع
        </Button>
        {isPreview && (
          <span style={{ color: '#9ca3af', fontSize: '12px' }}>
            معاينة — بيانات تجريبية
          </span>
        )}
        {isReprint && !isPreview && (
          <span style={{ color: '#fbbf24', fontSize: '12px' }}>
            نسخة طبق الأصل
          </span>
        )}
      </div>

      {/* Loading state */}
      {!isPreview && invoiceQ.isLoading && (
        <div
          style={{
            width: '210mm',
            padding: '15mm',
            background: '#fff',
            marginBlock: '8px',
            boxShadow: '0 4px 24px rgba(0,0,0,.12)',
          }}
        >
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {/* Error state */}
      {!isPreview && invoiceQ.isError && (
        <div style={{ width: '210mm', marginBlock: '8px' }}>
          <ErrorBanner
            title="تعذر تحميل الفاتورة"
            onRetry={() => invoiceQ.refetch()}
          />
        </div>
      )}

      {/* Invoice document */}
      {docProps && <DraftInvoiceDocument {...docProps} />}
    </div>
  );
}
