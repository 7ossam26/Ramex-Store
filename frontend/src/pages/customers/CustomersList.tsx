import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router-dom';
import { ar } from '@/i18n/ar';
import { customersApi } from '@/lib/customers-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import type { Customer } from '@/lib/customers-types';

const PAGE_SIZE = 30;

function balanceColor(balance: string) {
  const n = Number(balance);
  if (n < 0) return 'text-red-600';
  if (n > 0) return 'text-green-600';
  return 'text-muted-foreground';
}

function balanceLabel(balance: string) {
  const n = Number(balance);
  const formatted = Math.abs(n).toLocaleString('ar-EG-u-nu-latn', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n < 0) return `${formatted} ${ar.customers.balanceDebt}`;
  if (n > 0) return `${formatted} ${ar.customers.balanceCredit}`;
  return '0.00';
}

type CreateFormVals = {
  name_ar: string;
  phone: string;
  phone_secondary: string;
  address_ar: string;
  tax_no: string;
  notes_ar: string;
};

export function CustomersListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(searchParams.get('create') === '1');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search, page],
    queryFn: () => customersApi.list({ search: search || undefined, page, limit: PAGE_SIZE }),
  });

  const form = useForm<CreateFormVals>({
    defaultValues: { name_ar: '', phone: '', phone_secondary: '', address_ar: '', tax_no: '', notes_ar: '' },
  });

  const create = useMutation({
    mutationFn: (v: CreateFormVals) =>
      customersApi.create({
        name_ar: v.name_ar,
        phone: v.phone,
        phone_secondary: v.phone_secondary || null,
        address_ar: v.address_ar || null,
        tax_no: v.tax_no || null,
        notes_ar: v.notes_ar || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      form.reset();
      setCreateOpen(false);
      setSearchParams({});
    },
  });

  const openCreate = useCallback(() => {
    setCreateOpen(true);
    setSearchParams({ create: '1' });
  }, [setSearchParams]);

  const closeCreate = useCallback((open: boolean) => {
    setCreateOpen(open);
    if (!open) setSearchParams({});
  }, [setSearchParams]);

  const rows: Customer[] = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{ar.customers.title}</h1>
        <Button onClick={openCreate}>{ar.customers.addCustomer}</Button>
      </div>

      {/* Search */}
      <div className="max-w-sm">
        <Input
          placeholder={ar.customers.search}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          dir="rtl"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-4 text-center text-muted-foreground">{ar.loading}</p>
          ) : rows.length === 0 ? (
            <p className="p-4 text-center text-muted-foreground">{ar.customers.empty}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-right text-xs text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-4 py-3">{ar.customers.customerCode}</th>
                  <th className="px-4 py-3">{ar.customers.nameAr}</th>
                  <th className="px-4 py-3">{ar.customers.phone}</th>
                  <th className="px-4 py-3">{ar.customers.lifetimeVolume}</th>
                  <th className="px-4 py-3">{ar.customers.currentBalance}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t border-border hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs">{c.customer_code}</td>
                    <td className="px-4 py-3">
                      <Link to={`/customers/${c.id}`} className="text-primary hover:underline font-medium">
                        {c.name_ar}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono" dir="ltr">{c.phone}</td>
                    <td className="px-4 py-3">
                      {Number(c.lifetime_volume_egp).toLocaleString('ar-EG-u-nu-latn', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })} ج.م
                    </td>
                    <td className={`px-4 py-3 font-medium ${balanceColor(c.current_balance_egp)}`}>
                      {balanceLabel(c.current_balance_egp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            السابق
          </Button>
          <span className="text-sm text-muted-foreground">
            صفحة {page} من {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            التالي
          </Button>
        </div>
      )}

      {/* Create customer dialog */}
      <Dialog open={createOpen} onOpenChange={closeCreate}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{ar.customers.create}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{ar.customers.nameAr} *</Label>
                <Input {...form.register('name_ar', { required: true })} dir="rtl" />
              </div>
              <div className="space-y-1">
                <Label>{ar.customers.phone} *</Label>
                <Input {...form.register('phone', { required: true })} placeholder="01012345678" dir="ltr" />
              </div>
              <div className="space-y-1">
                <Label>{ar.customers.phoneSecondary}</Label>
                <Input {...form.register('phone_secondary')} placeholder="01012345678" dir="ltr" />
              </div>
              <div className="space-y-1">
                <Label>{ar.customers.taxNo}</Label>
                <Input {...form.register('tax_no')} dir="ltr" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>{ar.customers.address}</Label>
                <Input {...form.register('address_ar')} dir="rtl" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>{ar.customers.notes}</Label>
                <Input {...form.register('notes_ar')} dir="rtl" />
              </div>
            </div>
            {create.error && (
              <p className="text-sm text-red-600">
                {(create.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? ar.common.error}
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <DialogClose asChild>
                <Button type="button" variant="outline">{ar.common.cancel}</Button>
              </DialogClose>
              <Button type="submit" disabled={create.isPending}>{ar.common.save}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
