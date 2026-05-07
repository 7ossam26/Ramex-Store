import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { ar } from '@/i18n/ar';
import { customersApi } from '@/lib/customers-api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ResponsiveDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Customer } from '@/lib/customers-types';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (customer: Customer) => void;
};

type FormVals = { name_ar: string; phone: string };

export function QuickCreateModal({ open, onOpenChange, onCreated }: Props) {
  const qc = useQueryClient();
  const form = useForm<FormVals>({ defaultValues: { name_ar: '', phone: '' } });

  const create = useMutation({
    mutationFn: (v: FormVals) => customersApi.quickCreate(v),
    onSuccess: (customer) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      form.reset();
      onOpenChange(false);
      onCreated?.(customer);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ar.customers.quickCreate}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((v) => create.mutate(v))}
          className="space-y-3"
        >
          <div className="space-y-1">
            <Label>{ar.customers.nameAr}</Label>
            <Input
              {...form.register('name_ar', { required: true })}
              placeholder={ar.customers.nameAr}
              dir="rtl"
            />
          </div>
          <div className="space-y-1">
            <Label>{ar.customers.phone}</Label>
            <Input
              {...form.register('phone', { required: true })}
              placeholder="01012345678"
              dir="ltr"
              inputMode="tel"
              autoComplete="tel"
            />
            {create.error && (
              <p className="text-sm text-red-600">
                {(create.error as { response?: { data?: { message?: string } } })?.response?.data
                  ?.message ?? ar.common.error}
              </p>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {ar.common.cancel}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={create.isPending}>
              {ar.common.save}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
