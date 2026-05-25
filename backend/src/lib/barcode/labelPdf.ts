import bwipjs from 'bwip-js/node';
import pdfmake from 'pdfmake';
import { PDF_FONTS } from '../pdf/fonts.js';
import { getSetting } from '../../domain/settings/settings.service.js';
import type { RollWithLabelDetails } from '../../domain/items/items.types.js';

const MM_TO_PT = 2.8346;
const DEFAULT_LABEL_WIDTH_MM = 100;
const DEFAULT_LABEL_HEIGHT_MM = 150;
const DEFAULT_LABEL_SIZE = `${DEFAULT_LABEL_WIDTH_MM}x${DEFAULT_LABEL_HEIGHT_MM}mm`;
const DEFAULT_LABEL_WIDTH = DEFAULT_LABEL_WIDTH_MM * MM_TO_PT;
const DEFAULT_LABEL_HEIGHT = DEFAULT_LABEL_HEIGHT_MM * MM_TO_PT;
const PAGE_MARGIN = 12;
const BARCODE_FIT: [number, number] = [235, 58];
const LEGACY_COMPACT_LABEL_SIZE = '50x30mm';

const DEFAULT_FIELDS = [
  'logo', 'roll_sr_no', 'fabric_name', 'color_name',
  'barcode', 'fabric_code', 'color_code', 'weight', 'composition', 'lot_no',
];

const FIELD_ALIASES: Record<string, string> = {
  fabric: 'fabric_name',
  color: 'color_name',
};

const LEGACY_DEFAULT_FIELDS = new Set(['fabric', 'color', 'weight', 'barcode']);

function parseLabelSize(raw: string): { width: number; height: number } {
  const normalized = raw.trim().toLowerCase();
  if (normalized === LEGACY_COMPACT_LABEL_SIZE) {
    return { width: DEFAULT_LABEL_WIDTH, height: DEFAULT_LABEL_HEIGHT };
  }

  const m = normalized.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)mm$/i);
  if (!m) return { width: DEFAULT_LABEL_WIDTH, height: DEFAULT_LABEL_HEIGHT };
  return { width: Number(m[1]) * MM_TO_PT, height: Number(m[2]) * MM_TO_PT };
}

function normalizeFields(fields: string[]): Set<string> {
  const isLegacyDefault =
    fields.length === LEGACY_DEFAULT_FIELDS.size &&
    fields.every((field) => LEGACY_DEFAULT_FIELDS.has(field));

  if (isLegacyDefault) return new Set(DEFAULT_FIELDS);
  return new Set(fields.map((field) => FIELD_ALIASES[field] ?? field));
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
    height: 18,
    includetext: false,
    paddingwidth: 4,
  });
  return `data:image/png;base64,${buf.toString('base64')}`;
}

type PdfMargin = [number, number, number, number];
type PdfNode = Record<string, unknown>;

function makePdfConfig(
  width: number,
  height: number,
  images: Record<string, string>,
  content: unknown[],
): Record<string, unknown> {
  return {
    pageSize: { width, height },
    pageMargins: [PAGE_MARGIN, PAGE_MARGIN, PAGE_MARGIN, PAGE_MARGIN],
    defaultStyle: { font: 'Cairo', fontSize: 8.5, alignment: 'center', color: '#000000' },
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
 * Print stance: invoice-grade utility. It follows the app invoice language:
 * Cairo type, black ink, soft gray labels, hairline borders, and stacked values.
 */
function buildOneLabelContent(
  roll: RollWithLabelDetails,
  imageKey: string,
  fields: string[],
  pageWidth: number,
  pageBreak?: 'before',
): unknown[] {
  const normalizedFields = normalizeFields(fields);
  const has = (field: string) => normalizedFields.has(field);

  const fabricName = has('fabric_name') ? roll.fabric_name_ar : '';
  const colorName = has('color_name') ? roll.color_name_ar : '';
  const colorCode = has('color_code') ? roll.color_code : '';
  const fabricDisplay = fabricName || 'توب قماش';
  const colorDisplay = [colorName, colorCode].filter(Boolean).join(' / ');

  const specCells: PdfNode[] = [];
  if (has('roll_sr_no') && roll.roll_sr_no) specCells.push(infoCell('كود التوب', roll.roll_sr_no));
  if (has('weight') && roll.weight_kg) specCells.push(infoCell('الوزن', formatWeight(roll.weight_kg)));
  if (has('fabric_code') && roll.fabric_code) specCells.push(infoCell('كود الخامة', roll.fabric_code));
  if (has('lot_no') && roll.lot_no) specCells.push(infoCell('اللوت', roll.lot_no));
  while (specCells.length < 4) specCells.push(emptyInfoCell());

  return [{
    table: {
      widths: ['*', '*', '*', '*'],
      heights: [58, 29, 37, 31, 79],
      dontBreakRows: true,
      body: [
        [
          {
            colSpan: 4,
            stack: [
              {
                text: has('logo') ? 'رامكس' : '',
                fontSize: 25,
                bold: true,
                alignment: 'center' as const,
                lineHeight: 0.95,
              },
              {
                canvas: [{ type: 'line', x1: 0, y1: 0, x2: pageWidth - PAGE_MARGIN * 2 - 16, y2: 0, lineWidth: 0.5, lineColor: '#CCCCCC' }],
                margin: [8, 5, 8, 0] as PdfMargin,
              },
              {
                text: 'باركود',
                fontSize: 17,
                color: '#9CA3AF',
                bold: false,
                alignment: 'center' as const,
                margin: [0, 2, 0, 0] as PdfMargin,
              },
              {
                text: 'جاهز للمسح',
                fontSize: 7.5,
                color: '#666666',
                alignment: 'center' as const,
                margin: [0, 1, 0, 0] as PdfMargin,
              },
            ],
            margin: [8, 5, 8, 4] as PdfMargin,
          },
          emptySpanCell(),
          emptySpanCell(),
          emptySpanCell(),
        ],
        specCells.slice(0, 4),
        [
          { ...valueBlock('الخامة', fabricDisplay, 14), colSpan: 2 },
          emptySpanCell(),
          { ...valueBlock('اللون', colorDisplay || '—', 12.5), colSpan: 2 },
          emptySpanCell(),
        ],
        [
          {
            ...valueBlock('التركيب', roll.composition_description ?? '—', 11.5),
            colSpan: 4,
          },
          emptySpanCell(),
          emptySpanCell(),
          emptySpanCell(),
        ],
        [
          {
            ...barcodeBlock(imageKey, roll.internal_barcode),
            colSpan: 4,
          },
          emptySpanCell(),
          emptySpanCell(),
          emptySpanCell(),
        ],
      ],
    },
    layout: hairlineGrid,
    ...(pageBreak ? { pageBreak } : {}),
  }];
}

function infoCell(label: string, value: string): PdfNode {
  return {
    stack: [
      { text: label, fontSize: 6.8, color: '#666666', bold: false, alignment: 'center' as const },
      { text: value, fontSize: 9.2, bold: true, color: '#000000', alignment: 'center' as const, margin: [0, 1.5, 0, 0] as PdfMargin },
    ],
    margin: [5, 5, 5, 4] as PdfMargin,
  };
}

function emptyInfoCell(): PdfNode {
  return { text: '', margin: [5, 5, 5, 4] as PdfMargin };
}

function emptySpanCell(): PdfNode {
  return { text: '' };
}

function valueBlock(label: string, value: string, valueSize: number): PdfNode {
  return {
    stack: [
      { text: label, fontSize: 7.4, color: '#666666', bold: false },
      { text: value, fontSize: valueSize, bold: true, color: '#000000', alignment: 'center' as const, margin: [0, 1.5, 0, 0] as PdfMargin, lineHeight: 1.05 },
    ],
    margin: [8, 5.5, 8, 5] as PdfMargin,
  };
}

function barcodeBlock(imageKey: string, barcode: string): PdfNode {
  return {
    stack: [
      {
        image: imageKey,
        fit: BARCODE_FIT,
        alignment: 'center' as const,
        margin: [0, 2, 0, 3] as PdfMargin,
      },
      {
        text: barcode,
        fontSize: 9.5,
        bold: true,
        characterSpacing: 0.7,
        alignment: 'center' as const,
      },
    ],
    margin: [9, 5, 9, 4] as PdfMargin,
  };
}

function formatWeight(weightKg: string): string {
  const value = Number(weightKg);
  return `${Number.isFinite(value) ? value.toFixed(3) : weightKg} كجم`;
}

const hairlineGrid = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => '#BBBBBB',
  vLineColor: () => '#BBBBBB',
  paddingLeft: () => 0,
  paddingRight: () => 0,
  paddingTop: () => 0,
  paddingBottom: () => 0,
};

// ── Public API ──────────────────────────────────────────────────────────────

export async function buildSingleLabelPdf(roll: RollWithLabelDetails): Promise<Buffer> {
  ensureFonts();
  const [sizeRaw, fieldsRaw] = await Promise.all([
    getSetting<string>(undefined, 'barcode_label_size', DEFAULT_LABEL_SIZE),
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
    getSetting<string>(undefined, 'barcode_label_size', DEFAULT_LABEL_SIZE),
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
