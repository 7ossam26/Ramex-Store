import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Users, Plus } from 'lucide-react';
import { ar } from '@/i18n/ar';
import { hrApi, type HrEmployee, type HrSalaryPreview } from '@/lib/hr-api';
import { Button } from '@/components/ui/button';
import { EmployeeListPane } from './components/EmployeeListPane';
import { EmployeeDetailPane } from './components/EmployeeDetailPane';
import { EmployeeFormDialog } from './components/EmployeeFormDialog';
import { currentMonthYM, toMonthDate } from './components/utils';

export function EmployeesPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const selectedId = params.get('selected') ? Number(params.get('selected')) : null;

  const setSelected = (id: number, replace = false) => {
    const next = new URLSearchParams(params);
    next.set('selected', String(id));
    setParams(next, { replace });
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['hr-employees', search],
    queryFn: () => hrApi.listEmployees({ search: search || undefined, limit: 200 }),
  });
  const employees = data?.rows ?? [];

  // One request feeds every row's "إجمالي السلف الحالية" number: current outstanding advances per employee.
  const month = currentMonthYM();
  const { data: previewRows } = useQuery<HrSalaryPreview[]>({
    queryKey: ['hr-balances', month],
    queryFn: () => hrApi.getMonthPreview(toMonthDate(month)),
  });
  const totals = useMemo(() => {
    const m = new Map<number, number>();
    (previewRows ?? []).forEach((r) => m.set(r.employee_id, r.outstanding_advance_egp));
    return m;
  }, [previewRows]);

  // Auto-select the first employee so the detail pane is never empty (matches the reference).
  useEffect(() => {
    if (selectedId === null && employees.length > 0) {
      setSelected(employees[0].id, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, employees]);

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between gap-4">
        <h1 className="flex items-center gap-2 text-3xl font-semibold text-foreground">
          <Users className="size-7 text-accent" />
          {ar.hr.employees}
        </h1>
        <Button onClick={() => setShowCreate(true)} className="gap-1.5">
          <Plus size={18} />
          {ar.hr.employee.newEmployee}
        </Button>
      </header>

      {/* Two-pane master-detail (both columns share the same height) */}
      <div className="grid gap-4 lg:grid-cols-[340px,1fr] lg:h-[calc(100dvh-10rem)]">
        <EmployeeListPane
          employees={employees}
          total={data?.total ?? employees.length}
          isLoading={isLoading}
          isError={!!error}
          selectedId={selectedId}
          onSelect={(id) => setSelected(id)}
          search={search}
          onSearchChange={setSearch}
          totals={totals}
        />

        {selectedId !== null ? (
          <EmployeeDetailPane key={selectedId} employeeId={selectedId} />
        ) : (
          <div className="h-full min-h-48 rounded-xl border border-dashed border-border-default bg-surface flex items-center justify-center">
            <p className="text-sm text-foreground-muted">{ar.hr.employee.selectPrompt}</p>
          </div>
        )}
      </div>

      {showCreate && (
        <EmployeeFormDialog
          employee={null}
          onClose={() => setShowCreate(false)}
          onDone={(saved: HrEmployee) => {
            setShowCreate(false);
            setSelected(saved.id);
          }}
        />
      )}
    </div>
  );
}
