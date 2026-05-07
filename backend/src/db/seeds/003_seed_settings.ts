import type { Knex } from 'knex';

const PHASE_2_DEFAULTS: Array<{ key: string; value: unknown }> = [
  { key: 'approval_threshold_egp', value: 5000 },
  { key: 'day_rollover_time', value: '00:00' },
  {
    key: 'damage_reason_codes',
    value: [
      { code: 'damage_in_transit', label_ar: 'تلف أثناء النقل' },
      { code: 'damage_in_shop', label_ar: 'تلف داخل المحل' },
      { code: 'damage_quality_defect', label_ar: 'عيب في الجودة' },
      { code: 'loss_theft', label_ar: 'سرقة' },
      { code: 'loss_misplaced', label_ar: 'فقد / مكان مجهول' },
      { code: 'inventory_discrepancy', label_ar: 'فرق جرد' },
      { code: 'cutting_sample_loss', label_ar: 'فقد قص / عينة' },
      { code: 'other', label_ar: 'أخرى' },
    ],
  },
];

export async function seed(db: Knex): Promise<void> {
  for (const { key, value } of PHASE_2_DEFAULTS) {
    const exists = await db('settings').where({ key }).first();
    if (exists) continue;
    await db('settings').insert({
      key,
      value_json: JSON.stringify(value),
      updated_by_user_id: null,
    });
  }
}
