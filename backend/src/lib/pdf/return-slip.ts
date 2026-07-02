import pdfmake from 'pdfmake';
import { PDF_FONTS } from './fonts.js';
import { getSetting } from '../../domain/settings/settings.service.js';
import type { ReturnDetail } from '../../domain/sales/returnsService.js';

let fontsConfigured = false;
function ensureFontsConfigured() {
  if (fontsConfigured) return;
  const pm = pdfmake as unknown as {
    setFonts: (f: typeof PDF_FONTS) => void;
    setLocalAccessPolicy?: (cb: (p: string) => boolean) => void;
    setUrlAccessPolicy?: (cb: (url: string) => boolean) => void;
  };
  pm.setFonts(PDF_FONTS);
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

function labelRefundMethod(method: string): string {
  const map: Record<string, string> = {
    cash: 'نقدي',
    instapay: 'انستاباي',
    customer_credit: 'رصيد دائن للعميل',
  };
  return map[method] ?? method;
}

function labelDisposition(d: string): string {
  return d === 'back_to_stock' ? 'إعادة للمخزون' : 'تالف';
}

export async function buildReturnSlipPdf(ret: ReturnDetail): Promise<Buffer> {
  ensureFontsConfigured();

  const [address, phone, taxId] = await Promise.all([
    getSetting<string>(undefined, 'shop_address_ar', ''),
    getSetting<string>(undefined, 'shop_phone', ''),
    getSetting<string>(undefined, 'shop_tax_id', ''),
  ]);

  const tableHeader = [
    'الإجمالي المسترجع',
    'الحالة',
    'الكمية',
    'الكود',
    'الصنف',
  ].map((h) => ({ text: h, bold: true, alignment: 'right' as const }));

  const itemRows = ret.lines.map((l) => {
    const isAccessory = l.item_type === 'accessory';
    return [
      { text: fmtEgp(l.refund_amount_egp), alignment: 'right' as const },
      { text: labelDisposition(l.roll_disposition), alignment: 'right' as const },
      { text: isAccessory ? `${l.qty_pieces} قطعة` : `${Number(l.weight_kg).toFixed(3)} كجم`, alignment: 'right' as const },
      { text: isAccessory ? ar(l.internal_barcode) : (ar(l.roll_sr_no) || ar(l.internal_barcode)), alignment: 'right' as const },
      { text: isAccessory ? (ar(l.accessory_name_ar) || ar(l.internal_barcode)) : `${ar(l.fabric_name_ar)} / ${ar(l.color_name_ar)}`, alignment: 'right' as const },
    ];
  });

  const docDefinition: Record<string, unknown> = {
    pageSize: 'A4',
    pageMargins: [30, 30, 30, 40],
    defaultStyle: {
      font: 'Amiri',
      fontSize: 10,
      alignment: 'right',
    },
    info: {
      title: ret.return_no,
      author: 'Ramex Store',
    },
    watermark: {
      text: 'فاتورة استرجاع',
      color: 'gray',
      opacity: 0.18,
      bold: true,
      fontSize: 60,
    },
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
              { text: ret.return_no, bold: true, fontSize: 14 },
              { text: fmtDateCairo(ret.processed_at), fontSize: 9 },
              { text: `بواسطة: ${ar(ret.actor_username)}`, fontSize: 9 },
              { text: `فاتورة أصلية: ${ar(ret.original_invoice_no)}`, fontSize: 9 },
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
              { text: `الاسم: ${ar(ret.customer_name_ar)}`, width: '*' },
              { text: `الهاتف: ${ar(ret.customer_phone)}`, width: '*' },
              { text: `كود: ${ar(ret.customer_code)}`, width: 'auto' },
            ],
            columnGap: 12,
          },
        ],
      },
      // Items table
      {
        table: {
          headerRows: 1,
          widths: ['auto', 'auto', 'auto', 'auto', '*'],
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
            table: {
              widths: ['*', '*'],
              body: [
                [
                  { text: fmtEgp(ret.total_refund_egp), alignment: 'left', bold: true },
                  { text: 'إجمالي المسترجع (ج.م)', alignment: 'right', bold: true, fontSize: 12 },
                ],
                [
                  { text: labelRefundMethod(ret.refund_method), alignment: 'left' },
                  { text: 'طريقة الاسترجاع', alignment: 'right', bold: true },
                ],
              ],
            },
            layout: 'noBorders',
          },
        ],
      },
      // Notes
      ret.notes_ar
        ? { text: `ملاحظات: ${ar(ret.notes_ar)}`, margin: [0, 8, 0, 0], fontSize: 9 }
        : { text: '' },
    ],
    footer: (currentPage: number, pageCount: number) => ({
      text: `صفحة ${currentPage} من ${pageCount}`,
      fontSize: 8,
      alignment: 'center',
      margin: [30, 0, 30, 10],
    }),
  };

  const pm = pdfmake as unknown as {
    createPdf: (def: Record<string, unknown>) => { getBuffer: () => Promise<Buffer> };
  };
  const doc = pm.createPdf(docDefinition);
  return doc.getBuffer();
}
