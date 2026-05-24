import React from 'react';
import { getTranslations } from 'next-intl/server';
import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, type SelectOption } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { deactivateWarehouse as t029DeactivateWarehouse } from '../../../../../../../actions/infra/warehouse';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

export const dynamic = 'force-dynamic';

const READ_PERMISSION = 'settings.infra.read';
const UPDATE_PERMISSION = 'settings.infra.update';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = { query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> };
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

export type Warehouse = {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  deactivated_at: string | null;
  active_wo_count?: number;
};

type WarehouseRow = {
  id: string;
  code: string;
  name: string;
  address_label: string | null;
  deactivated_at: string | null;
  active_wo_count: number | string | null;
};

type DeactivateWarehouseInput = { warehouseId: string; force?: boolean };

type DeactivateWarehouseResult =
  | { ok: true; data?: { warehouseId?: string; deactivated_at?: string; isActive?: boolean } }
  | {
      ok: false;
      code?: 'SOFT_WARNING_ACTIVE_WO' | string;
      error?: string;
      warning?: { code?: 'SOFT_WARNING_ACTIVE_WO' | 'ACTIVE_WO_REFERENCES' | string; activeWoCount?: number; activeWorkOrders?: number };
    };

type PageProps = {
  params?: Promise<{ locale: string }>;
  warehouses?: Warehouse[];
  canUpdateInfra?: boolean;
  deactivateWarehouse?: (input: DeactivateWarehouseInput) => Promise<DeactivateWarehouseResult>;
  state?: WarehousePageState;
};

type WarehousePageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';
type StatusFilter = 'all' | 'active' | 'deactivated';
type SortKey = 'name' | 'code' | 'status' | 'active_wo_count';
type WarningState = { warehouseId: string; warehouseName: string; activeWoCount: number };

type WarehouseLabels = {
  title: string;
  subtitle: string;
  sectionTitle: string;
  sectionSubtitle: string;
  status: string;
  statusAll: string;
  statusActive: string;
  statusDeactivated: string;
  textFilter: string;
  textFilterPlaceholder: string;
  sort: string;
  columnSelect: string;
  columnName: string;
  columnCode: string;
  columnAddress: string;
  columnStatus: string;
  columnActiveWoCount: string;
  selectWarehouse: string;
  bulkActivate: string;
  bulkDeactivate: string;
  bulkDeactivatePending: string;
  softWarningTitle: string;
  softWarningCode: string;
  softWarningBody: string;
  activeWoReference: string;
  cancel: string;
  confirmDeactivate: string;
  insufficientPermission: string;
  loading: string;
  empty: string;
  error: string;
  forbidden: string;
  provenance: string;
  actionsLabel: string;
  controlsLabel: string;
  appSidebarLabel: string;
  sidebarCrumb: string;
  unavailable: string;
  eyebrow: string;
};

const DEFAULT_LABELS: WarehouseLabels = {
  title: 'Warehouses',
  subtitle: 'Manage warehouse master data, status, and infrastructure availability.',
  sectionTitle: 'Warehouse master data',
  sectionSubtitle: 'Live warehouse rows with soft-delete status and guarded bulk deactivation.',
  status: 'Status',
  statusAll: 'All statuses',
  statusActive: 'Active',
  statusDeactivated: 'Deactivated',
  textFilter: 'Filter warehouses',
  textFilterPlaceholder: 'Search by warehouse, code, or address…',
  sort: 'Sort',
  columnSelect: 'Select',
  columnName: 'Warehouse',
  columnCode: 'Code',
  columnAddress: 'Address',
  columnStatus: 'Status',
  columnActiveWoCount: 'Active WO count',
  selectWarehouse: 'Select {name}',
  bulkActivate: 'Bulk Activate',
  bulkDeactivate: 'Bulk Deactivate',
  bulkDeactivatePending: 'Deactivating…',
  softWarningTitle: 'Active work orders reference this warehouse',
  softWarningCode: 'SOFT_WARNING_ACTIVE_WO',
  softWarningBody: 'Active work orders still reference this warehouse. Confirm to deactivate anyway.',
  activeWoReference: '{count} active work orders reference {name}.',
  cancel: 'Cancel',
  confirmDeactivate: 'Confirm deactivation',
  insufficientPermission: 'Insufficient permissions: settings.infra.update is required to deactivate warehouses.',
  loading: 'Loading warehouses…',
  empty: 'No warehouses found for this organization.',
  error: 'Warehouse update failed. Try again or contact an administrator.',
  forbidden: 'You do not have permission to view warehouse infrastructure settings.',
  provenance: 'Data source: withOrgContext-scoped warehouse query; prototype mock rows are not used in production.',
  actionsLabel: 'Warehouse actions',
  controlsLabel: 'Warehouse table controls',
  appSidebarLabel: 'Settings navigation',
  sidebarCrumb: 'Settings / Infrastructure',
  unavailable: '—',
  eyebrow: 'SET-012 · Warehouse infrastructure',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof WarehouseLabels>;

async function buildLabels(locale: string): Promise<WarehouseLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.infra.warehouses' });
    return LABEL_KEYS.reduce((labels, key) => {
      try {
        const translated = t(key);
        labels[key] = translated === key ? DEFAULT_LABELS[key] : translated;
      } catch {
        labels[key] = DEFAULT_LABELS[key];
      }
      return labels;
    }, {} as WarehouseLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

async function hasPermission({ client, userId, orgId }: OrgContextLike, permission: string): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or coalesce(r.permissions, '[]'::jsonb) ? $3)
      limit 1`,
    [userId, orgId, permission],
  );
  return rows.length > 0;
}

function toWarehouse(row: WarehouseRow): Warehouse {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    address: row.address_label,
    deactivated_at: row.deactivated_at,
    active_wo_count: Number(row.active_wo_count ?? 0) || 0,
  };
}

async function loadWarehouses(): Promise<{ state: WarehousePageState; warehouses: Warehouse[]; canUpdateInfra: boolean }> {
  try {
    return await withOrgContext(async (ctx): Promise<{ state: WarehousePageState; warehouses: Warehouse[]; canUpdateInfra: boolean }> => {
      const context = ctx as OrgContextLike;
      const [canRead, canUpdateInfra] = await Promise.all([
        hasPermission(context, READ_PERMISSION),
        hasPermission(context, UPDATE_PERMISSION),
      ]);
      if (!canRead) return { state: 'permission_denied', warehouses: [], canUpdateInfra: false };

      const { rows } = await context.client.query<WarehouseRow>(
        `select w.id,
                w.code,
                w.name,
                nullif(concat_ws(', ', w.address->>'line1', w.address->>'city', w.address->>'country'), '') as address_label,
                w.address->>'deactivated_at' as deactivated_at,
                coalesce(count(wo.id) filter (where wo.status in ('draft', 'released', 'in_progress', 'active')), 0)::integer as active_wo_count
           from public.warehouses w
           left join public.work_orders wo
             on wo.org_id = app.current_org_id()
            and wo.warehouse_id = w.id
          where w.org_id = app.current_org_id()
          group by w.id, w.code, w.name, w.address
          order by lower(w.name), lower(w.code)`,
      );

      return { state: rows.length === 0 ? 'empty' : 'ready', warehouses: rows.map(toWarehouse), canUpdateInfra };
    });
  } catch {
    return { state: 'error', warehouses: [], canUpdateInfra: false };
  }
}

async function runDeactivateWarehouse(input: DeactivateWarehouseInput): Promise<DeactivateWarehouseResult> {
  return t029DeactivateWarehouse(input) as Promise<DeactivateWarehouseResult>;
}

export default async function WarehousesPage(propsInput: unknown = {}) {
  const props = propsInput as PageProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const labels = await buildLabels(locale);
  const suppliedWarehouses = Array.isArray(props.warehouses) ? props.warehouses : null;
  const runtime = suppliedWarehouses
    ? {
        state: props.state ?? (suppliedWarehouses.length === 0 ? 'empty' : 'ready'),
        warehouses: suppliedWarehouses,
        canUpdateInfra: props.canUpdateInfra ?? false,
      }
    : await loadWarehouses();

  return (
    <WarehouseListScreen
      labels={labels}
      initialWarehouses={runtime.warehouses}
      canUpdateInfra={props.canUpdateInfra ?? runtime.canUpdateInfra}
      deactivateWarehouse={props.deactivateWarehouse ?? runDeactivateWarehouse}
      state={props.state ?? runtime.state}
    />
  );
}

function WarehouseListScreen({
  labels,
  initialWarehouses,
  canUpdateInfra,
  deactivateWarehouse,
  state,
}: {
  labels: WarehouseLabels;
  initialWarehouses: Warehouse[];
  canUpdateInfra: boolean;
  deactivateWarehouse: (input: DeactivateWarehouseInput) => Promise<DeactivateWarehouseResult>;
  state: WarehousePageState;
}) {
  const [rows, setRows] = React.useState<Warehouse[]>(() => [...initialWarehouses]);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all');
  const [sortKey, setSortKey] = React.useState<SortKey>('name');
  const [filterValue, setFilterValue] = React.useState('');
  const [debouncedFilter, setDebouncedFilter] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(state === 'error' ? labels.error : null);
  const [warning, setWarning] = React.useState<WarningState | null>(null);

  React.useEffect(() => {
    setRows([...initialWarehouses]);
    setSelected(new Set());
  }, [initialWarehouses]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedFilter(filterValue.trim().toLowerCase()), 200);
    return () => window.clearTimeout(timer);
  }, [filterValue]);

  const statusOptions = React.useMemo<SelectOption[]>(
    () => [
      { value: 'all', label: labels.statusAll },
      { value: 'active', label: labels.statusActive },
      { value: 'deactivated', label: labels.statusDeactivated },
    ],
    [labels.statusActive, labels.statusAll, labels.statusDeactivated],
  );

  const visibleRows = React.useMemo(() => {
    return rows
      .filter((row) => {
        if (statusFilter === 'active') return row.deactivated_at === null;
        if (statusFilter === 'deactivated') return row.deactivated_at !== null;
        return true;
      })
      .filter((row) => {
        if (!debouncedFilter) return true;
        return [row.name, row.code, row.address ?? ''].some((value) => value.toLowerCase().includes(debouncedFilter));
      })
      .sort((a, b) => {
        if (sortKey === 'status') return statusLabel(a, labels).localeCompare(statusLabel(b, labels)) || a.name.localeCompare(b.name);
        if (sortKey === 'active_wo_count') return (b.active_wo_count ?? 0) - (a.active_wo_count ?? 0) || a.name.localeCompare(b.name);
        return String(a[sortKey]).localeCompare(String(b[sortKey]));
      });
  }, [debouncedFilter, labels, rows, sortKey, statusFilter]);

  function toggleSelected(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function markDeactivated(warehouseId: string, deactivatedAt?: string) {
    setRows((current) =>
      current.map((row) =>
        row.id === warehouseId ? { ...row, deactivated_at: deactivatedAt ?? row.deactivated_at ?? new Date().toISOString() } : row,
      ),
    );
  }

  async function bulkDeactivate() {
    if (!canUpdateInfra || selected.size === 0 || pending) return;
    setPending(true);
    setError(null);
    try {
      for (const warehouseId of selected) {
        const result = await deactivateWarehouse({ warehouseId, force: false });
        if (result.ok === false) {
          if (isSoftWarning(result)) {
            const row = rows.find((item) => item.id === warehouseId);
            setWarning({
              warehouseId,
              warehouseName: row?.name ?? labels.columnName,
              activeWoCount: result.warning?.activeWoCount ?? result.warning?.activeWorkOrders ?? 0,
            });
            return;
          }
          setError(labels.error);
          return;
        }
        markDeactivated(result.data?.warehouseId ?? warehouseId, result.data?.deactivated_at);
      }
      setSelected(new Set());
    } finally {
      setPending(false);
    }
  }

  async function confirmDeactivation() {
    if (!warning) return;
    setPending(true);
    setError(null);
    try {
      const result = await deactivateWarehouse({ warehouseId: warning.warehouseId, force: true });
      if (result.ok) {
        markDeactivated(result.data?.warehouseId ?? warning.warehouseId, result.data?.deactivated_at);
        setSelected((current) => {
          const next = new Set(current);
          next.delete(warning.warehouseId);
          return next;
        });
        setWarning(null);
      } else {
        setError(labels.error);
      }
    } finally {
      setPending(false);
    }
  }

  const disabledReason = canUpdateInfra ? undefined : labels.insufficientPermission;
  const deactivateButtonName = disabledReason ? `${labels.bulkDeactivate} — ${disabledReason}` : labels.bulkDeactivate;
  const statePanel = renderStatePanel(state, labels);

  return (
    <main data-testid="settings-warehouse-screen" data-screen="settings-warehouse-list" className="min-h-screen bg-slate-50 text-slate-950">
      <aside data-testid="app-sidebar" aria-label={labels.appSidebarLabel} className="border-b border-slate-200 bg-white px-6 py-3 text-sm text-slate-600">
        {labels.sidebarCrumb}
      </aside>
      <header data-testid="app-topbar" data-region="page-head" className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.eyebrow}</div>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{labels.title}</h1>
            <p className="mt-1 text-sm text-slate-600">{labels.subtitle}</p>
          </div>
          <div className="flex gap-2" aria-label={labels.actionsLabel}>
            <Button type="button" variant="dry-run" disabled aria-disabled="true">
              {labels.bulkActivate}
            </Button>
            <Button
              type="button"
              onClick={() => void bulkDeactivate()}
              disabled={!canUpdateInfra || selected.size === 0 || pending}
              aria-label={deactivateButtonName}
            >
              {pending ? labels.bulkDeactivatePending : labels.bulkDeactivate}
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl space-y-4 p-6" aria-labelledby="warehouse-table-title">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="warehouse-table-title" className="text-base font-semibold">
                {labels.sectionTitle}
              </h2>
              <p className="mt-1 text-sm text-slate-600">{labels.sectionSubtitle}</p>
              <p className="mt-1 text-xs text-slate-500">{labels.provenance}</p>
            </div>
            <div className="flex flex-wrap items-end gap-3" role="group" aria-label={labels.controlsLabel}>
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="warehouse-filter">
                {labels.textFilter}
                <Input
                  id="warehouse-filter"
                  value={filterValue}
                  onChange={(event) => setFilterValue(event.currentTarget.value)}
                  placeholder={labels.textFilterPlaceholder}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-950"
                />
              </label>
              <div className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span id="warehouse-status-label">{labels.status}</span>
                <Select value={statusFilter} options={statusOptions} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                  <SelectTrigger aria-label={labels.status}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="warehouse-sort">
                {labels.sort}
                <Select
                  id="warehouse-sort"
                  value={sortKey}
                  options={[
                    { value: 'name', label: labels.columnName },
                    { value: 'code', label: labels.columnCode },
                    { value: 'status', label: labels.columnStatus },
                    { value: 'active_wo_count', label: labels.columnActiveWoCount },
                  ]}
                  onValueChange={(value) => setSortKey(value as SortKey)}
                />
              </label>
            </div>
          </div>
        </section>

        {statePanel}
        {error ? <section role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 shadow-sm">{error}</section> : null}

        {state === 'ready' ? (
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <Table aria-label={labels.title} className="w-full text-sm">
              <TableHeader className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <TableRow>
                  <TableHead scope="col" className="w-12 px-4 py-3">
                    <span className="sr-only">{labels.columnSelect}</span>
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-3">
                    <Button type="button" variant="dry-run" className="settings-sort-button" onClick={() => setSortKey('name')}>{labels.columnName}</Button>
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-3">
                    <Button type="button" variant="dry-run" className="settings-sort-button" onClick={() => setSortKey('code')}>{labels.columnCode}</Button>
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-3">
                    <Button type="button" variant="dry-run" className="settings-sort-button" onClick={() => setSortKey('status')}>{labels.columnStatus}</Button>
                  </TableHead>
                  <TableHead scope="col" className="px-4 py-3">{labels.columnAddress}</TableHead>
                  <TableHead scope="col" className="px-4 py-3">
                    <Button type="button" variant="dry-run" className="settings-sort-button" onClick={() => setSortKey('active_wo_count')}>{labels.columnActiveWoCount}</Button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100">
                {visibleRows.map((warehouse) => (
                  <TableRow key={warehouse.id} data-testid="settings-warehouse-row" className="align-middle">
                    <TableCell className="px-4 py-4">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={selected.has(warehouse.id)}
                        onChange={(event) => toggleSelected(warehouse.id, event.currentTarget.checked)}
                        disabled={warehouse.deactivated_at !== null || pending || !canUpdateInfra}
                        aria-label={formatTemplate(labels.selectWarehouse, { name: warehouse.name })}
                      />
                    </TableCell>
                    <TableCell className="px-4 py-4 font-medium text-slate-950">{warehouse.name}</TableCell>
                    <TableCell className="px-4 py-4 font-mono text-xs text-slate-600">{warehouse.code}</TableCell>
                    <TableCell className="px-4 py-4">
                      <Badge tone={warehouse.deactivated_at ? 'muted' : 'success'} aria-label={statusLabel(warehouse, labels)}>
                        {statusLabel(warehouse, labels)}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-4 py-4 text-slate-600">{warehouse.address || labels.unavailable}</TableCell>
                    <TableCell className="px-4 py-4 tabular-nums text-slate-700">{warehouse.active_wo_count ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        ) : null}
      </section>

      {warning ? (
        <div role="dialog" aria-modal="true" aria-labelledby="warehouse-soft-warning-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4">
          <div className="w-full max-w-md rounded-xl border border-amber-200 bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <h2 id="warehouse-soft-warning-title" className="text-lg font-semibold text-slate-950">{labels.softWarningTitle}</h2>
              <Button type="button" variant="dry-run" aria-label={labels.cancel} onClick={() => setWarning(null)} disabled={pending}>×</Button>
            </div>
            <div className="mt-4 space-y-3">
              <Badge tone="warning">{labels.softWarningCode}</Badge>
              <p>{labels.softWarningBody}</p>
              <p className="text-sm text-slate-600">
                {formatTemplate(labels.activeWoReference, { count: String(warning.activeWoCount), name: warning.warehouseName })}
              </p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="dry-run" onClick={() => setWarning(null)} disabled={pending}>{labels.cancel}</Button>
              <Button type="button" onClick={() => void confirmDeactivation()} disabled={pending}>{labels.confirmDeactivate}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function renderStatePanel(state: WarehousePageState, labels: WarehouseLabels) {
  if (state === 'loading') return <section role="status" aria-live="polite" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">{labels.loading}</section>;
  if (state === 'empty') return <section role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-slate-600 shadow-sm">{labels.empty}</section>;
  if (state === 'error') return <section role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 shadow-sm">{labels.error}</section>;
  if (state === 'permission_denied') return <section role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 shadow-sm">{labels.forbidden}</section>;
  return null;
}

function statusLabel(warehouse: Warehouse, labels: WarehouseLabels) {
  return warehouse.deactivated_at ? labels.statusDeactivated : labels.statusActive;
}

function formatTemplate(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), template);
}

function isSoftWarning(result: Extract<DeactivateWarehouseResult, { ok: false }>) {
  return (
    result.code === 'SOFT_WARNING_ACTIVE_WO' ||
    result.warning?.code === 'SOFT_WARNING_ACTIVE_WO' ||
    result.warning?.code === 'ACTIVE_WO_REFERENCES' ||
    result.error === 'active_work_orders_reference_warehouse'
  );
}
