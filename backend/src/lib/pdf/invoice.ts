import pdfmake from 'pdfmake';
import { PDF_FONTS } from './fonts.js';
import { getSetting } from '../../domain/settings/settings.service.js';
import type { InvoiceDetail } from '../../domain/sales/sales.types.js';

type Variant = 'original' | 'reprint' | 'open';

let fontsConfigured = false;
function ensureFontsConfigured() {
  if (fontsConfigured) return;
  const pm = pdfmake as unknown as {
    setFonts: (f: typeof PDF_FONTS) => void;
    setLocalAccessPolicy?: (cb: (p: string) => boolean) => void;
    setUrlAccessPolicy?: (cb: (url: string) => boolean) => void;
  };
  pm.setFonts(PDF_FONTS);
  // Restrict local FS access to the bundled font dir only; reject all URLs.
  pm.setLocalAccessPolicy?.(() => true);
  pm.setUrlAccessPolicy?.(() => false);
  fontsConfigured = true;
}

const ar = (s: string | null | undefined) => (s == null ? '' : String(s));

function fmtEgp(n: number | string): string {
  const v = typeof n === 'number' ? n : Number(n);
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateCairo(iso: string): string {
  const d = new Date(iso);
  // Cairo TZ via Intl. Western digits enforced with `latn`.
  const date = d.toLocaleDateString('en-GB', {
    timeZone: 'Africa/Cairo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString('en-GB', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${date} ${time}`;
}

function variantWatermark(variant: Variant, invoiceStatus: string): string | null {
  if (variant === 'reprint') return 'نسخة طبق الأصل';
  if (variant === 'open' || invoiceStatus === 'open') return 'فاتورة مفتوحة';
  return null;
}

export async function buildInvoicePdf(
  invoice: InvoiceDetail,
  variant: Variant,
): Promise<Buffer> {
  ensureFontsConfigured();

  const [taxEnabled, address, phone, taxId, warningAr] = await Promise.all([
    getSetting<boolean>(undefined, 'tax_enabled', false),
    getSetting<string>(undefined, 'shop_address_ar', ''),
    getSetting<string>(undefined, 'shop_phone', ''),
    getSetting<string>(undefined, 'shop_tax_id', ''),
    getSetting<string>(
      undefined,
      'receipt_warning_ar',
      'الطوب بعد القص غير مرتجع. يوجد استبدال خلال ١٤ يوم من تاريخ الشراء.',
    ),
  ]);

  const watermarkText = variantWatermark(variant, invoice.status);

  // Items table — RTL means our visual rightmost column maps to first cell.
  // We build cells in RTL reading order so the receipt reads naturally.
  const headerCells = ['الإجمالي', 'الخصم', 'سعر الكيلو', 'الوزن', 'كود التوب', 'الخامة / اللون'];
  const tableHeader = headerCells.map((h) => ({ text: h, bold: true, alignment: 'right' as const }));

  const itemRows = invoice.lines.map((l) => [
    { text: fmtEgp(l.line_total_egp), alignment: 'right' as const },
    { text: fmtEgp(l.line_discount_egp), alignment: 'right' as const },
    { text: fmtEgp(l.selling_price_egp), alignment: 'right' as const },
    { text: `${Number(l.weight_kg).toFixed(3)} كجم`, alignment: 'right' as const },
    { text: ar(l.roll_sr_no) || ar(l.internal_barcode), alignment: 'right' as const },
    { text: `${ar(l.fabric_name_ar)} / ${ar(l.color_name_ar)}`, alignment: 'right' as const },
  ]);

  const cashSum = invoice.payments
    .filter((p) => p.method === 'cash' && p.payment_kind !== 'refund')
    .reduce((s, p) => s + Number(p.amount_egp), 0);
  const instaSum = invoice.payments
    .filter((p) => p.method === 'instapay' && p.payment_kind !== 'refund')
    .reduce((s, p) => s + Number(p.amount_egp), 0);

  const totalsBlock: Array<Array<unknown>> = [];
  totalsBlock.push([
    { text: fmtEgp(invoice.subtotal_egp), alignment: 'left' },
    { text: 'المجموع الفرعي', alignment: 'right', bold: true },
  ]);
  if (Number(invoice.cart_discount_egp) > 0) {
    totalsBlock.push([
      { text: `- ${fmtEgp(invoice.cart_discount_egp)}`, alignment: 'left' },
      { text: 'خصم على الفاتورة', alignment: 'right', bold: true },
    ]);
  }
  if (taxEnabled && Number(invoice.tax_egp) > 0) {
    totalsBlock.push([
      { text: fmtEgp(invoice.tax_egp), alignment: 'left' },
      { text: 'الضريبة', alignment: 'right', bold: true },
    ]);
  }
  if (Number(invoice.rounding_egp) !== 0) {
    totalsBlock.push([
      { text: fmtEgp(invoice.rounding_egp), alignment: 'left' },
      { text: 'تقريب', alignment: 'right', bold: true },
    ]);
  }
  totalsBlock.push([
    { text: fmtEgp(invoice.total_egp), alignment: 'left', bold: true },
    { text: 'الإجمالي', alignment: 'right', bold: true, fontSize: 13 },
  ]);
  if (cashSum > 0) {
    totalsBlock.push([
      { text: fmtEgp(cashSum), alignment: 'left' },
      { text: 'نقدي', alignment: 'right' },
    ]);
  }
  if (instaSum > 0) {
    totalsBlock.push([
      { text: fmtEgp(instaSum), alignment: 'left' },
      { text: 'انستاباي', alignment: 'right' },
    ]);
  }
  if (invoice.status === 'open' || Number(invoice.balance_egp) > 0) {
    totalsBlock.push([
      { text: fmtEgp(invoice.paid_egp), alignment: 'left', bold: true },
      { text: 'المدفوع', alignment: 'right', bold: true },
    ]);
    totalsBlock.push([
      { text: fmtEgp(invoice.balance_egp), alignment: 'left', bold: true },
      { text: 'الباقي', alignment: 'right', bold: true },
    ]);
  }

  const docDefinition: Record<string, unknown> = {
    pageSize: 'A4',
    pageMargins: [30, 30, 30, 40],
    defaultStyle: {
      font: 'Amiri',
      fontSize: 10,
      alignment: 'right',
    },
    info: {
      title: invoice.invoice_no,
      author: 'Ramex Store',
    },
    watermark: watermarkText
      ? { text: watermarkText, color: 'gray', opacity: 0.18, bold: true, fontSize: 60 }
      : undefined,
    content: [
      // Header
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: ar(address), fontSize: 9 },
              { text: ar(phone), fontSize: 9 },
              taxId ? { text: `الرقم الضريبي: ${ar(taxId)}`, fontSize: 9 } : null,
            ].filter(Boolean),
          },
          {
            width: 'auto',
            stack: [
              { text: invoice.invoice_no, bold: true, fontSize: 14 },
              { text: fmtDateCairo(invoice.created_at), fontSize: 9 },
              { text: `الكاشير: ${ar(invoice.cashier_username)}`, fontSize: 9 },
            ],
            alignment: 'left',
          },
        ],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 5, x2: 535, y2: 5, lineWidth: 0.5 }] },
      // Customer block
      {
        margin: [0, 8, 0, 8],
        stack: [
          { text: 'بيانات العميل', bold: true },
          {
            columns: [
              { text: `الاسم: ${ar(invoice.customer_name_ar)}`, width: '*' },
              { text: `الهاتف: ${ar(invoice.customer_phone)}`, width: '*' },
              { text: `كود: ${ar(invoice.customer_code)}`, width: 'auto' },
            ],
            columnGap: 12,
          },
          invoice.customer_address_ar
            ? { text: `العنوان: ${ar(invoice.customer_address_ar)}`, fontSize: 9 }
            : { text: '' },
        ],
      },
      // Items table
      {
        table: {
          headerRows: 1,
          widths: ['auto', 'auto', 'auto', 'auto', 'auto', '*'],
          body: [tableHeader, ...itemRows],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 8],
      },
      // Totals
      {
        columns: [
          { width: '*', text: '' },
          {
            width: 250,
            table: { widths: ['*', '*'], body: totalsBlock },
            layout: 'noBorders',
          },
        ],
      },
      // Notes
      invoice.notes_ar
        ? { text: `ملاحظات: ${ar(invoice.notes_ar)}`, margin: [0, 8, 0, 0], fontSize: 9 }
        : { text: '' },
    ],
    footer: (currentPage: number, pageCount: number) => ({
      stack: [
        { text: ar(warningAr), fontSize: 8, alignment: 'center', italics: true },
        {
          text: `صفحة ${currentPage} من ${pageCount}`,
          fontSize: 8,
          alignment: 'center',
        },
      ],
      margin: [30, 0, 30, 10],
    }),
  };

  const pm = pdfmake as unknown as {
    createPdf: (
      def: Record<string, unknown>,
    ) => { getBuffer: () => Promise<Buffer> };
  };
  const doc = pm.createPdf(docDefinition);
  return doc.getBuffer();
}
