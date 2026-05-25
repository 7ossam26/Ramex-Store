import type { ReportPdfOptions } from './pdfExport.js';

function escHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildPrintableHtml(opts: ReportPdfOptions): string {
  const sectionsHtml = opts.sections
    .map((section) => {
      const cols = section.columns;
      const headerCells = cols.map((c) => `<th>${escHtml(c.label)}</th>`).join('');
      let bodyHtml = '';

      if (section.rows.length === 0) {
        bodyHtml = `<tr><td colspan="${cols.length}" class="empty">${escHtml(section.emptyAr ?? 'لا توجد بيانات')}</td></tr>`;
      } else {
        bodyHtml = section.rows
          .map(
            (row) =>
              `<tr>${cols.map((c) => `<td>${escHtml(row[c.key] ?? '')}</td>`).join('')}</tr>`,
          )
          .join('');

        if (section.totals) {
          const totCells = cols
            .map((c) => `<td><strong>${escHtml(section.totals![c.key] ?? '')}</strong></td>`)
            .join('');
          bodyHtml += `<tr class="totals-row">${totCells}</tr>`;
        }
      }

      return `
        <section>
          <h2>${escHtml(section.titleAr)}</h2>
          <table>
            <thead><tr>${headerCells}</tr></thead>
            <tbody>${bodyHtml}</tbody>
          </table>
        </section>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>${escHtml(opts.titleAr)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'IBM Plex Sans Arabic', system-ui, Arial, sans-serif;
    font-size: 11pt;
    direction: rtl;
    text-align: right;
    color: #111;
    padding: 20mm;
  }
  h1 { font-size: 16pt; text-align: center; margin-bottom: 4px; }
  .subtitle, .generated { text-align: center; color: #555; font-size: 10pt; margin-bottom: 4px; }
  hr { border: none; border-top: 0.5px solid #aaa; margin: 12px 0; }
  h2 { font-size: 12pt; margin: 12px 0 6px; text-align: center; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #D9E1F2; padding: 5px 8px; font-weight: bold; border: 0.5px solid #bbb; }
  td { padding: 4px 8px; border: 0.5px solid #ddd; }
  .totals-row td { font-weight: bold; background: #f5f5f5; }
  .empty { color: #888; font-style: italic; text-align: center; padding: 12px; }
  @media print {
    @page { size: A4 portrait; margin: 15mm; }
    body { padding: 0; }
    button { display: none; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; page-break-after: auto; }
  }
</style>
</head>
<body>
  <h1>${escHtml(opts.titleAr)}</h1>
  ${opts.subtitleAr ? `<p class="subtitle">${escHtml(opts.subtitleAr)}</p>` : ''}
  <p class="generated">تاريخ الإنشاء: ${escHtml(opts.generatedAt)}</p>
  <hr>
  ${sectionsHtml}
  <script>window.onload = () => window.print();</script>
</body>
</html>`;
}
