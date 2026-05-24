import bwipjs from 'bwip-js/node';
import pdfmake from 'pdfmake';
import { PDF_FONTS } from '../pdf/fonts.js';
import type { RollWithLabelDetails } from '../../domain/items/items.types.js';

const MM_TO_PT = 2.8346;
const THERMAL_W = 100 * MM_TO_PT;  // 283.46pt
const THERMAL_H = 150 * MM_TO_PT;  // 425.19pt
const MARGIN = 6;

let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  const pm = pdfmake as unknown as {
    setFonts: (f: typeof PDF_FONTS) => void;
    setLocalAccessPolicy?: (cb: (p: string) => boolean) => void;
    setUrlAccessPolicy?: (cb: (url: string) => boolean) => void;
  };
  pm.setFonts(PDF_FONTS);
  pm.setLocalAccessPolicy?.(() => true);
  pm.setUrlAccessPolicy?.(() => false);
  fontsReady = true;
}

async function barcodeDataUrl(text: string): Promise<string> {
  const buf = await bwipjs.toBuffer({
    bcid: 'code128',
    text,
    scale: 3,
    height: 10,
    includetext: false,
    paddingwidth: 2,
  });
  return `data:image/png;base64,${buf.toString('base64')}`;
}

type PdfRow = Record<string, unknown>;

function row(label: string, value: string | number | null | undefined, fontSize = 8): PdfRow | null {
  if (value == null || value === '') return null;
  return {
    columns: [
      { text: String(value), fontSize, alignment: 'left', width: '*' },
      { text: label, fontSize, bold: true, alignment: 'right', width: 'auto' },
    ],
    columnGap: 4,
    margin: [0, 1, 0, 1],
  };
}

function twoColRow(
  label1: string, val1: string | number | null | undefined,
  label2: string, val2: string | number | null | undefined,
  fontSize = 8,
): PdfRow | null {
  const has1 = val1 != null && val1 !== '';
  const has2 = val2 != null && val2 !== '';
  if (!has1 && !has2) return null;
  return {
    columns: [
      has2
        ? { columns: [{ text: String(val2), fontSize, alignment: 'left', width: '*' }, { text: label2, fontSize, bold: true, alignment: 'right', width: 'auto' }], columnGap: 3, width: '*' }
        : { text: '', width: '*' },
      has1
        ? { columns: [{ text: String(val1), fontSize, alignment: 'left', width: '*' }, { text: label1, fontSize, bold: true, alignment: 'right', width: 'auto' }], columnGap: 3, width: '*' }
        : { text: '', width: '*' },
    ],
    columnGap: 8,
    margin: [0, 1, 0, 1],
  };
}

function buildLabelContent(
  roll: RollWithLabelDetails,
  barcodeKey: string,
  innerWidth: number,
  compact = false,
): PdfRow[] {
  const fs = compact ? 7 : 8;
  const fsBig = compact ? 8 : 9;
  const content: (PdfRow | null)[] = [];

  // Header: brand + product_line
  if (roll.brand_arabic_name) {
    const brandText = roll.brand_product_line
      ? `${roll.brand_arabic_name} — ${roll.brand_product_line}`
      : roll.brand_arabic_name;
    content.push({
      text: brandText,
      fontSize: fsBig,
      bold: true,
      alignment: 'right',
      margin: [0, 0, 0, 2],
    });
  }

  // Supplier name
  if (roll.supplier_arabic_name) {
    content.push({
      text: roll.supplier_arabic_name,
      fontSize: fs - 1,
      alignment: 'right',
      color: '#555',
      margin: [0, 0, 0, 2],
    });
  }

  // Order # | Top #
  content.push(twoColRow('أمر', roll.supplier_order_no, 'التوب', roll.top_number, fs));

  // Item name | Grade
  content.push(twoColRow('الصنف', roll.fabric_name_ar, 'الدرجة', roll.grade_arabic_name, fs));

  // Width | Color name + code
  const colorDisplay = roll.color_name_ar
    ? `${roll.color_name_ar}${roll.color_code ? ` ${roll.color_code}` : ''}`
    : null;
  content.push(twoColRow('العرض', roll.width_cm ? `${roll.width_cm} سم` : null, 'اللون', colorDisplay, fs));

  // Composition
  content.push(row('التركيب', roll.composition_description, fs));

  // Roll SR
  if (roll.roll_sr_no) {
    content.push({
      text: `Roll SR : ${roll.roll_sr_no}`,
      fontSize: fs,
      alignment: 'center',
      margin: [0, 2, 0, 2],
    });
  }

  // Barcode image
  content.push({
    image: barcodeKey,
    width: innerWidth,
    alignment: 'center',
    margin: [0, 2, 0, 1],
  });

  // Barcode text
  content.push({
    text: roll.internal_barcode,
    fontSize: fs - 1,
    alignment: 'center',
    characterSpacing: 0.5,
    margin: [0, 0, 0, 2],
  });

  // Warning text
  if (roll.supplier_arabic_warning_text) {
    content.push({
      text: roll.supplier_arabic_warning_text,
      fontSize: fs - 1,
      alignment: 'right',
      color: '#444',
      margin: [0, 3, 0, 0],
    });
  }

  return content.filter((c): c is PdfRow => c !== null);
}

function makePdf(docDef: Record<string, unknown>): Promise<Buffer> {
  const pm = pdfmake as unknown as {
    createPdf: (def: Record<string, unknown>) => { getBuffer: () => Promise<Buffer> };
  };
  return pm.createPdf(docDef).getBuffer();
}

export async function renderRollLabelThermal(roll: RollWithLabelDetails): Promise<Buffer> {
  return renderRollLabelsThermal([roll]);
}

export async function renderRollLabelsThermal(rolls: RollWithLabelDetails[]): Promise<Buffer> {
  ensureFonts();
  const innerWidth = THERMAL_W - MARGIN * 2;
  const images: Record<string, string> = {};
  const allContent: PdfRow[] = [];

  for (let i = 0; i < rolls.length; i++) {
    const roll = rolls[i];
    const key = `bc_thermal_${roll.id}`;
    images[key] = await barcodeDataUrl(roll.internal_barcode);
    const labelItems = buildLabelContent(roll, key, innerWidth);
    if (i > 0 && labelItems.length > 0) {
      (labelItems[0] as Record<string, unknown>).pageBreak = 'before';
    }
    for (const item of labelItems) allContent.push(item);
  }

  return makePdf({
    pageSize: { width: THERMAL_W, height: THERMAL_H },
    pageMargins: [MARGIN, MARGIN, MARGIN, MARGIN],
    defaultStyle: { font: 'Amiri', fontSize: 8, alignment: 'right' },
    images,
    content: allContent,
  });
}

export async function renderRollLabelA4(
  rolls: RollWithLabelDetails[],
  perPage = 24,
): Promise<Buffer> {
  ensureFonts();

  const cols = 3;
  const rowsPerPage = Math.ceil(perPage / cols);
  const pageMargin = 10;
  const A4_W = 595.28;
  const A4_H = 841.89;
  const usableW = A4_W - pageMargin * 2;
  const usableH = A4_H - pageMargin * 2;
  const cellW = usableW / cols;
  const cellH = usableH / rowsPerPage;
  const cellInner = cellW - 8;

  // Build all barcode images
  const images: Record<string, string> = {};
  for (const roll of rolls) {
    const key = `bc_${roll.id}`;
    if (!images[key]) {
      images[key] = await barcodeDataUrl(roll.internal_barcode);
    }
  }

  // Build table body (3 cells per row)
  const tableBody: unknown[][] = [];
  for (let i = 0; i < rolls.length; i += cols) {
    const tableRow: unknown[] = [];
    for (let j = 0; j < cols; j++) {
      const roll = rolls[i + j];
      if (roll) {
        const key = `bc_${roll.id}`;
        tableRow.push({
          stack: buildLabelContent(roll, key, cellInner, true),
          border: [true, true, true, true],
          margin: [4, 4, 4, 4],
        });
      } else {
        tableRow.push({ text: '', border: [true, true, true, true] });
      }
    }
    tableBody.push(tableRow);
  }

  const colWidths = Array(cols).fill(cellW);

  return makePdf({
    pageSize: 'A4',
    pageMargins: [pageMargin, pageMargin, pageMargin, pageMargin],
    defaultStyle: { font: 'Amiri', fontSize: 7, alignment: 'right' },
    images,
    content: [
      {
        table: {
          widths: colWidths,
          heights: Array(tableBody.length).fill(cellH),
          body: tableBody,
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#aaa',
          vLineColor: () => '#aaa',
          paddingLeft: () => 0,
          paddingRight: () => 0,
          paddingTop: () => 0,
          paddingBottom: () => 0,
        },
      },
    ],
  });
}
