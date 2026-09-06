export type RollSaleUnit = 'kg' | 'meter';

export type RollQuantitySource = {
  fabric_unit: RollSaleUnit;
  weight_kg: string | number | null;
  length_m: string | number | null;
};

export type ResolvedRollSaleQuantity = {
  quantity: number;
  unit: RollSaleUnit;
};

/**
 * Resolve the quantity used to price and sell one complete roll.
 *
 * `length_m` and `weight_kg` are independent physical measurements. The
 * fabric's configured sale unit decides which one participates in the sale;
 * the other value remains metadata and must never be substituted for it.
 */
export function resolveRollSaleQuantity(
  source: RollQuantitySource,
): ResolvedRollSaleQuantity {
  const raw = source.fabric_unit === 'meter' ? source.length_m : source.weight_kg;
  if (raw == null) {
    throw new Error(source.fabric_unit === 'meter' ? 'ROLL_LENGTH_MISSING' : 'ROLL_WEIGHT_MISSING');
  }

  const quantity = Number(raw);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error(source.fabric_unit === 'meter' ? 'ROLL_LENGTH_MISSING' : 'ROLL_WEIGHT_MISSING');
  }

  return { quantity, unit: source.fabric_unit };
}

export type InvoiceRollQuantitySource = RollQuantitySource & {
  sold_quantity: string | number | null;
  sold_unit: RollSaleUnit | null;
};

/** Uses the immutable invoice-line snapshot, with direct roll data only for legacy rows. */
export function resolveInvoiceRollQuantity(
  source: InvoiceRollQuantitySource,
): ResolvedRollSaleQuantity {
  if (source.sold_quantity != null && source.sold_unit != null) {
    const quantity = Number(source.sold_quantity);
    if (Number.isFinite(quantity) && quantity > 0) {
      return { quantity, unit: source.sold_unit };
    }
  }

  return resolveRollSaleQuantity(source);
}

export function formatInvoiceRollQuantityAr(source: InvoiceRollQuantitySource): string {
  const { quantity, unit } = resolveInvoiceRollQuantity(source);
  return `${quantity.toFixed(3)} ${unit === 'meter' ? 'متر' : 'كجم'}`;
}
