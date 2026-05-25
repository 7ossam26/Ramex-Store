import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RollWithLabelDetails } from '../../src/domain/items/items.types.js';

const MM_TO_PT = 2.8346;

const pdfMock = vi.hoisted(() => ({
  definitions: [] as Record<string, unknown>[],
  setFonts: vi.fn(),
  setLocalAccessPolicy: vi.fn(),
  setUrlAccessPolicy: vi.fn(),
  createPdf: vi.fn((definition: Record<string, unknown>) => {
    pdfMock.definitions.push(definition);
    return { getBuffer: async () => Buffer.from('pdf') };
  }),
}));

const settingsMock = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
}));

vi.mock('pdfmake', () => ({ default: pdfMock }));
vi.mock('bwip-js/node', () => ({
  default: { toBuffer: vi.fn(async () => Buffer.from('barcode')) },
}));
vi.mock('../../src/domain/settings/settings.service.js', () => ({
  getSetting: vi.fn(async <T>(_conn: unknown, key: string, defaultValue: T) => (
    settingsMock.values.has(key) ? settingsMock.values.get(key) as T : defaultValue
  )),
}));

const { buildSingleLabelPdf } = await import('../../src/lib/barcode/labelPdf.js');

function sampleRoll(): RollWithLabelDetails {
  return {
    id: 7,
    internal_barcode: 'RMX-0000007',
    external_barcode: null,
    fabric_id: 1,
    color_id: 2,
    roll_sr_no: 'SR-1007',
    order_no: null,
    supplier_order_no: null,
    top_number: null,
    width_cm: 150,
    grade_id: null,
    composition_id: null,
    brand_id: null,
    weight_kg: '18.250',
    length_m: null,
    lot_id: null,
    reference_price_per_unit: null,
    selling_price_egp: '0',
    status: 'in_stock',
    warehouse: 'factory',
    is_visible_at_pos: true,
    received_at: null,
    created_at: new Date('2026-05-25T10:00:00Z'),
    updated_at: new Date('2026-05-25T10:00:00Z'),
    fabric_code: 'LIN-15',
    fabric_name_ar: 'كتان فاخر',
    fabric_unit: 'kg',
    color_name_ar: 'أخضر زيتوني',
    color_code: 'OLV-8',
    lot_no: 'LOT-42',
    grade_arabic_name: 'أولى',
    composition_description: '65% قطن / 35% بوليستر',
    brand_arabic_name: null,
    brand_product_line: null,
    supplier_arabic_name: null,
    supplier_arabic_warning_text: null,
  };
}

function collectText(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectText);
  if (!value || typeof value !== 'object') return [];

  const node = value as Record<string, unknown>;
  const ownText = collectText(node.text);
  const childText = Object.entries(node)
    .filter(([key]) => key !== 'text')
    .flatMap(([, child]) => collectText(child));
  return [...ownText, ...childText];
}

function collectNodes(value: unknown, predicate: (node: Record<string, unknown>) => boolean): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap((item) => collectNodes(item, predicate));
  if (!value || typeof value !== 'object') return [];

  const node = value as Record<string, unknown>;
  const matches = predicate(node) ? [node] : [];
  const childMatches = Object.values(node).flatMap((child) => collectNodes(child, predicate));
  return [...matches, ...childMatches];
}

describe('v2 - modern barcode label PDF', () => {
  beforeEach(() => {
    pdfMock.definitions.length = 0;
    settingsMock.values.clear();
    vi.clearAllMocks();
  });

  it('uses the 100x150mm printer layout and keeps fabric composition visible', async () => {
    settingsMock.values.set('barcode_label_fields', ['fabric', 'color', 'weight', 'barcode']);

    await buildSingleLabelPdf(sampleRoll());

    const definition = pdfMock.definitions[0];
    expect(definition).toBeDefined();
    expect(definition.pageSize).toEqual({
      width: 100 * MM_TO_PT,
      height: 150 * MM_TO_PT,
    });
    expect(definition.pageMargins).toEqual([8, 8, 8, 8]);
    expect(definition.defaultStyle).toMatchObject({ font: 'Cairo' });

    expect(definition.content).toHaveLength(1);
    expect((definition.content as Array<Record<string, unknown>>)[0].table).toMatchObject({
      dontBreakRows: true,
    });

    const barcodeImages = collectNodes(definition.content, (node) => node.image === 'barcodeImg');
    expect(barcodeImages).toHaveLength(1);
    expect(barcodeImages[0]).toMatchObject({
      fit: [235, 75],
    });

    const text = collectText(definition.content).join(' ');
    expect(text).toContain('رامكس');
    expect(text).toContain('العرض');
    expect(text).toContain('رقم اللوت');
    expect(text).toContain('كتان فاخر');
    expect(text).toContain('أخضر زيتوني');
    expect(text).toContain('التركيب');
    expect(text).toContain('65% قطن / 35% بوليستر');
  });

  it('upgrades the legacy 50x30mm stored size to the printer paper layout', async () => {
    settingsMock.values.set('barcode_label_size', '50x30mm');

    await buildSingleLabelPdf(sampleRoll());

    expect(pdfMock.definitions[0]?.pageSize).toEqual({
      width: 100 * MM_TO_PT,
      height: 150 * MM_TO_PT,
    });
  });
});
