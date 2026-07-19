import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { customersApi } from '@/lib/customers-api';
import { extractApiError } from '@/lib/api-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ResponsiveDialog';
import type { Customer } from '@/lib/customers-types';

type FormVals = {
  name_ar: string;
  phone: string;
  phone_secondary: string;
  address_ar: string;
  tax_no: string;
  notes_ar: string;
};

const EMPTY: FormVals = {
  name_ar: '', phone: '', phone_secondary: '', address_ar: '', tax_no: '', notes_ar: '',
};

/**
 * Shared create/edit customer form. Owns its own react-hook-form state and
 * mutation so it can be dropped into both the list page (inline create + edit)
 * and the detail page. Mirrors the supplier `SupplierFormDialog` pattern.
 */
export function CustomerFormDialog({
  open,
  onOpenChange,
  mode,
  customer,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  /** Required in edit mode — the customer being edited. */
  customer?: Customer | null;
  onSaved?: (saved: Customer) => void;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormVals>({ defaultValues: EMPTY });

  // Populate (edit) or clear (create) the form whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && customer) {
      form.reset({
        name_ar: customer.name_ar,
        phone: customer.phone,
        phone_secondary: customer.phone_secondary ?? '',
        address_ar: customer.address_ar ?? '',
        tax_no: customer.tax_no ?? '',
        notes_ar: customer.notes_ar ?? '',
      });
    } else {
      form.reset(EMPTY);
    }
    setError(null);
  }, [open, mode, customer, form]);

  const mut = useMutation({
    mutationFn: (v: FormVals) => {
      if (mode === 'edit' && customer) {
        return customersApi.update(customer.id, {
          name_ar: v.name_ar,
          phone: v.phone || undefined,
          phone_secondary: v.phone_secondary || null,
          address_ar: v.address_ar || null,
          tax_no: v.tax_no || null,
          notes_ar: v.notes_ar || null,
        });
      }
      return customersApi.create({
        name_ar: v.name_ar,
        phone: v.phone,
        phone_secondary: v.phone_secondary || null,
        address_ar: v.address_ar || null,
        tax_no: v.tax_no || null,
        notes_ar: v.notes_ar || null,
      });
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      if (mode === 'edit' && customer) {
        qc.invalidateQueries({ queryKey: ['customer', customer.id] });
        qc.invalidateQueries({ queryKey: ['customer-statement', customer.id] });
      }
      onSaved?.(saved);
      onOpenChange(false);
      setError(null);
    },
    onError: (e) => setError(extractApiError(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? ar.customers.edit : ar.customers.create}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mut.mutate(v))} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-sm font-medium text-foreground">
                {ar.customers.nameAr}
                <span className="text-danger ms-1" aria-hidden>*</span>
              </Label>
              <Input {...form.register('name_ar', { required: true })} dir="rtl" />
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-medium text-foreground">
                {ar.customers.phone}
                {mode === 'create' && <span className="text-danger ms-1" aria-hidden>*</span>}
              </Label>
              <Input
                {...form.register('phone', mode === 'create' ? { required: true } : {})}
                placeholder="01012345678"
                dir="ltr"
                inputMode="tel"
                autoComplete="tel"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-medium text-foreground">{ar.customers.phoneSecondary}</Label>
              <Input {...form.register('phone_secondary')} placeholder="01012345678" dir="ltr" inputMode="tel" autoComplete="tel" />
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-medium text-foreground">{ar.customers.taxNo}</Label>
              <Input {...form.register('tax_no')} dir="ltr" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-sm font-medium text-foreground">{ar.customers.address}</Label>
              <Input {...form.register('address_ar')} dir="rtl" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-sm font-medium text-foreground">{ar.customers.notes}</Label>
              <Input {...form.register('notes_ar')} dir="rtl" />
            </div>
          </div>
          {error && (
            <p className="text-sm text-danger transition-opacity duration-75 ease-standard" role="alert">
              {error}
            </p>
          )}
          <div className="flex gap-2 justify-end">
            <DialogClose asChild>
              <Button type="button" variant="outline">{ar.common.cancel}</Button>
            </DialogClose>
            <Button type="submit" disabled={mut.isPending}>{ar.common.save}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
