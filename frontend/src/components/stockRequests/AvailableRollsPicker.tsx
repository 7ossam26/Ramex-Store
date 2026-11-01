import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { inventoryApi } from '@/lib/inventory-api';
import { stockRequestsApi } from '@/lib/stock-requests-api';
import type { AvailableRoll } from '@/lib/stock-requests-types';
import { rollQtyLabel } from '@/lib/fabric-unit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';

type Props = {
  selectedIds: Set<number>;
  onToggle: (roll: AvailableRoll) => void;
  initialFabricId?: number | null;
  initialColorId?: number | null;
};

/**
 * Factory tops the shop may request: in the factory, in stock, not reserved by
 * another request, and shippable. Filters by material / colour / free text.
 */
export function AvailableRollsPicker({ selectedIds, onToggle, initialFabricId = null, initialColorId = null }: Props) {
  const [fabricFilter, setFabricFilter] = useState<number | null>(initialFabricId);
  const [colorFilter, setColorFilter] = useState<number | null>(initialColorId);
  const [searchTerm, setSearchTerm] = useState('');

  const fabricsQ = useQuery({ queryKey: ['fabrics', 'all'], queryFn: () => inventoryApi.listFabrics('all') });
  const colorsQ = useQuery({ queryKey: ['colors'], queryFn: inventoryApi.listColors });
  const rollsQ = useQuery({
    queryKey: ['stock-request-available', fabricFilter, colorFilter, searchTerm],
    queryFn: () =>
      stockRequestsApi.availableRolls({
        fabric_id: fabricFilter ?? undefined,
        color_id: colorFilter ?? undefined,
        q: searchTerm.trim() || undefined,
      }),
  });

  const selectClass = 'w-full h-10 rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-sm font-medium text-foreground">{ar.shipments.filterByFabric}</Label>
          <SearchableSelect
            value={fabricFilter === null ? '' : String(fabricFilter)}
            onChange={(e) => setFabricFilter(e.target.value ? Number(e.target.value) : null)}
            className={selectClass}
          >
            <option value="">—</option>
            {fabricsQ.data?.map((f) => (
              <option key={f.id} value={f.id}>{f.name_ar}</option>
            ))}
          </SearchableSelect>
        </div>
        <div className="space-y-1">
          <Label className="text-sm font-medium text-foreground">{ar.shipments.filterByColor}</Label>
          <SearchableSelect
            value={colorFilter === null ? '' : String(colorFilter)}
            onChange={(e) => setColorFilter(e.target.value ? Number(e.target.value) : null)}
            className={selectClass}
          >
            <option value="">—</option>
            {colorsQ.data?.map((c) => (
              <option key={c.id} value={c.id}>{c.name_ar} ({c.code})</option>
            ))}
          </SearchableSelect>
        </div>
        <div className="space-y-1">
          <Label className="text-sm font-medium text-foreground">{ar.shipments.searchPlaceholder}</Label>
          <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder={ar.shipments.searchPlaceholder} />
        </div>
      </div>

      {rollsQ.isLoading ? (
        <p className="text-sm text-foreground-muted py-2">{ar.loading}</p>
      ) : (rollsQ.data ?? []).length === 0 ? (
        <p className="text-sm text-foreground-muted py-2">{ar.stockRequests.noAvailable}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-start text-xs text-foreground-muted uppercase tracking-wide">
              <tr className="border-b border-border-subtle">
                <th className="py-2.5 font-medium text-start">{ar.stockMovements.rollBarcode}</th>
                <th className="font-medium text-start">{ar.shipments.rollFabric}</th>
                <th className="font-medium text-start">{ar.shipments.rollColor}</th>
                <th className="font-medium text-start">{ar.shipments.rollWeight}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rollsQ.data!.map((r) => {
                const picked = selectedIds.has(Number(r.id));
                return (
                  <tr
                    key={r.id}
                    className="border-b border-border-subtle last:border-0 even:bg-surface-row-alt/60 hover:bg-surface-hover transition-colors duration-150"
                  >
                    <td className="py-2.5 font-mono tabular-num text-foreground" dir="ltr">{r.internal_barcode}</td>
                    <td>{r.fabric_name_ar}</td>
                    <td>{r.color_name_ar}{r.color_code ? ` (${r.color_code})` : ''}</td>
                    <td className="tabular-num" dir="ltr">{rollQtyLabel(r.weight_kg, r.length_m)}</td>
                    <td className="text-end">
                      <Button size="sm" variant={picked ? 'outline' : 'default'} onClick={() => onToggle(r)}>
                        {picked ? ar.stockRequests.selected : ar.stockRequests.select}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
