import type { Knex } from 'knex';

export async function seed(db: Knex): Promise<void> {
  if (process.env.NODE_ENV === 'production') return;

  // Idempotent: skip if sample data already present
  const exists = await db('colors').where({ code: '101' }).first();
  if (exists) return;

  const [colorId1] = await db('colors').insert({ name_ar: 'أبيض', code: '101' });
  const [colorId2] = await db('colors').insert({ name_ar: 'أسود', code: '201' });

  const [fabricId] = await db('fabrics').insert({
    code: 'MILTON-P8',
    name_ar: 'ميلتون P8',
    composition: JSON.stringify([{ material: 'قطن', percent: 100 }]),
    width_cm: 150.00,
    grade: '1K',
    notes: null,
    is_active: true,
  });

  await db('fabric_color_prices').insert([
    {
      fabric_id: fabricId,
      color_id: colorId1,
      default_price_per_kg: 120.00,
      default_price_per_roll: null,
    },
    {
      fabric_id: fabricId,
      color_id: colorId2,
      default_price_per_kg: 125.00,
      default_price_per_roll: null,
    },
  ]);
}
