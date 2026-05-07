import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { itemsApi } from '@/lib/items-api';
import type { RollWithDetails } from '@/lib/items-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const statusColors: Record<string, string> = {
  in_stock: 'bg-green-100 text-green-800',
  reserved: 'bg-yellow-100 text-yellow-800',
  sold: 'bg-gray-100 text-gray-600',
  damaged: 'bg-red-100 text-red-800',
  sample: 'bg-blue-100 text-blue-800',
  returned: 'bg-purple-100 text-purple-800',
  written_off: 'bg-gray-100 text-gray-500',
};

function fmtMoney(n: string | number) {
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function RollsPage() {
  const [filters, setFilters] = useState({ fabric: '', color: '', rollSrNo: '', barcodePartial: '' });
  const [applied, setApplied] = useState<typeof filters>({ fabric: '', color: '', rollSrNo: '', barcodePartial: '' });
  const [detail, setDetail] = useState<RollWithDetails | null>(null);

  const q = useQuery({
    queryKey: ['rolls-search', applied],
    queryFn: () =>
      itemsApi.searchRolls({
        fabric: applied.fabric || undefined,
        color: applied.color || undefined,
        rollSrNo: applied.rollSrNo || undefined,
        barcodePartial: applied.barcodePartial || undefined,
      }),
  });

  const rolls = q.data ?? [];

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{ar.labels.rollsTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label>{ar.labels.fabricFilter}</Label>
              <Input
                value={filters.fabric}
                onChange={(e) => setFilters((f) => ({ ...f, fabric: e.target.value }))}
                placeholder={ar.labels.fabricFilter}
                dir="rtl"
              />
            </div>
            <div className="space-y-1">
              <Label>{ar.labels.colorFilter}</Label>
              <Input
                value={filters.color}
                onChange={(e) => setFilters((f) => ({ ...f, color: e.target.value }))}
                placeholder={ar.labels.colorFilter}
                dir="rtl"
              />
            </div>
            <div className="space-y-1">
              <Label>{ar.labels.rollSrNoFilter}</Label>
              <Input
                value={filters.rollSrNo}
                onChange={(e) => setFilters((f) => ({ ...f, rollSrNo: e.target.value }))}
                dir="ltr"
              />
            </div>
            <div className="space-y-1">
              <Label>{ar.labels.barcodeFilter}</Label>
              <Input
                value={filters.barcodePartial}
                onChange={(e) => setFilters((f) => ({ ...f, barcodePartial: e.target.value }))}
                dir="ltr"
              />
            </div>
          </div>
          <Button onClick={() => setApplied({ ...filters })} disabled={q.isFetching}>
            {q.isFetching ? ar.loading : ar.labels.search}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">{ar.labels.results}: {rolls.length}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rolls.length === 0 ? (
            <p className="text-center text-muted-foreground p-6">{ar.common.none}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-right text-xs text-muted-foreground border-b border-border">
                <tr>
                  <th className="p-2">{ar.labels.rollSrNoFilter}</th>
                  <th className="p-2">{ar.labels.fabricFilter}</th>
                  <th className="p-2">{ar.labels.colorFilter}</th>
                  <th className="p-2">{ar.labels.barcode}</th>
                  <th className="p-2">{ar.labels.weight}</th>
                  <th className="p-2">{ar.labels.status}</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {rolls.map((roll) => (
                  <tr
                    key={roll.id}
                    className="border-b border-border hover:bg-muted/30 cursor-pointer"
                    onClick={() => setDetail(roll)}
                  >
                    <td className="p-2 font-mono text-xs">{roll.roll_sr_no ?? '—'}</td>
                    <td className="p-2">{roll.fabric_name_ar}</td>
                    <td className="p-2">{roll.color_name_ar}</td>
                    <td className="p-2 font-mono text-xs" dir="ltr">{roll.internal_barcode}</td>
                    <td className="p-2" dir="ltr">{Number(roll.weight_kg).toFixed(3)} kg</td>
                    <td className="p-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-xs ${statusColors[roll.status] ?? 'bg-gray-100 text-gray-600'}`}
                      >
                        {ar.rollStatuses[roll.status as keyof typeof ar.rollStatuses] ?? roll.status}
                      </span>
                    </td>
                    <td className="p-2" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="outline" asChild>
                        <a
                          href={itemsApi.labelPdfUrl(roll.id)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {ar.labels.print}
                        </a>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Roll detail drawer */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{ar.labels.rollDetail}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground">{ar.labels.fabricFilter}: </span>
                  <span className="font-medium">{detail.fabric_name_ar}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{ar.labels.colorFilter}: </span>
                  <span className="font-medium">{detail.color_name_ar}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{ar.labels.rollSrNoFilter}: </span>
                  <span className="font-mono">{detail.roll_sr_no ?? '—'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{ar.labels.weight}: </span>
                  <span dir="ltr">{Number(detail.weight_kg).toFixed(3)} kg</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{ar.labels.barcode}: </span>
                  <span className="font-mono text-xs" dir="ltr">{detail.internal_barcode}</span>
                </div>
                {detail.external_barcode && (
                  <div>
                    <span className="text-muted-foreground">{ar.labels.externalBarcode}: </span>
                    <span className="font-mono text-xs" dir="ltr">{detail.external_barcode}</span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">{ar.labels.status}: </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-xs ${statusColors[detail.status] ?? 'bg-gray-100 text-gray-600'}`}
                  >
                    {ar.rollStatuses[detail.status as keyof typeof ar.rollStatuses] ?? detail.status}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">السعر: </span>
                  <span dir="ltr">{fmtMoney(detail.selling_price_egp)} ج.م/كجم</span>
                </div>
              </div>
              <div className="pt-2 border-t border-border">
                <Button asChild className="w-full">
                  <a href={itemsApi.labelPdfUrl(detail.id)} target="_blank" rel="noreferrer">
                    🖨️ {ar.labels.printLabel}
                  </a>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
