import pdfmake from 'pdfmake';
import { PDF_FONTS } from '../pdf/fonts.js';

let fontsConfigured = false;
function ensureFonts() {
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

export type ReportColumn = {
  label: string;
  key: string;
  width?: string | number;
  align?: 'right' | 'left' | 'center';
  bold?: boolean;
};

export type ReportSection = {
  titleAr: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  totals?: Record<string, unknown>;
  emptyAr?: string;
};

export type ReportPdfOptions = {
  titleAr: string;
  subtitleAr?: string;
  generatedAt: string;
  sections: ReportSection[];
  /** Defaults to 'portrait'. Wide tables (many columns) should use 'landscape'. */
  orientation?: 'portrait' | 'landscape';
};

function fmtNum(v: string): string {
  if (!v) return '';
  const n = Number(v);
  if (isNaN(n)) return v;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function cell(
  text: string | number,
  opts: { bold?: boolean; align?: 'right' | 'left' | 'center' } = {},
) {
  return {
    text: String(text ?? ''),
    alignment: opts.align ?? 'right',
    bold: opts.bold ?? false,
  };
}

export async function buildReportPdf(opts: ReportPdfOptions): Promise<Buffer> {
  ensureFonts();

  const content: unknown[] = [
    { text: opts.titleAr, fontSize: 16, bold: true, alignment: 'center', margin: [0, 0, 0, 4] },
  ];

  if (opts.subtitleAr) {
    content.push({
      text: opts.subtitleAr,
      fontSize: 10,
      alignment: 'center',
      color: '#555',
      margin: [0, 0, 0, 2],
    });
  }

  content.push({
    text: `تاريخ الإنشاء: ${opts.generatedAt}`,
    fontSize: 9,
    alignment: 'center',
    color: '#888',
    margin: [0, 0, 0, 10],
  });

  const contentWidth = opts.orientation === 'landscape' ? 782 : 535;
  content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: contentWidth, y2: 0, lineWidth: 0.5 }] });

  for (const section of opts.sections) {
    content.push({
      text: section.titleAr,
      fontSize: 12,
      bold: true,
      margin: [0, 10, 0, 4],
      alignment: 'right',
    });

    if (section.rows.length === 0) {
      content.push({
        text: section.emptyAr ?? 'لا توجد بيانات',
        fontSize: 9,
        color: '#888',
        alignment: 'right',
        margin: [0, 0, 0, 6],
      });
      continue;
    }

    const widths = section.columns.map((c) => c.width ?? '*');
    const headerRow = section.columns.map((c) =>
      cell(c.label, { bold: true, align: c.align ?? 'right' }),
    );
    const dataRows = section.rows.map((row) =>
      section.columns.map((c) => {
        const v = row[c.key] ?? '';
        return cell(String(v), { bold: c.bold, align: c.align ?? 'right' });
      }),
    );

    const body: unknown[] = [headerRow, ...dataRows];

    if (section.totals) {
      const totRow = section.columns.map((c) => {
        const v = section.totals![c.key];
        return cell(v !== undefined ? fmtNum(String(v)) : '', { bold: true, align: c.align ?? 'right' });
      });
      body.push(totRow);
    }

    content.push({
      table: { headerRows: 1, widths, body },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 8],
    });
  }

  const docDef: Record<string, unknown> = {
    pageSize: 'A4',
    pageOrientation: opts.orientation ?? 'portrait',
    pageMargins: [30, 30, 30, 40],
    defaultStyle: { font: 'Amiri', fontSize: 9, alignment: 'right' },
    info: { title: opts.titleAr, author: 'Ramex Store' },
    content,
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
  return pm.createPdf(docDef).getBuffer();
}
