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
const PAGE_MARGIN = 8;
const BARCODE_FIT: [number, number] = [240, 95];
const LEGACY_COMPACT_LABEL_SIZE = '50x30mm';

const DEFAULT_FIELDS = [
  'logo', 'roll_sr_no', 'fabric_name', 'color_name',
  'barcode', 'fabric_code', 'color_code', 'weight', 'gsm', 'mad_m', 'lot_no',
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

  // pdfmake renders Arabic words in source order (no bidi pass), so multi-word
  // labels must be written with words reversed to read correctly RTL.
  const specCells: PdfNode[] = [
    infoCell('الوزن', has('weight') && roll.weight_kg ? formatWeight(roll.weight_kg) : '—'),
    infoCell('الخامة كود', has('fabric_code') && roll.fabric_code ? roll.fabric_code : '—'),
    infoCell('العرض', roll.width_cm ? `${roll.width_cm} سم` : '—'),
    infoCell('اللوط رقم', has('lot_no') && roll.lot_no ? roll.lot_no : '—'),
  ];

  return [{
    table: {
      widths: [66.5, 66.5, 66.5, 66.5],
      heights: [45, 45, 65, 50, 145],
      dontBreakRows: true,
      body: [
        [
          {
            colSpan: 4,
            stack: [
              {
                text: has('logo') ? 'RMX' : '',
                fontSize: 26,
                bold: true,
                alignment: 'center' as const,
                lineHeight: 0.95,
                margin: [0, 4, 0, 0] as PdfMargin,
              },
            ],
            margin: [8, 6, 8, 6] as PdfMargin,
          },
          emptySpanCell(),
          emptySpanCell(),
          emptySpanCell(),
        ],
        specCells,
        [
          { ...valueBlock('الخامة', fabricDisplay, 15), colSpan: 2 },
          emptySpanCell(),
          { ...valueBlock('اللون', colorDisplay || '—', 13), colSpan: 2 },
          emptySpanCell(),
        ],
        [
          { ...valueBlock('GSM', roll.gsm != null ? `${roll.gsm} جرام` : '—', 11), colSpan: 2 },
          emptySpanCell(),
          { ...valueBlock('المد', roll.mad_m != null ? `${roll.mad_m} متر` : '—', 11), colSpan: 2 },
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
      { text: label, fontSize: 8, color: '#000000', bold: false, alignment: 'center' as const },
      { text: value, fontSize: 11, bold: true, color: '#000000', alignment: 'center' as const, margin: [0, 3, 0, 0] as PdfMargin },
    ],
    margin: [5, 6, 5, 5] as PdfMargin,
  };
}

function emptyInfoCell(): PdfNode {
  return { text: '', margin: [5, 6, 5, 5] as PdfMargin };
}

function emptySpanCell(): PdfNode {
  return { text: '' };
}

function valueBlock(label: string, value: string, valueSize: number): PdfNode {
  return {
    stack: [
      { text: label, fontSize: 8.5, color: '#000000', bold: false, alignment: 'center' as const },
      { text: value, fontSize: valueSize, bold: true, color: '#000000', alignment: 'center' as const, margin: [0, 4, 0, 0] as PdfMargin, lineHeight: 1.05 },
    ],
    margin: [8, 9, 8, 8] as PdfMargin,
  };
}

function barcodeBlock(imageKey: string, barcode: string): PdfNode {
  return {
    stack: [
      {
        image: imageKey,
        fit: BARCODE_FIT,
        alignment: 'center' as const,
        margin: [0, 3, 0, 3] as PdfMargin,
      },
      {
        text: barcode,
        fontSize: 11,
        bold: true,
        characterSpacing: 0.7,
        alignment: 'center' as const,
        margin: [0, 4, 0, 0] as PdfMargin,
      },
    ],
    margin: [9, 10, 9, 8] as PdfMargin,
  };
}

function formatWeight(weightKg: string): string {
  const value = Number(weightKg);
  return `${Number.isFinite(value) ? value.toFixed(3) : weightKg} كجم`;
}

const hairlineGrid = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => '#000000',
  vLineColor: () => '#000000',
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
