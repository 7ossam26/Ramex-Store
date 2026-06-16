import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { hrApi, type HrEmployee } from '@/lib/hr-api';
import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Toggle } from '@/components/Toggle';
import { cn } from '@/lib/utils';
import { extractApiError } from '@/lib/api-error';
import { HrDialog } from './HrDialog';
import { inputCls } from './utils';

type FormData = {
  name_ar: string;
  phone: string;
  role_ar: string;
  base_salary_egp: string;
  is_active: boolean;
};

/** Create (employee=null) or edit an employee in a modal. */
export function EmployeeFormDialog({
  employee,
  onClose,
  onDone,
}: {
  employee: HrEmployee | null;
  onClose: () => void;
  onDone: (saved: HrEmployee) => void;
}) {
  const isEdit = employee !== null;
  const [form, setForm] = useState<FormData>({
    name_ar: employee?.name_ar ?? '',
    phone: employee?.phone ?? '',
    role_ar: employee?.role_ar ?? '',
    base_salary_egp: employee?.base_salary_egp ?? '',
    is_active: employee?.is_active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();

  const field = (key: keyof FormData, val: string | boolean) =>
    setForm((f) => ({ ...f, [key]: val }));

  const mut = useMutation({
    mutationFn: () => {
      const payload = {
        name_ar: form.name_ar.trim(),
        phone: form.phone.trim() || null,
        role_ar: form.role_ar.trim() || null,
        base_salary_egp: Number(form.base_salary_egp) || 0,
      };
      return isEdit
        ? hrApi.updateEmployee(employee!.id, { ...payload, is_active: form.is_active })
        : hrApi.createEmployee(payload);
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['hr-employees'] });
      qc.invalidateQueries({ queryKey: ['hr-employee', saved.id] });
      onDone(saved);
    },
    onError: (e) => setError(extractApiError(e)),
  });

  return (
    <HrDialog title={isEdit ? ar.hr.employee.editEmployee : ar.hr.employee.createTitle} onClose={onClose}>
      <div className="space-y-4">
        {error && <ErrorBanner title={ar.common.error} description={error} />}

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{ar.hr.employee.nameAr}</label>
            <input className={inputCls} dir="rtl" value={form.name_ar} onChange={(e) => field('name_ar', e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{ar.hr.employee.phone}</label>
            <input
              className={inputCls}
              dir="ltr"
              placeholder="01XXXXXXXXX"
              value={form.phone}
              onChange={(e) => field('phone', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{ar.hr.employee.roleAr}</label>
            <input className={inputCls} dir="rtl" value={form.role_ar} onChange={(e) => field('role_ar', e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{ar.hr.employee.baseSalary}</label>
            <input
              type="number"
              min={0}
              step={1}
              className={cn(inputCls, 'w-40')}
              style={{ unicodeBidi: 'plaintext' }}
              placeholder="0"
              value={form.base_salary_egp}
              onChange={(e) => field('base_salary_egp', e.target.value)}
              onFocus={(e) => e.target.select()}
            />
          </div>

          {isEdit && (
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-foreground">{ar.hr.employee.isActive}</label>
              <Toggle checked={form.is_active} onChange={(v) => field('is_active', v)} label={ar.hr.employee.isActive} />
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            onClick={() => mut.mutate()}
            disabled={mut.isPending || !form.name_ar.trim()}
            className="min-w-24"
          >
            {mut.isPending ? ar.loading : ar.common.save}
          </Button>
          <Button size="sm" variant="outline" onClick={onClose}>
            {ar.common.cancel}
          </Button>
        </div>
      </div>
    </HrDialog>
  );
}
