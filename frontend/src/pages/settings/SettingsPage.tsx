import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ar } from '@/i18n/ar';
import { settingsApi, permissionsApi, usersApi, bankAccountsApi } from '@/lib/settings-api';
import { codesApi, type CodeGrade, type CodeComposition, type CodeBrand, type CodeSupplier } from '@/lib/codes-api';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useAuth } from '@/lib/auth';
import { useIsDesktop } from '@/hooks/useMediaQuery';

type Section =
  | 'general' | 'tax' | 'pos' | 'cashDrawer' | 'banks'
  | 'usersPermissions' | 'reasonCodes' | 'dayRollover' | 'system' | 'fabricCodes';

const SECTIONS: Section[] = [
  'general', 'tax', 'pos', 'cashDrawer', 'banks',
  'usersPermissions', 'reasonCodes', 'dayRollover', 'system', 'fabricCodes',
];

// ── helpers ───────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder = '' }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <input
      className="border border-border rounded px-3 py-1.5 text-sm bg-canvas focus:outline-none focus:ring-1 focus:ring-primary"
      dir="rtl"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

function NumInput({ value, onChange, step = 1, min = 0, max }: {
  value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number;
}) {
  return (
    <input
      type="number"
      className="border border-border rounded px-3 py-1.5 text-sm bg-canvas focus:outline-none focus:ring-1 focus:ring-primary w-32"
      value={value}
      step={step}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-border'}`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

function SaveButton({ onClick, saving }: { onClick: () => void; saving: boolean }) {
  return (
    <Button size="sm" onClick={onClick} disabled={saving}>
      {saving ? ar.loading : ar.common.save}
    </Button>
  );
}

// ── Section: General ──────────────────────────────────────────────────────────

function GeneralSection({ settings, onSave }: { settings: Record<string, unknown>; onSave: (key: string, value: unknown) => Promise<void> }) {
  const [form, setForm] = useState({
    logoPath: String(settings['shop.logo_path'] ?? ''),
    addressAr: String(settings['shop.address_ar'] ?? ''),
    phone: String(settings['shop.phone'] ?? ''),
    taxNo: String(settings['shop.tax_no'] ?? ''),
    warningTextAr: String(settings['receipt.warning_text_ar'] ?? ''),
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await Promise.all([
        onSave('shop.logo_path', form.logoPath || null),
        onSave('shop.address_ar', form.addressAr),
        onSave('shop.phone', form.phone),
        onSave('shop.tax_no', form.taxNo),
        onSave('receipt.warning_text_ar', form.warningTextAr),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Field label={ar.settings.general.logoPath}>
        <TextInput value={form.logoPath} onChange={(v) => setForm({ ...form, logoPath: v })} placeholder="/images/logo.png" />
      </Field>
      <Field label={ar.settings.general.addressAr}>
        <TextInput value={form.addressAr} onChange={(v) => setForm({ ...form, addressAr: v })} />
      </Field>
      <Field label={ar.settings.general.phone}>
        <TextInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="01XXXXXXXXX" />
      </Field>
      <Field label={ar.settings.general.taxNo}>
        <TextInput value={form.taxNo} onChange={(v) => setForm({ ...form, taxNo: v })} />
      </Field>
      <Field label={ar.settings.general.warningTextAr}>
        <textarea
          dir="rtl"
          className="border border-border rounded px-3 py-1.5 text-sm bg-canvas focus:outline-none focus:ring-1 focus:ring-primary resize-y min-h-20"
          value={form.warningTextAr}
          onChange={(e) => setForm({ ...form, warningTextAr: e.target.value })}
        />
      </Field>
      <div className="flex items-center gap-2">
        <SaveButton onClick={save} saving={saving} />
        {saved && <span className="text-sm text-green-600">{ar.settings.saved}</span>}
      </div>
    </div>
  );
}

// ── Section: Tax ──────────────────────────────────────────────────────────────

function TaxSection({ settings, onSave }: { settings: Record<string, unknown>; onSave: (key: string, value: unknown) => Promise<void> }) {
  const [enabled, setEnabled] = useState(Boolean(settings['tax.enabled'] ?? false));
  const [rate, setRate] = useState(Number(settings['tax.rate'] ?? 0.14));
  const [labelAr, setLabelAr] = useState(String(settings['tax.label_ar'] ?? 'ضريبة'));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await Promise.all([
        onSave('tax.enabled', enabled),
        onSave('tax.rate', rate),
        onSave('tax.label_ar', labelAr),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Field label={ar.settings.tax.enabled}>
        <Toggle checked={enabled} onChange={setEnabled} />
      </Field>
      <Field label={ar.settings.tax.rate}>
        <NumInput value={rate} onChange={setRate} step={0.01} min={0} max={1} />
      </Field>
      <Field label={ar.settings.tax.labelAr}>
        <TextInput value={labelAr} onChange={setLabelAr} />
      </Field>
      <div className="flex items-center gap-2">
        <SaveButton onClick={save} saving={saving} />
        {saved && <span className="text-sm text-green-600">{ar.settings.saved}</span>}
      </div>
    </div>
  );
}

// ── Section: POS ──────────────────────────────────────────────────────────────

function PosSection({ settings, onSave }: { settings: Record<string, unknown>; onSave: (key: string, value: unknown) => Promise<void> }) {
  const [form, setForm] = useState({
    minDepositPct: Number(settings['pos.min_deposit_pct'] ?? 0.25),
    voidTimeLimitHours: Number(settings['pos.void_time_limit_hours'] ?? 24),
    approvalThreshold: Number(settings['pos.approval_threshold_egp'] ?? 5000),
    staleInvoiceDays: Number(settings['pos.stale_invoice_days'] ?? 7),
    returnWindowDays: Number(settings['pos.return_window_days'] ?? 14),
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await Promise.all([
        onSave('pos.min_deposit_pct', form.minDepositPct),
        onSave('pos.void_time_limit_hours', form.voidTimeLimitHours),
        onSave('pos.approval_threshold_egp', form.approvalThreshold),
        onSave('pos.stale_invoice_days', form.staleInvoiceDays),
        onSave('pos.return_window_days', form.returnWindowDays),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Field label={ar.settings.pos.minDepositPct}>
        <NumInput value={form.minDepositPct} onChange={(v) => setForm({ ...form, minDepositPct: v })} step={0.01} min={0} max={1} />
      </Field>
      <Field label={ar.settings.pos.voidTimeLimitHours}>
        <NumInput value={form.voidTimeLimitHours} onChange={(v) => setForm({ ...form, voidTimeLimitHours: v })} min={0} />
      </Field>
      <Field label={ar.settings.pos.approvalThresholdEgp}>
        <NumInput value={form.approvalThreshold} onChange={(v) => setForm({ ...form, approvalThreshold: v })} step={100} min={0} />
      </Field>
      <Field label={ar.settings.pos.staleInvoiceDays}>
        <NumInput value={form.staleInvoiceDays} onChange={(v) => setForm({ ...form, staleInvoiceDays: v })} min={1} />
      </Field>
      <Field label={ar.settings.pos.returnWindowDays}>
        <NumInput value={form.returnWindowDays} onChange={(v) => setForm({ ...form, returnWindowDays: v })} min={0} />
      </Field>
      <div className="flex items-center gap-2">
        <SaveButton onClick={save} saving={saving} />
        {saved && <span className="text-sm text-green-600">{ar.settings.saved}</span>}
      </div>
    </div>
  );
}

// ── Section: Cash Drawer (read-only) ──────────────────────────────────────────

function CashDrawerSection() {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{ar.settings.cashDrawer.openingBalance}</p>
      <p className="text-sm">{ar.settings.system.auditRetentionValue}</p>
    </div>
  );
}

// ── Section: Banks ────────────────────────────────────────────────────────────

function BanksSection() {
  const qc = useQueryClient();
  const { data: banks = [] } = useQuery({
    queryKey: ['settings-banks'],
    queryFn: bankAccountsApi.list,
  });

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name_ar: '', bank_name_ar: '', account_number: '' });

  const createMut = useMutation({
    mutationFn: () => bankAccountsApi.create({ name_ar: form.name_ar, bank_name_ar: form.bank_name_ar, account_number: form.account_number }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings-banks'] }); setShowAdd(false); setForm({ name_ar: '', bank_name_ar: '', account_number: '' }); },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) => bankAccountsApi.update(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-banks'] }),
  });

  return (
    <div className="space-y-4">
      <Button size="sm" variant="outline" onClick={() => setShowAdd(!showAdd)}>
        {ar.settings.banks.addBank}
      </Button>
      {showAdd && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <Field label={ar.settings.banks.nameAr}>
              <TextInput value={form.name_ar} onChange={(v) => setForm({ ...form, name_ar: v })} />
            </Field>
            <Field label={ar.settings.banks.bankNameAr}>
              <TextInput value={form.bank_name_ar} onChange={(v) => setForm({ ...form, bank_name_ar: v })} />
            </Field>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => createMut.mutate()} disabled={!form.name_ar || createMut.isPending}>{ar.common.save}</Button>
              <Button size="sm" variant="outline" onClick={() => setShowAdd(false)}>{ar.common.cancel}</Button>
            </div>
          </CardContent>
        </Card>
      )}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="py-2 text-right font-medium">{ar.settings.banks.nameAr}</th>
            <th className="py-2 text-right font-medium">{ar.settings.banks.bankNameAr}</th>
            <th className="py-2 text-right font-medium">{ar.settings.banks.isActive}</th>
          </tr>
        </thead>
        <tbody>
          {banks.map((b) => (
            <tr key={b.id} className="border-b border-border hover:bg-muted/40">
              <td className="py-2">{b.name_ar}</td>
              <td className="py-2">{b.bank_name_ar ?? '—'}</td>
              <td className="py-2">
                <Toggle
                  checked={b.is_active}
                  onChange={(v) => toggleMut.mutate({ id: b.id, is_active: v })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Section: Users & Permissions ──────────────────────────────────────────────

const RESOURCES = [
  'customers', 'invoices', 'inventory', 'shipments', 'cash_drawer', 'returns',
  'reports.daily', 'reports.salesByFabricColor', 'reports.customerLedger',
  'reports.outstandingOpenInvoices', 'reports.stocktakeInventory', 'reports.cashFlow',
  'reports.bankReconciliation', 'reports.expenses', 'reports.damageLoss',
  'reports.salesByPaymentMethod', 'reports.auditLog',
  'settings', 'users',
];

function UsersPermissionsSection() {
  const qc = useQueryClient();
  const { data: users = [] } = useQuery({ queryKey: ['settings-users'], queryFn: usersApi.list });
  const { data: matrix = [] } = useQuery({ queryKey: ['settings-permissions'], queryFn: permissionsApi.getMatrix });

  const [showAddUser, setShowAddUser] = useState(false);
  const [userForm, setUserForm] = useState({ username: '', full_name_ar: '', role: 'shop_seller', password: '' });
  const [matrixDirty, setMatrixDirty] = useState<Map<string, boolean>>(new Map());
  const [permSaved, setPermSaved] = useState(false);

  const createUser = useMutation({
    mutationFn: () => usersApi.create(userForm),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings-users'] }); setShowAddUser(false); setUserForm({ username: '', full_name_ar: '', role: 'shop_seller', password: '' }); },
  });

  const toggleUser = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) => usersApi.update(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-users'] }),
  });

  const savePermsMut = useMutation({
    mutationFn: (updates: Array<{ role: string; resource: string; action: string; is_allowed: boolean }>) =>
      permissionsApi.bulkUpdate(updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings-permissions'] });
      setMatrixDirty(new Map());
      setPermSaved(true);
      setTimeout(() => setPermSaved(false), 2000);
    },
  });

  function matrixKey(role: string, resource: string, action: string) {
    return `${role}:${resource}:${action}`;
  }

  function isAllowed(role: string, resource: string, action: string): boolean {
    const k = matrixKey(role, resource, action);
    if (matrixDirty.has(k)) return matrixDirty.get(k)!;
    const row = matrix.find((r) => r.role === role && r.resource === resource && r.action === action);
    return row ? row.is_allowed : false;
  }

  function togglePerm(role: string, resource: string, action: string) {
    const k = matrixKey(role, resource, action);
    const current = isAllowed(role, resource, action);
    setMatrixDirty((prev) => new Map(prev).set(k, !current));
  }

  function savePerms() {
    const updates: Array<{ role: string; resource: string; action: string; is_allowed: boolean }> = [];
    for (const [k, v] of matrixDirty.entries()) {
      const [role, resource, action] = k.split(':');
      if (role && resource && action) updates.push({ role, resource, action, is_allowed: v });
    }
    if (updates.length > 0) savePermsMut.mutate(updates);
  }

  return (
    <div className="space-y-6">
      {/* Users */}
      <div className="space-y-3">
        <h3 className="font-semibold">{ar.settings.users.title}</h3>
        <Button size="sm" variant="outline" onClick={() => setShowAddUser(!showAddUser)}>
          {ar.settings.users.addUser}
        </Button>
        {showAddUser && (
          <Card>
            <CardContent className="pt-4 space-y-3">
              <Field label={ar.settings.users.username}>
                <TextInput value={userForm.username} onChange={(v) => setUserForm({ ...userForm, username: v })} />
              </Field>
              <Field label={ar.settings.users.fullNameAr}>
                <TextInput value={userForm.full_name_ar} onChange={(v) => setUserForm({ ...userForm, full_name_ar: v })} />
              </Field>
              <Field label={ar.settings.users.role}>
                <select
                  className="border border-border rounded px-3 py-1.5 text-sm bg-canvas"
                  value={userForm.role}
                  onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                >
                  <option value="owner">{ar.settings.users.roles.owner}</option>
                  <option value="shop_seller">{ar.settings.users.roles.shop_seller}</option>
                  <option value="factory_sender">{ar.settings.users.roles.factory_sender}</option>
                </select>
              </Field>
              <Field label={ar.settings.users.password}>
                <TextInput value={userForm.password} onChange={(v) => setUserForm({ ...userForm, password: v })} />
              </Field>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => createUser.mutate()} disabled={!userForm.username || !userForm.password || createUser.isPending}>{ar.common.save}</Button>
                <Button size="sm" variant="outline" onClick={() => setShowAddUser(false)}>{ar.common.cancel}</Button>
              </div>
            </CardContent>
          </Card>
        )}
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-2 text-right font-medium">{ar.settings.users.username}</th>
              <th className="py-2 text-right font-medium">{ar.settings.users.fullNameAr}</th>
              <th className="py-2 text-right font-medium">{ar.settings.users.role}</th>
              <th className="py-2 text-right font-medium">{ar.settings.users.isActive}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border hover:bg-muted/40">
                <td className="py-2">{u.username}</td>
                <td className="py-2">{u.full_name_ar}</td>
                <td className="py-2">{ar.settings.users.roles[u.role as keyof typeof ar.settings.users.roles] ?? u.role}</td>
                <td className="py-2">
                  <Toggle checked={u.is_active} onChange={(v) => toggleUser.mutate({ id: u.id, is_active: v })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Permissions matrix */}
      <div className="space-y-3">
        <h3 className="font-semibold">{ar.settings.permissions.title}</h3>
        <div className="overflow-x-auto rounded border border-border">
          <table className="text-xs border-collapse min-w-max">
            <thead>
              <tr className="border-b border-border text-muted-foreground bg-muted/30">
                <th className="py-2 px-3 text-right font-medium min-w-48 sticky right-0 bg-muted/30 z-10">{ar.settings.permissions.resource}</th>
                {(['read', 'write', 'approve'] as const).map((action) => (
                  <>
                    <th key={`seller-${action}`} className="py-2 px-2 text-center font-medium whitespace-nowrap">
                      {ar.settings.permissions.shopSeller} / {ar.settings.permissions[action]}
                    </th>
                    <th key={`factory-${action}`} className="py-2 px-2 text-center font-medium whitespace-nowrap">
                      {ar.settings.permissions.factorySender} / {ar.settings.permissions[action]}
                    </th>
                  </>
                ))}
              </tr>
            </thead>
            <tbody>
              {RESOURCES.map((resource) => (
                <tr key={resource} className="border-b border-border hover:bg-muted/40 bg-canvas">
                  <td className="py-1.5 px-3 font-mono text-muted-foreground sticky right-0 bg-canvas z-10">{resource}</td>
                  {(['read', 'write', 'approve'] as const).map((action) => (
                    <>
                      <td key={`seller-${action}`} className="py-1.5 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={isAllowed('shop_seller', resource, action)}
                          onChange={() => togglePerm('shop_seller', resource, action)}
                        />
                      </td>
                      <td key={`factory-${action}`} className="py-1.5 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={isAllowed('factory_sender', resource, action)}
                          onChange={() => togglePerm('factory_sender', resource, action)}
                        />
                      </td>
                    </>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={savePerms} disabled={matrixDirty.size === 0 || savePermsMut.isPending}>
            {savePermsMut.isPending ? ar.loading : ar.common.save}
          </Button>
          {permSaved && <span className="text-sm text-green-600">{ar.settings.permissions.saved}</span>}
        </div>
      </div>
    </div>
  );
}

// ── Section: Reason codes ─────────────────────────────────────────────────────

type ReasonCode = { code: string; name_ar: string; default_disposition?: string };

function ReasonCodeList({ items, onChange }: { items: ReasonCode[]; onChange: (v: ReasonCode[]) => void }) {
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');

  function addCode() {
    if (!newCode || !newName) return;
    onChange([...items, { code: newCode, name_ar: newName }]);
    setNewCode(''); setNewName('');
  }

  return (
    <div className="space-y-2">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="py-1.5 text-right font-medium">{ar.settings.reasonCodes.code}</th>
            <th className="py-1.5 text-right font-medium">{ar.settings.reasonCodes.nameAr}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.code} className="border-b border-border">
              <td className="py-1.5 font-mono text-muted-foreground">{item.code}</td>
              <td className="py-1.5">
                <input
                  className="border border-border rounded px-2 py-0.5 text-sm w-full"
                  dir="rtl"
                  value={item.name_ar}
                  onChange={(e) => {
                    const next = [...items];
                    next[idx] = { ...item, name_ar: e.target.value };
                    onChange(next);
                  }}
                />
              </td>
              <td className="py-1.5 text-center">
                <button
                  type="button"
                  className="text-red-500 text-xs hover:underline"
                  onClick={() => onChange(items.filter((_, i) => i !== idx))}
                >
                  {ar.settings.reasonCodes.remove}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-2 items-end">
        <Field label={ar.settings.reasonCodes.code}>
          <TextInput value={newCode} onChange={setNewCode} placeholder="code_key" />
        </Field>
        <Field label={ar.settings.reasonCodes.nameAr}>
          <TextInput value={newName} onChange={setNewName} placeholder="الاسم" />
        </Field>
        <Button size="sm" variant="outline" onClick={addCode}>{ar.settings.reasonCodes.addCode}</Button>
      </div>
    </div>
  );
}

function ReasonCodesSection({ settings, onSave }: { settings: Record<string, unknown>; onSave: (key: string, value: unknown) => Promise<void> }) {
  const raw = (key: string, def: ReasonCode[]) =>
    Array.isArray(settings[key]) ? settings[key] as ReasonCode[] : def;

  const [damage, setDamage] = useState<ReasonCode[]>(raw('reason_codes.damage', []));
  const [expense, setExpense] = useState<ReasonCode[]>(raw('reason_codes.expense', []));
  const [cancel, setCancel] = useState<ReasonCode[]>(raw('reason_codes.cancellation', []));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await Promise.all([
        onSave('reason_codes.damage', damage),
        onSave('reason_codes.expense', expense),
        onSave('reason_codes.cancellation', cancel),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h4 className="font-medium mb-2">{ar.settings.reasonCodes.damage}</h4>
        <ReasonCodeList items={damage} onChange={setDamage} />
      </div>
      <div>
        <h4 className="font-medium mb-2">{ar.settings.reasonCodes.expense}</h4>
        <ReasonCodeList items={expense} onChange={setExpense} />
      </div>
      <div>
        <h4 className="font-medium mb-2">{ar.settings.reasonCodes.cancellation}</h4>
        <ReasonCodeList items={cancel} onChange={setCancel} />
      </div>
      <div className="flex items-center gap-2">
        <SaveButton onClick={save} saving={saving} />
        {saved && <span className="text-sm text-green-600">{ar.settings.saved}</span>}
      </div>
    </div>
  );
}

// ── Section: Day rollover ─────────────────────────────────────────────────────

function DayRolloverSection({ settings, onSave }: { settings: Record<string, unknown>; onSave: (key: string, value: unknown) => Promise<void> }) {
  const [time, setTime] = useState(String(settings['day_rollover.time'] ?? '00:00'));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await onSave('day_rollover.time', time);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Field label={ar.settings.dayRollover.time}>
        <input
          type="time"
          className="border border-border rounded px-3 py-1.5 text-sm bg-canvas w-32"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
      </Field>
      <div className="flex items-center gap-2">
        <SaveButton onClick={save} saving={saving} />
        {saved && <span className="text-sm text-green-600">{ar.settings.saved}</span>}
      </div>
    </div>
  );
}

// ── Section: Fabric Codes ─────────────────────────────────────────────────────

type CodeTab = 'grades' | 'compositions' | 'brands' | 'suppliers';

function extractApiError(e: unknown): string {
  const msg =
    (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.message ??
    (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return msg ?? ar.common.error;
}

function GradesTab() {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['codes-grades-all'],
    queryFn: codesApi.listAllGrades,
  });
  const [form, setForm] = useState({ arabic_name: '', english_name: '' });
  const [addOpen, setAddOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () => codesApi.create('grades', { arabic_name: form.arabic_name.trim(), english_name: form.english_name.trim() || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['codes-grades-all'] }); qc.invalidateQueries({ queryKey: ['codes-grades'] }); setForm({ arabic_name: '', english_name: '' }); setAddOpen(false); setErr(null); },
    onError: (e) => setErr(extractApiError(e)),
  });

  const toggleMut = useMutation({
    mutationFn: (item: CodeGrade) =>
      item.is_active ? codesApi.deactivate('grades', item.id) : codesApi.restore('grades', item.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['codes-grades-all'] }); qc.invalidateQueries({ queryKey: ['codes-grades'] }); setErr(null); },
    onError: (e) => setErr(extractApiError(e)),
  });

  if (isLoading) return <p>{ar.loading}</p>;
  return (
    <div className="space-y-3">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="py-2 text-right font-medium">{ar.settings.fabricCodes.arabicName}</th>
            <th className="py-2 text-right font-medium">{ar.settings.fabricCodes.englishName}</th>
            <th className="py-2 text-center font-medium">{ar.settings.fabricCodes.isActive}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-border hover:bg-muted/40">
              <td className="py-1.5">{item.arabic_name}</td>
              <td className="py-1.5 text-muted-foreground">{item.english_name ?? '—'}</td>
              <td className="py-1.5 text-center">
                <Toggle checked={item.is_active} onChange={() => toggleMut.mutate(item)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {addOpen ? (
        <div className="flex gap-2 flex-wrap items-end">
          <Field label={ar.settings.fabricCodes.arabicName}>
            <TextInput value={form.arabic_name} onChange={(v) => setForm({ ...form, arabic_name: v })} />
          </Field>
          <Field label={ar.settings.fabricCodes.englishName}>
            <TextInput value={form.english_name} onChange={(v) => setForm({ ...form, english_name: v })} />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => createMut.mutate()} disabled={!form.arabic_name || createMut.isPending}>{ar.common.save}</Button>
            <Button size="sm" variant="outline" onClick={() => { setAddOpen(false); setErr(null); }}>{ar.common.cancel}</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>{ar.settings.fabricCodes.add}</Button>
      )}
    </div>
  );
}

function CompositionsTab() {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['codes-compositions-all'],
    queryFn: codesApi.listAllCompositions,
  });
  const [form, setForm] = useState({ arabic_name: '', description: '' });
  const [addOpen, setAddOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () => codesApi.create('compositions', { arabic_name: form.arabic_name.trim(), description: form.description.trim() || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['codes-compositions-all'] }); qc.invalidateQueries({ queryKey: ['codes-compositions'] }); setForm({ arabic_name: '', description: '' }); setAddOpen(false); setErr(null); },
    onError: (e) => setErr(extractApiError(e)),
  });

  const toggleMut = useMutation({
    mutationFn: (item: CodeComposition) =>
      item.is_active ? codesApi.deactivate('compositions', item.id) : codesApi.restore('compositions', item.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['codes-compositions-all'] }); qc.invalidateQueries({ queryKey: ['codes-compositions'] }); setErr(null); },
    onError: (e) => setErr(extractApiError(e)),
  });

  if (isLoading) return <p>{ar.loading}</p>;
  return (
    <div className="space-y-3">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="py-2 text-right font-medium">{ar.settings.fabricCodes.arabicName}</th>
            <th className="py-2 text-right font-medium">{ar.settings.fabricCodes.description}</th>
            <th className="py-2 text-center font-medium">{ar.settings.fabricCodes.isActive}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-border hover:bg-muted/40">
              <td className="py-1.5">{item.arabic_name}</td>
              <td className="py-1.5 text-muted-foreground text-xs max-w-48 truncate">{item.description ?? '—'}</td>
              <td className="py-1.5 text-center">
                <Toggle checked={item.is_active} onChange={() => toggleMut.mutate(item)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {addOpen ? (
        <div className="flex gap-2 flex-wrap items-end">
          <Field label={ar.settings.fabricCodes.arabicName}>
            <TextInput value={form.arabic_name} onChange={(v) => setForm({ ...form, arabic_name: v })} />
          </Field>
          <Field label={ar.settings.fabricCodes.description}>
            <TextInput value={form.description} onChange={(v) => setForm({ ...form, description: v })} />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => createMut.mutate()} disabled={!form.arabic_name || createMut.isPending}>{ar.common.save}</Button>
            <Button size="sm" variant="outline" onClick={() => { setAddOpen(false); setErr(null); }}>{ar.common.cancel}</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>{ar.settings.fabricCodes.add}</Button>
      )}
    </div>
  );
}

function SuppliersTab() {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['codes-suppliers-all'],
    queryFn: codesApi.listAllSuppliers,
  });
  const [form, setForm] = useState({ arabic_name: '', arabic_warning_text: '' });
  const [addOpen, setAddOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () => codesApi.create('suppliers', { arabic_name: form.arabic_name.trim(), arabic_warning_text: form.arabic_warning_text.trim() || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['codes-suppliers-all'] }); qc.invalidateQueries({ queryKey: ['codes-suppliers'] }); setForm({ arabic_name: '', arabic_warning_text: '' }); setAddOpen(false); setErr(null); },
    onError: (e) => setErr(extractApiError(e)),
  });

  const toggleMut = useMutation({
    mutationFn: (item: CodeSupplier) =>
      item.is_active ? codesApi.deactivate('suppliers', item.id) : codesApi.restore('suppliers', item.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['codes-suppliers-all'] }); qc.invalidateQueries({ queryKey: ['codes-suppliers'] }); setErr(null); },
    onError: (e) => setErr(extractApiError(e)),
  });

  if (isLoading) return <p>{ar.loading}</p>;
  return (
    <div className="space-y-3">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="py-2 text-right font-medium">{ar.settings.fabricCodes.arabicName}</th>
            <th className="py-2 text-right font-medium">{ar.settings.fabricCodes.warningText}</th>
            <th className="py-2 text-center font-medium">{ar.settings.fabricCodes.isActive}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-border hover:bg-muted/40">
              <td className="py-1.5">{item.arabic_name}</td>
              <td className="py-1.5 text-muted-foreground text-xs max-w-48 truncate">{item.arabic_warning_text ?? '—'}</td>
              <td className="py-1.5 text-center">
                <Toggle checked={item.is_active} onChange={() => toggleMut.mutate(item)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {addOpen ? (
        <div className="flex gap-2 flex-wrap items-end">
          <Field label={ar.settings.fabricCodes.arabicName}>
            <TextInput value={form.arabic_name} onChange={(v) => setForm({ ...form, arabic_name: v })} />
          </Field>
          <Field label={ar.settings.fabricCodes.warningText}>
            <TextInput value={form.arabic_warning_text} onChange={(v) => setForm({ ...form, arabic_warning_text: v })} />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => createMut.mutate()} disabled={!form.arabic_name || createMut.isPending}>{ar.common.save}</Button>
            <Button size="sm" variant="outline" onClick={() => { setAddOpen(false); setErr(null); }}>{ar.common.cancel}</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>{ar.settings.fabricCodes.add}</Button>
      )}
    </div>
  );
}

function BrandsTab() {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['codes-brands-all'],
    queryFn: codesApi.listAllBrands,
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ['codes-suppliers'],
    queryFn: codesApi.listSuppliers,
  });
  const [form, setForm] = useState({ arabic_name: '', product_line: '', supplier_id: '' });
  const [addOpen, setAddOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () => codesApi.create('brands', {
      arabic_name: form.arabic_name.trim(),
      product_line: form.product_line.trim() || null,
      supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['codes-brands-all'] }); qc.invalidateQueries({ queryKey: ['codes-brands'] }); setForm({ arabic_name: '', product_line: '', supplier_id: '' }); setAddOpen(false); setErr(null); },
    onError: (e) => setErr(extractApiError(e)),
  });

  const toggleMut = useMutation({
    mutationFn: (item: CodeBrand) =>
      item.is_active ? codesApi.deactivate('brands', item.id) : codesApi.restore('brands', item.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['codes-brands-all'] }); qc.invalidateQueries({ queryKey: ['codes-brands'] }); setErr(null); },
    onError: (e) => setErr(extractApiError(e)),
  });

  const supplierName = (id: number | null) =>
    suppliers.find((s) => s.id === id)?.arabic_name ?? '—';

  if (isLoading) return <p>{ar.loading}</p>;
  return (
    <div className="space-y-3">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="py-2 text-right font-medium">{ar.settings.fabricCodes.arabicName}</th>
            <th className="py-2 text-right font-medium">{ar.settings.fabricCodes.productLine}</th>
            <th className="py-2 text-right font-medium">{ar.settings.fabricCodes.supplierRef}</th>
            <th className="py-2 text-center font-medium">{ar.settings.fabricCodes.isActive}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-border hover:bg-muted/40">
              <td className="py-1.5">{item.arabic_name}</td>
              <td className="py-1.5 text-muted-foreground">{item.product_line ?? '—'}</td>
              <td className="py-1.5 text-muted-foreground">{supplierName(item.supplier_id)}</td>
              <td className="py-1.5 text-center">
                <Toggle checked={item.is_active} onChange={() => toggleMut.mutate(item)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {addOpen ? (
        <div className="flex gap-2 flex-wrap items-end">
          <Field label={ar.settings.fabricCodes.arabicName}>
            <TextInput value={form.arabic_name} onChange={(v) => setForm({ ...form, arabic_name: v })} />
          </Field>
          <Field label={ar.settings.fabricCodes.productLine}>
            <TextInput value={form.product_line} onChange={(v) => setForm({ ...form, product_line: v })} />
          </Field>
          <Field label={ar.settings.fabricCodes.supplierRef}>
            <select
              className="border border-border rounded px-3 py-1.5 text-sm bg-canvas"
              value={form.supplier_id}
              onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
            >
              <option value="">—</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.arabic_name}</option>
              ))}
            </select>
          </Field>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => createMut.mutate()} disabled={!form.arabic_name || createMut.isPending}>{ar.common.save}</Button>
            <Button size="sm" variant="outline" onClick={() => { setAddOpen(false); setErr(null); }}>{ar.common.cancel}</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>{ar.settings.fabricCodes.add}</Button>
      )}
    </div>
  );
}

function FabricCodesSection() {
  const [tab, setTab] = useState<CodeTab>('grades');
  const tabs: CodeTab[] = ['grades', 'compositions', 'brands', 'suppliers'];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded text-sm transition-colors cursor-pointer ${
              tab === t ? 'bg-primary text-primary-foreground font-medium' : 'border border-border hover:bg-muted/60'
            }`}
          >
            {ar.settings.fabricCodes.tabs[t]}
          </button>
        ))}
      </div>
      {tab === 'grades'       && <GradesTab />}
      {tab === 'compositions' && <CompositionsTab />}
      {tab === 'brands'       && <BrandsTab />}
      {tab === 'suppliers'    && <SuppliersTab />}
    </div>
  );
}

// ── Section: System (read-only) ────────────────────────────────────────────────

function SystemSection() {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm border-b border-border py-2">
        <span className="text-muted-foreground">{ar.settings.system.auditRetention}</span>
        <span className="font-medium">{ar.settings.system.auditRetentionValue}</span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { user } = useAuth();
  const isDesktop = useIsDesktop();
  const [activeSection, setActiveSection] = useState<Section | null>(null);

  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['settings-all'],
    queryFn: settingsApi.getAll,
  });

  const qc = useQueryClient();

  async function handleSave(key: string, value: unknown) {
    await settingsApi.set(key, value);
    qc.invalidateQueries({ queryKey: ['settings-all'] });
  }

  if (user?.role !== 'owner') {
    return <p className="text-muted-foreground p-6">{ar.common.error}</p>;
  }

  if (isLoading) return <p className="p-6">{ar.loading}</p>;
  if (error || !settings) return <p className="text-red-500 p-6">{ar.common.error}</p>;

  // On desktop the rail + content layout is always visible. activeSection is
  // forced to a default. On mobile, null means "show the section index"; a
  // tap selects a section and a back button restores null.
  const desktopActive: Section = (activeSection ?? 'general') as Section;

  const safeSettings = settings;
  function renderSection(s: Section) {
    return (
      <>
        {s === 'general'          && <GeneralSection settings={safeSettings} onSave={handleSave} />}
        {s === 'tax'              && <TaxSection settings={safeSettings} onSave={handleSave} />}
        {s === 'pos'              && <PosSection settings={safeSettings} onSave={handleSave} />}
        {s === 'cashDrawer'       && <CashDrawerSection />}
        {s === 'banks'            && <BanksSection />}
        {s === 'usersPermissions' && <UsersPermissionsSection />}
        {s === 'reasonCodes'      && <ReasonCodesSection settings={safeSettings} onSave={handleSave} />}
        {s === 'dayRollover'      && <DayRolloverSection settings={safeSettings} onSave={handleSave} />}
        {s === 'system'           && <SystemSection />}
        {s === 'fabricCodes'      && <FabricCodesSection />}
      </>
    );
  }

  // Mobile: index ↔ single-section view
  if (!isDesktop) {
    if (activeSection === null) {
      return (
        <div dir="rtl" className="space-y-1">
          <h1 className="text-xl font-bold mb-3">{ar.topbar.settings}</h1>
          <div className="rounded border border-border bg-canvas overflow-hidden">
            {SECTIONS.map((s, i) => (
              <button
                key={s}
                type="button"
                onClick={() => setActiveSection(s)}
                className={`w-full flex items-center justify-between px-4 py-3 text-right hover:bg-muted/40 ${
                  i > 0 ? 'border-t border-border' : ''
                }`}
              >
                <span className="font-medium">{ar.settings.sections[s]}</span>
                <ChevronLeft className="size-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      );
    }
    return (
      <div dir="rtl" className="space-y-3">
        <button
          type="button"
          onClick={() => setActiveSection(null)}
          className="inline-flex items-center gap-1 text-sm text-primary py-2 -mr-2 px-2"
        >
          <ChevronRight className="size-4" />
          {ar.mobile.back}
        </button>
        <Card>
          <CardHeader>
            <CardTitle>{ar.settings.sections[activeSection]}</CardTitle>
          </CardHeader>
          <CardContent>{renderSection(activeSection)}</CardContent>
        </Card>
      </div>
    );
  }

  // Desktop: existing rail + content
  return (
    <div className="flex gap-6 min-h-[70vh]" dir="rtl">
      {/* Left nav */}
      <div className="w-48 shrink-0 border-l border-border pl-4 space-y-1">
        {SECTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setActiveSection(s)}
            className={`w-full text-right px-3 py-2 rounded text-sm transition-colors ${
              desktopActive === s
                ? 'bg-primary text-primary-foreground font-medium'
                : 'hover:bg-muted/60 text-muted-foreground'
            }`}
          >
            {ar.settings.sections[s]}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <Card>
          <CardHeader>
            <CardTitle>{ar.settings.sections[desktopActive]}</CardTitle>
          </CardHeader>
          <CardContent>{renderSection(desktopActive)}</CardContent>
        </Card>
      </div>
    </div>
  );
}
