'use client';

import React from 'react';
import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, type SelectOption } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

export type Warehouse = {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  deactivated_at: string | null;
  active_wo_count?: number;
};

export type CreateWarehouseInput = { code: string; name: string; address?: string | null };
export type CreateWarehouseResult =
  | { ok: true; data: Warehouse }
  | { ok: false; error?: string };

export type DeactivateWarehouseInput = { warehouseId: string; force?: boolean };

export type DeactivateWarehouseResult =
  | { ok: true; data?: { warehouseId?: string; deactivated_at?: string; isActive?: boolean } }
  | {
      ok: false;
      code?: 'SOFT_WARNING_ACTIVE_WO' | string;
      error?: string;
      warning?: { code?: 'SOFT_WARNING_ACTIVE_WO' | 'ACTIVE_WO_REFERENCES' | string; activeWoCount?: number; activeWorkOrders?: number };
    };

export type WarehousePageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';
type StatusFilter = 'all' | 'active' | 'deactivated';
type SortKey = 'name' | 'code' | 'status' | 'active_wo_count';
type WarningState = { warehouseId: string; warehouseName: string; activeWoCount: number };

export type WarehouseLabels = {
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
  addWarehouse: string;
  createWarehouse: string;
  createWarehousePending: string;
  warehouseCode: string;
  warehouseName: string;
  warehouseAddress: string;
  createWarehouseFailed: string;
  createWarehouseSuccess: string;
};

export default function WarehouseListScreen({
  labels,
  initialWarehouses,
  canUpdateInfra,
  createWarehouse,
  deactivateWarehouse,
  state,
}: {
  labels: WarehouseLabels;
  initialWarehouses: Warehouse[];
  canUpdateInfra: boolean;
  createWarehouse: (input: CreateWarehouseInput) => Promise<CreateWarehouseResult>;
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
  const [createPending, setCreatePending] = React.useState(false);
  const [createStatus, setCreateStatus] = React.useState<string | null>(null);
  const [newWarehouse, setNewWarehouse] = React.useState({ code: '', name: '', address: '' });
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

  async function submitCreateWarehouse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUpdateInfra || createPending) return;
    const input = {
      code: newWarehouse.code,
      name: newWarehouse.name,
      address: newWarehouse.address.trim() || null,
    };
    setCreatePending(true);
    setCreateStatus(null);
    setError(null);
    try {
      const result = await createWarehouse(input);
      if (!result.ok) {
        setError(labels.createWarehouseFailed);
        return;
      }
      setRows((current) => [result.data, ...current.filter((row) => row.id !== result.data.id)]);
      setNewWarehouse({ code: '', name: '', address: '' });
      setCreateStatus(labels.createWarehouseSuccess);
    } finally {
      setCreatePending(false);
    }
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

        <form onSubmit={(event) => void submitCreateWarehouse(event)} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label={labels.addWarehouse}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid min-w-36 flex-1 gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="new-warehouse-code">
              {labels.warehouseCode}
              <Input
                id="new-warehouse-code"
                value={newWarehouse.code}
                onChange={(event) => setNewWarehouse((current) => ({ ...current, code: event.currentTarget.value }))}
                disabled={!canUpdateInfra || createPending}
                required
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-950"
              />
            </label>
            <label className="grid min-w-48 flex-1 gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="new-warehouse-name">
              {labels.warehouseName}
              <Input
                id="new-warehouse-name"
                value={newWarehouse.name}
                onChange={(event) => setNewWarehouse((current) => ({ ...current, name: event.currentTarget.value }))}
                disabled={!canUpdateInfra || createPending}
                required
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-950"
              />
            </label>
            <label className="grid min-w-56 flex-1 gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="new-warehouse-address">
              {labels.warehouseAddress}
              <Input
                id="new-warehouse-address"
                value={newWarehouse.address}
                onChange={(event) => setNewWarehouse((current) => ({ ...current, address: event.currentTarget.value }))}
                disabled={!canUpdateInfra || createPending}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-950"
              />
            </label>
            <Button type="submit" disabled={!canUpdateInfra || createPending} aria-label={canUpdateInfra ? labels.createWarehouse : `${labels.createWarehouse} — ${labels.insufficientPermission}`}>
              {createPending ? labels.createWarehousePending : labels.createWarehouse}
            </Button>
          </div>
          {createStatus ? <p role="status" className="mt-2 text-sm text-emerald-700">{createStatus}</p> : null}
        </form>
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
