import { describe, expect, it, vi } from 'vitest';
import type { RollWithLabelDetails } from '../../src/domain/items/items.types.js';

vi.mock('../../src/domain/settings/settings.service.js', () => ({
  getSetting: vi.fn(async <T>(_conn: unknown, _key: string, defaultValue: T) => defaultValue),
}));

const { buildSingleLabelPdf } = await import('../../src/lib/barcode/labelPdf.js');

function sampleRoll(): RollWithLabelDetails {
  return {
    id: 20,
    internal_barcode: 'RMX-R-000020',
    external_barcode: null,
    fabric_id: 1,
    color_id: 2,
    roll_sr_no: 'LT-000016',
    order_no: null,
    supplier_order_no: null,
    top_number: null,
    width_cm: 150,
    grade_id: null,
    composition_id: null,
    brand_id: null,
    weight_kg: '26.000',
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
    fabric_code: 'L-000001',
    fabric_name_ar: 'بوليمار',
    fabric_unit: 'kg',
    color_name_ar: 'الأخضر',
    color_code: '55',
    lot_no: '55',
    grade_arabic_name: null,
    gsm: null,
    mad_m: null,
    composition_description: '65% قطن / 35% بوليستر',
    brand_arabic_name: null,
    brand_product_line: null,
    supplier_arabic_name: null,
    supplier_arabic_warning_text: null,
    damage_context: null,
  };
}

describe('v2 - barcode label PDF render', () => {
  it('renders the 100x150mm label as one PDF page', async () => {
    const pdf = await buildSingleLabelPdf(sampleRoll());
    const pdfText = pdf.toString('latin1');

    expect(pdfText.match(/\/Type\s*\/Page\b/g)).toHaveLength(1);
  });
});
