import bwipjs from 'bwip-js/node';
import pdfmake from 'pdfmake';
import { PDF_FONTS } from '../pdf/fonts.js';
import { getSetting } from '../../domain/settings/settings.service.js';
import type { RollWithLabelDetails } from '../../domain/items/items.types.js';

const MM_TO_PT = 2.8346;

const DEFAULT_FIELDS = [
  'logo', 'roll_sr_no', 'fabric_name', 'color_name',
  'barcode', 'fabric_code', 'color_code', 'weight', 'composition',
];

function parseLabelSize(raw: string): { width: number; height: number } {
  const m = raw.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)mm$/i);
  if (!m) return { width: 50 * MM_TO_PT, height: 30 * MM_TO_PT };
  return { width: Number(m[1]) * MM_TO_PT, height: Number(m[2]) * MM_TO_PT };
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
    height: 7,
    includetext: false,
    paddingwidth: 2,
  });
  return `data:image/png;base64,${buf.toString('base64')}`;
}

function rule(inner: number): unknown {
  return {
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: inner, y2: 0, lineWidth: 0.4, lineColor: '#444444' }],
    margin: [0, 0, 0, 1] as [number, number, number, number],
  };
}

function makePdfConfig(
  width: number,
  height: number,
  images: Record<string, string>,
  content: unknown[],
): Record<string, unknown> {
  return {
    pageSize: { width, height },
    pageMargins: [5, 5, 5, 5],
    defaultStyle: { font: 'Amiri', fontSize: 7, alignment: 'right' },
    images,
    content,
  };
}

function createPdf(def: Record<string, unknown>): { getBuffer: () => Promise<Buffer> } {
  const pm = pdfmake as unknown as {
    createPdf: (def: Record<string, unknown>) => { getBuffer: () => Promise<Buffer> };
  };
  return pm.createPdf(def);
}

/**
 * Builds all pdfmake content nodes for one label.
 *
 * Layout (top → bottom):
 *   ━━━━━━━━━━━━━━━━━━━━━  2pt accent bar
 *   SR# 001        رامكس  header row (no separator after — keeps it compact)
 *   قطن مصري · أزرق        fabric · color  [top details]
 *   █████████████████████  barcode image
 *   1234567890123456        barcode text
 *   ──────────────────────  thin rule
 *   F001 · C02 · 25.500 كجم  spec footer
 *   التركيب: 100% قطن        composition
 */
function buildOneLabelContent(
  roll: RollWithLabelDetails,
  imageKey: string,
  fields: string[],
  pageWidth: number,
  pageBreak?: 'before',
): unknown[] {
  const inner = pageWidth - 10;
  const has = (f: string) => fields.includes(f);
  const content: unknown[] = [];

  // Thick top accent bar — pageBreak lives here so there's no stack wrapper
  content.push({
    canvas: [{
      type: 'line',
      x1: 0, y1: 0, x2: inner, y2: 0,
      lineWidth: 2,
      lineColor: '#000000',
    }],
    margin: [0, 0, 0, 2] as [number, number, number, number],
    ...(pageBreak ? { pageBreak } : {}),
  });

  // Header: SR# (left) | رامكس (right — RTL start = brand position)
  content.push({
    columns: [
      has('roll_sr_no') && roll.roll_sr_no
        ? { text: `SR# ${roll.roll_sr_no}`, bold: true, fontSize: 6.5, alignment: 'left' as const }
        : { text: '' },
      has('logo')
        ? { text: 'رامكس', bold: true, fontSize: 8.5, alignment: 'right' as const }
        : { text: '' },
    ],
    columnGap: 4,
    margin: [0, 0, 0, 2] as [number, number, number, number],
  });

  // Top details: fabric name (bold) · color name — no separator, saves vertical space
  const topInlines: unknown[] = [];
  if (has('fabric_name') && roll.fabric_name_ar) {
    topInlines.push({ text: roll.fabric_name_ar, bold: true });
  }
  if (has('color_name') && roll.color_name_ar) {
    if (topInlines.length) topInlines.push({ text: '  ·  ' });
    topInlines.push({ text: roll.color_name_ar });
  }
  if (topInlines.length) {
    content.push({
      text: topInlines,
      fontSize: 6,
      alignment: 'center' as const,
      margin: [0, 0, 0, 1] as [number, number, number, number],
    });
  }

  // Barcode image + human-readable text
  if (has('barcode')) {
    content.push(
      {
        image: imageKey,
        width: inner,
        alignment: 'center' as const,
        margin: [0, 0, 0, 0.5] as [number, number, number, number],
      },
      {
        text: roll.internal_barcode,
        fontSize: 5,
        alignment: 'center' as const,
        characterSpacing: 0.8,
        margin: [0, 0, 0, 1] as [number, number, number, number],
      },
    );
  }

  content.push(rule(inner));

  // Spec footer: fabric_code · color_code · weight · lot_no
  const specParts: string[] = [];
  if (has('fabric_code') && roll.fabric_code) specParts.push(roll.fabric_code);
  if (has('color_code') && roll.color_code) specParts.push(roll.color_code);
  if (has('weight') && roll.weight_kg) specParts.push(`${Number(roll.weight_kg).toFixed(3)} كجم`);
  if (has('lot_no') && roll.lot_no) specParts.push(`#${roll.lot_no}`);
  if (specParts.length) {
    content.push({
      text: specParts.join(' · '),
      fontSize: 5.5,
      alignment: 'center' as const,
      characterSpacing: 0.2,
      margin: [0, 0, 0, 0.5] as [number, number, number, number],
    });
  }

  // التركيب (composition)
  if (has('composition') && roll.composition_description) {
    content.push({
      text: `التركيب: ${roll.composition_description}`,
      fontSize: 5.5,
      alignment: 'center' as const,
      characterSpacing: 0.2,
    });
  }

  return content;
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function buildSingleLabelPdf(roll: RollWithLabelDetails): Promise<Buffer> {
  ensureFonts();
  const [sizeRaw, fieldsRaw] = await Promise.all([
    getSetting<string>(undefined, 'barcode_label_size', '50x30mm'),
    getSetting<string[]>(undefined, 'barcode_label_fields', DEFAULT_FIELDS),
  ]);
  const { width, height } = parseLabelSize(sizeRaw);
  const imgData = await barcodeImage(roll.internal_barcode);
  const content = buildOneLabelContent(roll, 'barcodeImg', fieldsRaw, width);
  return createPdf(makePdfConfig(width, height, { barcodeImg: imgData }, content)).getBuffer();
}

export async function buildBatchLabelPdf(rolls: RollWithLabelDetails[]): Promise<Buffer> {
  ensureFonts();
  const [sizeRaw, fieldsRaw] = await Promise.all([
    getSetting<string>(undefined, 'barcode_label_size', '50x30mm'),
    getSetting<string[]>(undefined, 'barcode_label_fields', DEFAULT_FIELDS),
  ]);
  const { width, height } = parseLabelSize(sizeRaw);

  const allImages: Record<string, string> = {};
  const allContent: unknown[] = [];

  for (let i = 0; i < rolls.length; i++) {
    const roll = rolls[i];
    const key = `barcode_${roll.id}`;
    allImages[key] = await barcodeImage(roll.internal_barcode);
    const nodes = buildOneLabelContent(roll, key, fieldsRaw, width, i > 0 ? 'before' : undefined);
    for (const node of nodes) allContent.push(node);
  }

  return createPdf(makePdfConfig(width, height, allImages, allContent)).getBuffer();
}

export async function buildLabelPdf(rolls: RollWithLabelDetails[]): Promise<Buffer> {
  return buildBatchLabelPdf(rolls);
}
