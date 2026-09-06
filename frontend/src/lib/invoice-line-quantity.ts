export type InvoiceQuantityUnit = 'kg' | 'meter' | 'piece';

export type InvoiceQuantityLine = {
  item_type: 'roll' | 'accessory';
  qty_pieces: number | null;
  sold_quantity: string | number | null;
  sold_unit: 'kg' | 'meter' | null;
  fabric_unit: 'kg' | 'meter' | null;
  weight_kg: string | number | null;
  length_m: string | number | null;
};

export type ResolvedInvoiceLineQuantity = {
  quantity: number;
  unit: InvoiceQuantityUnit;
};

/**
 * Read the immutable sale snapshot. Raw roll measurements are only a legacy
 * fallback for invoices created before the snapshot columns existed.
 */
export function invoiceLineQuantity(
  line: InvoiceQuantityLine,
): ResolvedInvoiceLineQuantity {
  if (line.item_type === 'accessory') {
    return { quantity: Number(line.qty_pieces ?? 0), unit: 'piece' };
  }

  if (line.sold_quantity != null && line.sold_unit != null) {
    return { quantity: Number(line.sold_quantity), unit: line.sold_unit };
  }

  if (line.fabric_unit === 'meter') {
    return { quantity: Number(line.length_m ?? 0), unit: 'meter' };
  }
  return { quantity: Number(line.weight_kg ?? 0), unit: 'kg' };
}

export function invoiceLineQuantityLabel(line: InvoiceQuantityLine): string {
  const { quantity, unit } = invoiceLineQuantity(line);
  if (unit === 'piece') return `${quantity} قطعة`;
  return `${quantity.toFixed(3)} ${unit === 'meter' ? 'متر' : 'كجم'}`;
}
