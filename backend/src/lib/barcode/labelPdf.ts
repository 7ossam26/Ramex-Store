import bwipjs from 'bwip-js/node';
import pdfmake from 'pdfmake';
import { PDF_FONTS } from '../pdf/fonts.js';
import { getSetting } from '../../domain/settings/settings.service.js';
import type { RollWithDetails } from '../../domain/items/items.types.js';

const MM_TO_PT = 2.8346;

function parseLabelSize(raw: string): { width: number; height: number } {
  const m = raw.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)mm$/i);
  if (!m) return { width: 50 * MM_TO_PT, height: 30 * MM_TO_PT };
  return {
    width: Number(m[1]) * MM_TO_PT,
    height: Number(m[2]) * MM_TO_PT,
  };
}

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

async function barcodeImage(text: string): Promise<string> {
  const buf = await bwipjs.toBuffer({
    bcid: 'code128',
    text,
    scale: 3,
    height: 8,
    includetext: false,
    paddingwidth: 2,
  });
  return `data:image/png;base64,${buf.toString('base64')}`;
}

function buildLabelContent(
  roll: RollWithDetails,
  barcodeDataUrl: string,
  fields: string[],
  pageWidth: number,
) {
  const inner = pageWidth - 10; // 5pt margin each side
  const has = (f: string) => fields.includes(f);
  const content: unknown[] = [];

  // Row 1: shop name (left) + Roll SR# (right)
  const row1Left = has('logo') ? { text: 'رامكس', bold: true, fontSize: 7 } : { text: '' };
  const row1Right = has('roll_sr_no') && roll.roll_sr_no
    ? { text: `SR# ${roll.roll_sr_no}`, bold: true, fontSize: 7, alignment: 'left' as const }
    : { text: '' };

  content.push({
    columns: [row1Right, row1Left],
    columnGap: 4,
    margin: [0, 0, 0, 2],
  });

  // Row 2: barcode image
  if (has('barcode')) {
    content.push({
      image: 'barcodeImg',
      width: inner,
      alignment: 'center' as const,
      margin: [0, 0, 0, 1],
    });
  }

  // Row 3: human-readable barcode text
  if (has('barcode')) {
    content.push({
      text: roll.internal_barcode,
      fontSize: 6,
      alignment: 'center' as const,
      font: 'Amiri',
      characterSpacing: 0.5,
      margin: [0, 0, 0, 2],
    });
  }

  // Row 4: fabric code | color code | weight
  const detailParts: string[] = [];
  if (has('fabric_code') && roll.fabric_code) detailParts.push(String(roll.fabric_code));
  if (has('color_code') && roll.color_code) detailParts.push(String(roll.color_code));
  if (has('weight') && roll.weight_kg) {
    detailParts.push(`${Number(roll.weight_kg).toFixed(3)} kg`);
  }
  if (detailParts.length) {
    content.push({
      text: detailParts.join(' · '),
      fontSize: 6.5,
      alignment: 'center' as const,
      characterSpacing: 0.3,
    });
  }

  return content;
}

export async function buildLabelPdf(rolls: RollWithDetails[]): Promise<Buffer> {
  ensureFonts();

  const [sizeRaw, fieldsRaw] = await Promise.all([
    getSetting<string>(undefined, 'barcode_label_size', '50x30mm'),
    getSetting<string[]>(undefined, 'barcode_label_fields', [
      'logo', 'roll_sr_no', 'barcode', 'fabric_code', 'color_code', 'weight',
    ]),
  ]);

  const { width, height } = parseLabelSize(sizeRaw);

  const pages: unknown[] = [];

  for (let i = 0; i < rolls.length; i++) {
    const roll = rolls[i];
    const barcodeDataUrl = await barcodeImage(roll.internal_barcode);
    const content = buildLabelContent(roll, barcodeDataUrl, fieldsRaw, width);

    if (i > 0) {
      // Force a page break before each label after the first
      (content[0] as Record<string, unknown>).pageBreak = 'before';
    }

    for (const item of content) {
      pages.push(item);
    }
  }

  const docDefinition: Record<string, unknown> = {
    pageSize: { width, height },
    pageMargins: [5, 5, 5, 5],
    defaultStyle: {
      font: 'Amiri',
      fontSize: 7,
      alignment: 'right',
    },
    images: {
      barcodeImg: '', // placeholder — we override per-page via dynamic content
    },
    content: pages,
  };

  const pm = pdfmake as unknown as {
    createPdf: (def: Record<string, unknown>) => { getBuffer: () => Promise<Buffer> };
  };
  const doc = pm.createPdf(docDefinition);
  return doc.getBuffer();
}

export async function buildSingleLabelPdf(roll: RollWithDetails): Promise<Buffer> {
  ensureFonts();

  const [sizeRaw, fieldsRaw] = await Promise.all([
    getSetting<string>(undefined, 'barcode_label_size', '50x30mm'),
    getSetting<string[]>(undefined, 'barcode_label_fields', [
      'logo', 'roll_sr_no', 'barcode', 'fabric_code', 'color_code', 'weight',
    ]),
  ]);

  const { width, height } = parseLabelSize(sizeRaw);
  const barcodeDataUrl = await barcodeImage(roll.internal_barcode);
  const content = buildLabelContent(roll, barcodeDataUrl, fieldsRaw, width);

  const docDefinition: Record<string, unknown> = {
    pageSize: { width, height },
    pageMargins: [5, 5, 5, 5],
    defaultStyle: {
      font: 'Amiri',
      fontSize: 7,
      alignment: 'right',
    },
    images: {
      barcodeImg: barcodeDataUrl,
    },
    content,
  };

  const pm = pdfmake as unknown as {
    createPdf: (def: Record<string, unknown>) => { getBuffer: () => Promise<Buffer> };
  };
  const doc = pm.createPdf(docDefinition);
  return doc.getBuffer();
}

export async function buildBatchLabelPdf(rolls: RollWithDetails[]): Promise<Buffer> {
  ensureFonts();

  const [sizeRaw, fieldsRaw] = await Promise.all([
    getSetting<string>(undefined, 'barcode_label_size', '50x30mm'),
    getSetting<string[]>(undefined, 'barcode_label_fields', [
      'logo', 'roll_sr_no', 'barcode', 'fabric_code', 'color_code', 'weight',
    ]),
  ]);

  const { width, height } = parseLabelSize(sizeRaw);

  // Build per-label images map and content
  const allImages: Record<string, string> = {};
  const allContent: unknown[] = [];

  for (let i = 0; i < rolls.length; i++) {
    const roll = rolls[i];
    const key = `barcode_${roll.id}`;
    allImages[key] = await barcodeImage(roll.internal_barcode);

    const has = (f: string) => fieldsRaw.includes(f);
    const inner = width - 10;

    const row1Right = has('roll_sr_no') && roll.roll_sr_no
      ? { text: `SR# ${roll.roll_sr_no}`, bold: true, fontSize: 7, alignment: 'left' as const }
      : { text: '' };
    const row1Left = has('logo') ? { text: 'رامكس', bold: true, fontSize: 7 } : { text: '' };

    const labelContent: unknown[] = [
      {
        columns: [row1Right, row1Left],
        columnGap: 4,
        margin: [0, 0, 0, 2],
        pageBreak: i > 0 ? ('before' as const) : undefined,
      },
    ];

    if (has('barcode')) {
      labelContent.push({
        image: key,
        width: inner,
        alignment: 'center' as const,
        margin: [0, 0, 0, 1],
      });
      labelContent.push({
        text: roll.internal_barcode,
        fontSize: 6,
        alignment: 'center' as const,
        characterSpacing: 0.5,
        margin: [0, 0, 0, 2],
      });
    }

    const detailParts: string[] = [];
    if (has('fabric_code') && roll.fabric_code) detailParts.push(String(roll.fabric_code));
    if (has('color_code') && roll.color_code) detailParts.push(String(roll.color_code));
    if (has('weight') && roll.weight_kg) {
      detailParts.push(`${Number(roll.weight_kg).toFixed(3)} kg`);
    }
    if (detailParts.length) {
      labelContent.push({
        text: detailParts.join(' · '),
        fontSize: 6.5,
        alignment: 'center' as const,
        characterSpacing: 0.3,
      });
    }

    for (const item of labelContent) allContent.push(item);
  }

  const docDefinition: Record<string, unknown> = {
    pageSize: { width, height },
    pageMargins: [5, 5, 5, 5],
    defaultStyle: {
      font: 'Amiri',
      fontSize: 7,
      alignment: 'right',
    },
    images: allImages,
    content: allContent,
  };

  const pm = pdfmake as unknown as {
    createPdf: (def: Record<string, unknown>) => { getBuffer: () => Promise<Buffer> };
  };
  const doc = pm.createPdf(docDefinition);
  return doc.getBuffer();
}
