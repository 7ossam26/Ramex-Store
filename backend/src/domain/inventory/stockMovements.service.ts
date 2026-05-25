import { db } from '../../db/connection.js';
import type { StockMovement } from './inventory.types.js';
import type { StockMovementsQueryInput } from './inventory.schemas.js';

export type StockMovementWithRoll = StockMovement & {
  internal_barcode: string;
  fabric_name_ar: string;
  color_name_ar: string;
};

export async function listStockMovements(
  filters: StockMovementsQueryInput,
): Promise<{ rows: StockMovementWithRoll[]; total: number }> {
  const base = db('stock_movements as sm')
    .join('rolls as r', 'sm.roll_id', 'r.id')
    .join('fabrics as f', 'r.fabric_id', 'f.id')
    .join('colors as c', 'r.color_id', 'c.id');

  if (filters.roll_id !== undefined) base.where('sm.roll_id', filters.roll_id);
  if (filters.event_type !== undefined) base.where('sm.event_type', filters.event_type);
  if (filters.barcode !== undefined) base.whereILike('r.internal_barcode', `%${filters.barcode}%`);
  if (filters.reference_type !== undefined) base.where('sm.reference_type', filters.reference_type);
  if (filters.reference_id !== undefined) base.where('sm.reference_id', filters.reference_id);
  if (filters.from_date !== undefined) base.where('sm.created_at', '>=', filters.from_date);
  if (filters.to_date !== undefined) base.where('sm.created_at', '<=', filters.to_date);

  const totalQ = base.clone().clearSelect().clearOrder().count<{ count: string }[]>('* as count');
  const rowsQ = base
    .clone()
    .select(
      'sm.*',
      'r.internal_barcode',
      'f.name_ar as fabric_name_ar',
      'c.name_ar as color_name_ar',
    )
    .orderBy('sm.id', 'desc')
    .limit(filters.limit)
    .offset(filters.offset);

  const [totalResult, rows] = await Promise.all([totalQ, rowsQ]);
  return {
    rows: rows as StockMovementWithRoll[],
    total: Number(totalResult[0]?.count ?? 0),
  };
}
