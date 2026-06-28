import type { FabricUnit } from './inventory-types';

// Arabic unit suffix used after monetary amounts.
// kg-fabrics: «ج.م/كجم» ; meter-fabrics: «ج.م/م».
export function priceUnitLabel(input: FabricUnit | { unit: FabricUnit }): string {
  const unit: FabricUnit = typeof input === 'string' ? input : input.unit;
  return unit === 'meter' ? 'م' : 'كجم';
}

export function quantityUnitLabel(input: FabricUnit | { unit: FabricUnit }): string {
  return priceUnitLabel(input);
}

export function rollQtyLabel(weight_kg: string | null, length_m: string | null): string {
  if (weight_kg != null) return `${Number(weight_kg).toFixed(3)} kg`;
  if (length_m != null) return `${Number(length_m).toFixed(2)} م`;
  return '—';
}
