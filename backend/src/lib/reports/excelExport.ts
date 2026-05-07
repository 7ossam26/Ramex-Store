import ExcelJS from 'exceljs';
import type { ReportPdfOptions, ReportSection } from './pdfExport.js';

export type { ReportSection, ReportPdfOptions as ReportOptions };

export async function buildReportExcel(opts: ReportPdfOptions): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Ramex Store';

  for (const section of opts.sections) {
    const sheetName = section.titleAr.slice(0, 31); // Excel sheet name limit
    const ws = wb.addWorksheet(sheetName, { views: [{ rightToLeft: true }] });

    // Title row
    ws.addRow([opts.titleAr]);
    ws.getRow(1).font = { bold: true, size: 14 };
    ws.mergeCells(1, 1, 1, section.columns.length);
    ws.getRow(1).alignment = { horizontal: 'center' };

    if (opts.subtitleAr) {
      ws.addRow([opts.subtitleAr]);
      ws.mergeCells(2, 1, 2, section.columns.length);
      ws.getRow(2).alignment = { horizontal: 'center' };
    }

    ws.addRow([`تاريخ الإنشاء: ${opts.generatedAt}`]);
    const metaRow = opts.subtitleAr ? 3 : 2;
    ws.mergeCells(metaRow, 1, metaRow, section.columns.length);
    ws.addRow([]); // spacer

    // Section title
    const secTitleRowIdx = ws.rowCount + 1;
    ws.addRow([section.titleAr]);
    ws.getRow(secTitleRowIdx).font = { bold: true, size: 12 };
    ws.mergeCells(secTitleRowIdx, 1, secTitleRowIdx, section.columns.length);

    if (section.rows.length === 0) {
      ws.addRow([section.emptyAr ?? 'لا توجد بيانات']);
      continue;
    }

    // Header row
    const headerRowIdx = ws.rowCount + 1;
    ws.addRow(section.columns.map((c) => c.label));
    const headerRow = ws.getRow(headerRowIdx);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9E1F2' },
    };
    headerRow.alignment = { horizontal: 'right' };
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: headerRowIdx, rightToLeft: true }];

    // Data rows
    for (const row of section.rows) {
      ws.addRow(section.columns.map((c) => {
        const v = row[c.key];
        return v !== null && v !== undefined ? String(v) : '';
      }));
    }

    // Totals row
    if (section.totals) {
      const totRowIdx = ws.rowCount + 1;
      ws.addRow(section.columns.map((c) => {
        const v = section.totals![c.key];
        return v !== undefined ? String(v) : '';
      }));
      ws.getRow(totRowIdx).font = { bold: true };
    }

    // Column widths
    section.columns.forEach((col, i) => {
      const colObj = ws.getColumn(i + 1);
      colObj.width = typeof col.width === 'number' ? col.width : 18;
      colObj.alignment = { horizontal: col.align === 'left' ? 'left' : 'right' };
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
