import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ar } from '@/i18n/ar';
import { hrApi, type HrEmployee, type HrEmployeeDetail } from '@/lib/hr-api';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBanner } from '@/components/ErrorBanner';
import { Skeleton } from '@/components/Skeleton';
import { ResponsiveTable, type Column } from '@/components/ResponsiveTable';
import { StatusPill } from '@/components/StatusPill';
import { Toggle } from '@/components/Toggle';
import { cn } from '@/lib/utils';
import { extractApiError } from '@/lib/api-error';
import { format } from 'date-fns';
import { arSA } from 'date-fns/locale';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: string | number) {
  return Number(v).toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Form ─────────────────────────────────────────────────────────────────────

type EmployeeFormData = {
  name_ar: string;
  phone: string;
  role_ar: string;
  base_salary_egp: string;
  is_active: boolean;
};

const defaultForm: EmployeeFormData = {
  name_ar: '',
  phone: '',
  role_ar: '',
  base_salary_egp: '0',
  is_active: true,
};

function fromEmployee(e: HrEmployee): EmployeeFormData {
  return {
    name_ar: e.name_ar,
    phone: e.phone ?? '',
    role_ar: e.role_ar ?? '',
    base_salary_egp: e.base_salary_egp,
    is_active: e.is_active,
  };
}

function EmployeeForm({
  initial,
  onSave,
  onCancel,
  saving,
  error,
}: {
  initial: EmployeeFormData;
  onSave: (d: EmployeeFormData) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}) {
  const [form, setForm] = useState(initial);
  const field = (key: keyof EmployeeFormData, val: string | boolean) =>
    setForm((f) => ({ ...f, [key]: val }));

  return (
    <div dir="rtl" className="space-y-4">
      {error && <ErrorBanner title={ar.common.error} description={error} />}

      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">{ar.hr.employee.nameAr}</label>
          <input
            className={inputCls}
            dir="rtl"
            value={form.name_ar}
            onChange={(e) => field('name_ar', e.target.value)}
          />
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
          <input
            className={inputCls}
            dir="rtl"
            value={form.role_ar}
            onChange={(e) => field('role_ar', e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">{ar.hr.employee.baseSalary}</label>
          <input
            type="number"
            min={0}
            step={0.01}
            className={cn(inputCls, 'w-40')}
            style={{ unicodeBidi: 'plaintext' }}
            value={form.base_salary_egp}
            onChange={(e) => field('base_salary_egp', e.target.value)}
          />
        </div>

        {'is_active' in initial && (
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-foreground">{ar.hr.employee.isActive}</label>
            <Toggle
              checked={form.is_active}
              onChange={(v) => field('is_active', v)}
              label={ar.hr.employee.isActive}
            />
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          onClick={() => onSave(form)}
          disabled={saving || !form.name_ar.trim()}
          className="min-w-24"
        >
          {saving ? ar.loading : ar.common.save}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          {ar.common.cancel}
        </Button>
      </div>
    </div>
  );
}

const inputCls =
  'h-10 w-full rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground ' +
  'placeholder:text-foreground-tertiary transition-colors duration-75 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent';

// ─── Detail Drawer ────────────────────────────────────────────────────────────

function EmployeeDrawer({
  id,
  onClose,
  onEdit,
}: {
  id: number;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { data, isLoading, error } = useQuery<HrEmployeeDetail>({
    queryKey: ['hr-employee', id],
    queryFn: () => hrApi.getEmployee(id),
  });

  return (
    <div
      dir="rtl"
      className="fixed inset-y-0 end-0 z-50 w-full max-w-md bg-surface-elevated shadow-xl flex flex-col"
      role="dialog"
      aria-modal="true"
    >
      <header className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
        <h2 className="text-base font-semibold text-foreground">{ar.hr.employee.detailTitle}</h2>
        <button
          type="button"
          aria-label={ar.mobile.close}
          onClick={onClose}
          className="size-8 flex items-center justify-center rounded-md text-foreground-muted hover:text-foreground hover:bg-surface-hover transition-colors cursor-pointer"
        >
          ✕
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        )}
        {error && <ErrorBanner title={ar.common.error} description={extractApiError(error)} />}
        {data && (
          <>
            <dl className="rounded-lg border border-border-subtle bg-surface p-4 space-y-2 text-sm">
              {[
                [ar.hr.employee.nameAr, data.name_ar],
                [ar.hr.employee.phone, data.phone ?? '—'],
                [ar.hr.employee.roleAr, data.role_ar ?? '—'],
                [ar.hr.employee.baseSalary, `${fmt(data.base_salary_egp)} ج.م`],
                [ar.hr.employee.isActive, data.is_active ? 'نشط' : 'غير نشط'],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-foreground-muted">{label}</dt>
                  <dd className="font-medium text-foreground text-end">{val}</dd>
                </div>
              ))}
            </dl>

            <Button size="sm" variant="outline" onClick={onEdit} className="w-full cursor-pointer">
              {ar.hr.employee.editEmployee}
            </Button>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">{ar.hr.employee.lastSalaries}</h3>
              {data.last_disbursements.length === 0 ? (
                <p className="text-sm text-foreground-muted">{ar.hr.employee.noSalaries}</p>
              ) : (
                <div className="rounded-lg border border-border-subtle overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-surface-row-alt text-foreground-muted">
                      <tr>
                        <th className="py-2 px-3 text-start font-medium">{ar.hr.salary.month}</th>
                        <th className="py-2 px-3 text-end font-medium">{ar.hr.salary.net} (ج.م)</th>
                        <th className="py-2 px-3 text-start font-medium">{ar.hr.salary.paidVia}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle bg-surface-elevated">
                      {data.last_disbursements.map((d) => (
                        <tr key={d.id} className="hover:bg-surface-hover transition-colors">
                          <td className="py-2 px-3 text-foreground">
                            {format(new Date(d.month), 'yyyy/MM', { locale: arSA })}
                          </td>
                          <td className="py-2 px-3 text-end font-medium text-foreground tabular-num">
                            {fmt(d.net_egp)}
                          </td>
                          <td className="py-2 px-3 text-foreground-muted">
                            {ar.hr.salary.methods[d.paid_via]}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function EmployeesPage() {
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [drawerEmpId, setDrawerEmpId] = useState<number | null>(null);
  const [editingEmp, setEditingEmp] = useState<HrEmployee | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isActiveFilter =
    filterActive === 'all' ? undefined : filterActive === 'active' ? true : false;

  const { data, isLoading, error } = useQuery({
    queryKey: ['hr-employees', search, filterActive],
    queryFn: () =>
      hrApi.listEmployees({
        search: search || undefined,
        is_active: isActiveFilter,
        limit: 100,
      }),
  });

  const createMut = useMutation({
    mutationFn: (d: EmployeeFormData) =>
      hrApi.createEmployee({
        name_ar: d.name_ar.trim(),
        phone: d.phone.trim() || null,
        role_ar: d.role_ar.trim() || null,
        base_salary_egp: Number(d.base_salary_egp),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-employees'] });
      setShowCreate(false);
      setFormError(null);
    },
    onError: (e) => setFormError(extractApiError(e)),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: EmployeeFormData }) =>
      hrApi.updateEmployee(id, {
        name_ar: d.name_ar.trim(),
        phone: d.phone.trim() || null,
        role_ar: d.role_ar.trim() || null,
        base_salary_egp: Number(d.base_salary_egp),
        is_active: d.is_active,
      }),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['hr-employees'] });
      qc.invalidateQueries({ queryKey: ['hr-employee', updated.id] });
      setEditingEmp(null);
      setFormError(null);
    },
    onError: (e) => setFormError(extractApiError(e)),
  });

  const employees = data?.rows ?? [];

  const columns: Column<HrEmployee>[] = [
    {
      key: 'name',
      header: ar.hr.employee.nameAr,
      primary: true,
      cell: (e) => <span className="font-medium text-foreground">{e.name_ar}</span>,
    },
    {
      key: 'role',
      header: ar.hr.employee.roleAr,
      secondary: true,
      cell: (e) => <span className="text-foreground-muted">{e.role_ar ?? '—'}</span>,
    },
    {
      key: 'salary',
      header: ar.hr.employee.baseSalary,
      align: 'end',
      cell: (e) => (
        <span className="tabular-num text-foreground" dir="ltr">
          {fmt(e.base_salary_egp)} <span className="text-foreground-tertiary text-xs">ج.م</span>
        </span>
      ),
    },
    {
      key: 'active',
      header: ar.hr.employee.isActive,
      align: 'center',
      cell: (e) => (
        <StatusPill tone={e.is_active ? 'success' : 'neutral'}>
          {e.is_active ? ar.hr.employee.filterActive : ar.hr.employee.filterInactive}
        </StatusPill>
      ),
    },
    {
      key: 'edit',
      header: '',
      align: 'end',
      cell: (e) => (
        <button
          type="button"
          onClick={(ev) => { ev.stopPropagation(); setEditingEmp(e); setFormError(null); }}
          className="text-xs text-foreground-muted hover:text-accent transition-colors underline-offset-2 hover:underline cursor-pointer"
          aria-label={ar.hr.employee.editEmployee}
        >
          {ar.hr.employee.editEmployee.split(' ')[0]}
        </button>
      ),
      hideOnMobile: true,
    },
  ];

  return (
    <div dir="rtl" className="space-y-4">
      <PageHeader title={ar.hr.employees} description={ar.hr.title} backTo="/hr" />

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2 items-center flex-wrap">
          <input
            className="h-9 rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-foreground placeholder:text-foreground-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent w-56"
            dir="rtl"
            placeholder={ar.hr.employee.search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {(['all', 'active', 'inactive'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilterActive(f)}
              className={cn(
                'h-8 px-3 rounded-pill text-xs border transition-colors duration-150 cursor-pointer',
                filterActive === f
                  ? 'bg-accent text-foreground-on-accent border-accent font-medium'
                  : 'bg-surface-elevated text-foreground-muted border-border-subtle hover:text-foreground hover:bg-surface-hover',
              )}
            >
              {f === 'all'
                ? ar.hr.employee.filterAll
                : f === 'active'
                  ? ar.hr.employee.filterActive
                  : ar.hr.employee.filterInactive}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => { setShowCreate(true); setFormError(null); }}>
          {ar.hr.employee.addEmployee}
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="rounded-lg border border-border-subtle bg-surface-elevated p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">{ar.hr.employee.createTitle}</h3>
          <EmployeeForm
            initial={defaultForm}
            onSave={(d) => createMut.mutate(d)}
            onCancel={() => { setShowCreate(false); setFormError(null); }}
            saving={createMut.isPending}
            error={formError}
          />
        </div>
      )}

      {/* Edit form */}
      {editingEmp && (
        <div className="rounded-lg border border-border-subtle bg-surface-elevated p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">{ar.hr.employee.editEmployee}</h3>
          <EmployeeForm
            initial={fromEmployee(editingEmp)}
            onSave={(d) => updateMut.mutate({ id: editingEmp.id, d })}
            onCancel={() => { setEditingEmp(null); setFormError(null); }}
            saving={updateMut.isPending}
            error={formError}
          />
        </div>
      )}

      <ResponsiveTable
        columns={columns}
        rows={employees}
        rowKey={(e) => String(e.id)}
        onRowClick={(e) => setDrawerEmpId(e.id)}
        isLoading={isLoading}
        isError={!!error}
        onRetry={() => { }}
        errorTitle={ar.common.error}
        empty={ar.hr.employee.empty}
        resetKey={`${search}|${filterActive}`}
      />

      {/* Detail drawer */}
      {drawerEmpId !== null && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            onClick={() => setDrawerEmpId(null)}
            aria-hidden
          />
          <EmployeeDrawer
            id={drawerEmpId}
            onClose={() => setDrawerEmpId(null)}
            onEdit={() => {
              const emp = employees.find((e) => e.id === drawerEmpId);
              if (emp) { setEditingEmp(emp); setFormError(null); }
              setDrawerEmpId(null);
            }}
          />
        </>
      )}
    </div>
  );
}
