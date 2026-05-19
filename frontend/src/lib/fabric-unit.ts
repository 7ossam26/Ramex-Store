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
