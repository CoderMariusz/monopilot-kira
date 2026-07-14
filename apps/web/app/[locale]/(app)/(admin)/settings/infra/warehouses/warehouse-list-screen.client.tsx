'use client';

import React from 'react';
import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, type SelectOption } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { PageHead, Section, SelectField, SettingField, SRow, Toggle } from '../../_components';

/** Literal prototype-parity anchor (UI-PROTOTYPE-PARITY-POLICY). */
const PROTOTYPE_SOURCE = 'prototypes/design/Monopilot Design System/settings/org-screens.jsx:191-252';

export type BinAssignmentStrategy = 'FEFO' | 'FIFO' | 'LIFO' | 'Manual';

export type WarehouseStorageRules = {
  binAssignmentStrategy: BinAssignmentStrategy;
  mixedLotBins: boolean;
  expiryWarningDays: number;
  blockExpiredStock: boolean;
};

export type Warehouse = {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  site?: string | null;
  zones?: number | string | null;
  bins?: number | string | null;
  capacity?: string | number | null;
  usedPercent?: number | string | null;
  deactivated_at: string | null;
  active_wo_count?: number;
  storageRules?: WarehouseStorageRules | null;
};

export type WarehouseSiteOption = {
  id: string;
  name: string;
};

export type UpdateStorageRulesInput = { warehouseId: string } & Partial<WarehouseStorageRules>;
export type UpdateStorageRulesResult =
  | { ok: true; data: { warehouseId: string } & WarehouseStorageRules }
  | { ok: false; error?: string };

export const DEFAULT_STORAGE_RULES: WarehouseStorageRules = {
  binAssignmentStrategy: 'FEFO',
  mixedLotBins: false,
  expiryWarningDays: 7,
  blockExpiredStock: true,
};

export type CreateWarehouseInput = { code: string; name: string; site_id: string; address?: string | null };
export type CreateWarehouseResult =
  | { ok: true; data: Warehouse }
  | { ok: false; error?: string };

export type DeactivateWarehouseInput = { warehouseId: string };

export type DeactivateWarehouseResult =
  | { ok: true; data?: { warehouseId?: string; deactivated_at?: string; isActive?: boolean } }
  | {
      ok: false;
      code?: 'SOFT_WARNING_ACTIVE_WO' | string;
      error?: string;
      message?: string;
      dependents?: { onHandStock: number; openWorkOrders: number; reservations: number; locations: number; productionLines: number };
      warning?: { code?: 'SOFT_WARNING_ACTIVE_WO' | 'ACTIVE_WO_REFERENCES' | string; activeWoCount?: number; activeWorkOrders?: number };
    };

export type RenameWarehouseInput = { warehouseId: string; name: string };
export type RenameWarehouseResult = { ok: true; data: { id: string; name: string } } | { ok: false; error?: string };
export type DeleteWarehouseInput = { warehouseId: string };
export type DeleteWarehouseResult = { ok: true; data: { warehouseId: string } } | { ok: false; error?: string; message?: string };

export type WarehousePageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';
type StatusFilter = 'all' | 'active' | 'deactivated';
type SortKey = 'name' | 'code' | 'status' | 'active_wo_count';
type WarningState = { warehouseId: string; warehouseName: string; activeWoCount: number; message?: string };

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
  columnSite: string;
  columnZones: string;
  columnBins: string;
  columnCapacity: string;
  columnUsed: string;
  columnAddress: string;
  columnStatus: string;
  columnActiveWoCount: string;
  openLocations: string;
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
  warehouseSite: string;
  warehouseSitePlaceholder: string;
  warehouseAddress: string;
  createWarehouseFailed: string;
  createWarehouseSuccess: string;
  storageRules: string;
  storageRulesSubtitle: string;
  binAssignmentStrategy: string;
  binAssignmentFefo: string;
  binAssignmentFifo: string;
  binAssignmentLifo: string;
  binAssignmentManual: string;
  mixedLotBins: string;
  mixedLotBinsHint: string;
  expiryWarningThreshold: string;
  expiryWarningThresholdHint: string;
  days: string;
  blockExpiredStock: string;
  blockExpiredStockHint: string;
  storageRulesWarehousePicker: string;
  storageRulesWarehousePickerHint: string;
  storageRulesNoWarehouse: string;
  storageRulesSelectedHint: string;
  saveStorageRules: string;
  saveStorageRulesPending: string;
  storageRulesSaved: string;
  storageRulesSaveFailed: string;
  editStorageRules: string;
  renameWarehouse: string;
  renameWarehouseTitle: string;
  renameWarehousePending: string;
  renameWarehouseFailed: string;
  deleteWarehouse: string;
  deleteWarehouseTitle: string;
  deleteWarehouseBody: string;
  deleteWarehousePending: string;
  deleteWarehouseBlocked: string;
  confirmDelete: string;
  deactivationBlockedTitle: string;
  dependentsBlocked: string;
};

export default function WarehouseListScreen({
  labels,
  locale = 'en',
  initialWarehouses,
  sites = [],
  canUpdateInfra,
  createWarehouse,
  deactivateWarehouse,
  renameWarehouse,
  deleteWarehouse,
  updateStorageRules,
  state,
}: {
  labels: WarehouseLabels;
  locale?: string;
  initialWarehouses: Warehouse[];
  sites?: WarehouseSiteOption[];
  canUpdateInfra: boolean;
  createWarehouse: (input: CreateWarehouseInput) => Promise<CreateWarehouseResult>;
  deactivateWarehouse: (input: DeactivateWarehouseInput) => Promise<DeactivateWarehouseResult>;
  renameWarehouse: (input: RenameWarehouseInput) => Promise<RenameWarehouseResult>;
  deleteWarehouse: (input: DeleteWarehouseInput) => Promise<DeleteWarehouseResult>;
  updateStorageRules?: (input: UpdateStorageRulesInput) => Promise<UpdateStorageRulesResult>;
  state: WarehousePageState;
}) {
  const [rows, setRows] = React.useState<Warehouse[]>(() => [...initialWarehouses]);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all');
  const [sortKey, setSortKey] = React.useState<SortKey>('name');
  const [filterValue, setFilterValue] = React.useState('');
  const [debouncedFilter, setDebouncedFilter] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [createPending, setCreatePending] = React.useState(false);
  const [createStatus, setCreateStatus] = React.useState<string | null>(null);
  const [newWarehouse, setNewWarehouse] = React.useState({ code: '', name: '', site_id: '', address: '' });
  const [error, setError] = React.useState<string | null>(state === 'error' ? labels.error : null);
  const [warning, setWarning] = React.useState<WarningState | null>(null);
  const [renameTarget, setRenameTarget] = React.useState<Warehouse | null>(null);
  const [renameName, setRenameName] = React.useState('');
  const [renamePending, setRenamePending] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<Warehouse | null>(null);
  const [deletePending, setDeletePending] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [storageWarehouseId, setStorageWarehouseId] = React.useState<string>(() => initialWarehouses[0]?.id ?? '');
  const [binStrategy, setBinStrategy] = React.useState<BinAssignmentStrategy>(DEFAULT_STORAGE_RULES.binAssignmentStrategy);
  const [mixedLotBins, setMixedLotBins] = React.useState(DEFAULT_STORAGE_RULES.mixedLotBins);
  const [expiryDays, setExpiryDays] = React.useState(String(DEFAULT_STORAGE_RULES.expiryWarningDays));
  const [blockExpiredStock, setBlockExpiredStock] = React.useState(DEFAULT_STORAGE_RULES.blockExpiredStock);
  const [storagePending, setStoragePending] = React.useState(false);
  const [storageStatus, setStorageStatus] = React.useState<string | null>(null);
  const [storageError, setStorageError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setRows([...initialWarehouses]);
    setSelected(new Set());
    setStorageWarehouseId((current) =>
      current && initialWarehouses.some((row) => row.id === current) ? current : initialWarehouses[0]?.id ?? '',
    );
  }, [initialWarehouses]);

  const selectedStorageWarehouse = React.useMemo(
    () => rows.find((row) => row.id === storageWarehouseId) ?? null,
    [rows, storageWarehouseId],
  );

  const selectedRules = selectedStorageWarehouse?.storageRules ?? DEFAULT_STORAGE_RULES;

  // Hydrate the editable form from the selected warehouse's persisted rules. Keyed on the
  // warehouse id + the persisted rule values (not the object) so a post-save rows update that
  // does not actually change the rules will not re-clobber local edits or wipe the banner.
  React.useEffect(() => {
    setBinStrategy(selectedRules.binAssignmentStrategy);
    setMixedLotBins(selectedRules.mixedLotBins);
    setExpiryDays(String(selectedRules.expiryWarningDays));
    setBlockExpiredStock(selectedRules.blockExpiredStock);
  }, [
    storageWarehouseId,
    selectedRules.binAssignmentStrategy,
    selectedRules.mixedLotBins,
    selectedRules.expiryWarningDays,
    selectedRules.blockExpiredStock,
  ]);

  // Clear any transient save status/error only when switching to a different warehouse.
  React.useEffect(() => {
    setStorageStatus(null);
    setStorageError(null);
  }, [storageWarehouseId]);

  async function submitStorageRules() {
    if (!canUpdateInfra || storagePending || !selectedStorageWarehouse || !updateStorageRules) return;
    const expiryWarningDays = Number.parseInt(expiryDays, 10);
    setStoragePending(true);
    setStorageStatus(null);
    setStorageError(null);
    const nextRules: WarehouseStorageRules = {
      binAssignmentStrategy: binStrategy,
      mixedLotBins,
      expiryWarningDays: Number.isFinite(expiryWarningDays) && expiryWarningDays >= 0 ? expiryWarningDays : 0,
      blockExpiredStock,
    };
    try {
      const result = await updateStorageRules({ warehouseId: selectedStorageWarehouse.id, ...nextRules });
      if (!result.ok) {
        setStorageError(labels.storageRulesSaveFailed);
        return;
      }
      const saved: WarehouseStorageRules = {
        binAssignmentStrategy: result.data.binAssignmentStrategy,
        mixedLotBins: result.data.mixedLotBins,
        expiryWarningDays: result.data.expiryWarningDays,
        blockExpiredStock: result.data.blockExpiredStock,
      };
      setRows((current) => current.map((row) => (row.id === result.data.warehouseId ? { ...row, storageRules: saved } : row)));
      setStorageStatus(labels.storageRulesSaved);
    } catch {
      setStorageError(labels.storageRulesSaveFailed);
    } finally {
      setStoragePending(false);
    }
  }

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
  const storageWarehouseOptions = React.useMemo<SelectOption[]>(
    () => rows.map((row) => ({ value: row.id, label: `${row.code} — ${row.name}` })),
    [rows],
  );
  const siteOptions = React.useMemo<SelectOption[]>(
    () => sites.map((site) => ({ value: site.id, label: site.name })),
    [sites],
  );
  const binAssignmentOptions = React.useMemo<SelectOption[]>(
    () => [
      { value: 'FEFO', label: labels.binAssignmentFefo },
      { value: 'FIFO', label: labels.binAssignmentFifo },
      { value: 'LIFO', label: labels.binAssignmentLifo },
      { value: 'Manual', label: labels.binAssignmentManual },
    ],
    [labels.binAssignmentFefo, labels.binAssignmentFifo, labels.binAssignmentLifo, labels.binAssignmentManual],
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
    const siteId = newWarehouse.site_id.trim();
    if (!siteId) {
      setError(labels.createWarehouseFailed);
      return;
    }
    const input = {
      code: newWarehouse.code,
      name: newWarehouse.name,
      site_id: siteId,
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
      const selectedSite = sites.find((site) => site.id === siteId) ?? null;
      const createdRow = { ...result.data, site: result.data.site ?? selectedSite?.name ?? null };
      setRows((current) => [createdRow, ...current.filter((row) => row.id !== result.data.id)]);
      setNewWarehouse({ code: '', name: '', site_id: '', address: '' });
      setCreateStatus(labels.createWarehouseSuccess);
      setCreateDialogOpen(false);
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
        const result = await deactivateWarehouse({ warehouseId });
        if (result.ok === false) {
          if (isDependencyBlock(result)) {
            const row = rows.find((item) => item.id === warehouseId);
            setWarning({
              warehouseId,
              warehouseName: row?.name ?? labels.columnName,
              activeWoCount: result.dependents?.openWorkOrders ?? result.warning?.activeWoCount ?? result.warning?.activeWorkOrders ?? 0,
              message: result.message,
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

  async function submitRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameTarget || !renameName.trim() || renamePending) return;
    setRenamePending(true);
    try {
      const result = await renameWarehouse({ warehouseId: renameTarget.id, name: renameName.trim() });
      if (!result.ok) {
        setError(labels.renameWarehouseFailed);
        return;
      }
      setRows((current) => current.map((row) => row.id === result.data.id ? { ...row, name: result.data.name } : row));
      setRenameTarget(null);
    } finally {
      setRenamePending(false);
    }
  }

  async function submitDelete() {
    if (!deleteTarget || deletePending) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      const result = await deleteWarehouse({ warehouseId: deleteTarget.id });
      if (!result.ok) {
        setDeleteError(result.error === 'has_dependents' ? result.message ?? labels.deleteWarehouseBlocked : labels.error);
        return;
      }
      setRows((current) => current.filter((row) => row.id !== result.data.warehouseId));
      setSelected((current) => {
        const next = new Set(current);
        next.delete(result.data.warehouseId);
        return next;
      });
      setDeleteTarget(null);
    } finally {
      setDeletePending(false);
    }
  }

  const disabledReason = canUpdateInfra ? undefined : labels.insufficientPermission;
  const deactivateButtonName = disabledReason ? `${labels.bulkDeactivate} — ${disabledReason}` : labels.bulkDeactivate;
  const statePanel = renderStatePanel(state, labels);

  return (
    <main
      data-testid="settings-warehouse-screen"
      data-screen="settings-warehouse-list"
      data-prototype-source={PROTOTYPE_SOURCE}
      className="space-y-4"
      aria-labelledby="warehouse-table-title"
    >
      <PageHead
        title={labels.title}
        sub={labels.subtitle}
        actions={
          <div className="flex gap-2" aria-label={labels.actionsLabel}>
            <Button
              type="button"
              className="btn-primary"
              onClick={() => canUpdateInfra && setCreateDialogOpen(true)}
              disabled={!canUpdateInfra}
              aria-label={canUpdateInfra ? `+ ${labels.addWarehouse}` : `+ ${labels.addWarehouse} — ${labels.insufficientPermission}`}
            >
              + {labels.addWarehouse}
            </Button>
            <Button
              type="button"
              className="btn-secondary"
              onClick={() => void bulkDeactivate()}
              disabled={!canUpdateInfra || selected.size === 0 || pending}
              aria-label={deactivateButtonName}
            >
              {pending ? labels.bulkDeactivatePending : labels.bulkDeactivate}
            </Button>
          </div>
        }
      />

      {createStatus ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-sm">{createStatus}</p> : null}

      <Section
        title={`${labels.sectionTitle} (${visibleRows.length})`}
        sub={labels.sectionSubtitle}
        action={
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
        }
      >
        <p id="warehouse-table-title" className="sg-hint">{labels.provenance}</p>

        {statePanel}
        {error ? <section role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 shadow-sm">{error}</section> : null}

        {state === 'ready' ? (
          <div className="mt-3">
            <Table aria-label={labels.title} className="w-full text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="w-12">
                    <span className="sr-only">{labels.columnSelect}</span>
                  </TableHead>
                  <TableHead scope="col">{labels.columnCode}</TableHead>
                  <TableHead scope="col">{labels.columnName}</TableHead>
                  <TableHead scope="col">{labels.columnSite}</TableHead>
                  <TableHead scope="col" className="text-right">{labels.columnZones}</TableHead>
                  <TableHead scope="col" className="text-right">{labels.columnBins}</TableHead>
                  <TableHead scope="col" className="text-right">{labels.columnCapacity}</TableHead>
                  <TableHead scope="col">{labels.columnUsed}</TableHead>
                  <TableHead scope="col">{labels.columnStatus}</TableHead>
                  <TableHead scope="col" className="text-right">
                    <span className="sr-only">{labels.storageRules}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((warehouse) => {
                  const usage = usagePercent(warehouse);
                  const site = warehouse.site || warehouse.address || labels.unavailable;
                  const capacity = warehouse.capacity ? String(warehouse.capacity) : labels.unavailable;
                  const status = statusLabel(warehouse, labels);
                  return (
                    <TableRow
                      key={warehouse.id}
                      data-testid="settings-warehouse-row"
                      className="align-middle"
                      aria-label={`${warehouse.code} ${warehouse.name} ${site} ${displayCount(warehouse.zones)} ${displayCount(warehouse.bins)} ${capacity} ${usage}% ${status} ${warehouse.name} ${warehouse.code} ${status}`}
                    >
                      <TableCell>
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300"
                          checked={selected.has(warehouse.id)}
                          onChange={(event) => toggleSelected(warehouse.id, event.currentTarget.checked)}
                          disabled={warehouse.deactivated_at !== null || pending || !canUpdateInfra}
                          aria-label={formatTemplate(labels.selectWarehouse, { name: warehouse.name })}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-700">{warehouse.code}</TableCell>
                      <TableCell className="font-medium text-slate-950">
                        <a href={`/${locale}/settings/infra/locations?warehouseId=${encodeURIComponent(warehouse.id)}`} className="text-blue-700 hover:underline" aria-label={formatTemplate(labels.openLocations, { name: warehouse.name })}>
                          {warehouse.name}
                        </a>
                      </TableCell>
                      <TableCell className="text-slate-600">{site}</TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums text-slate-700">{displayCount(warehouse.zones)}</TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums text-slate-700">{displayCount(warehouse.bins)}</TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums text-slate-700">{capacity}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            data-testid="warehouse-usage-bar"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={usage}
                            className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100"
                          >
                            <div className={`h-full ${usage >= 80 ? 'bg-amber-500' : usage >= 50 ? 'bg-blue-600' : 'bg-emerald-600'}`} style={{ width: `${usage}%` }} />
                          </div>
                          <span className="font-mono text-[11px] text-slate-600">{usage}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge tone={warehouse.deactivated_at ? 'muted' : 'success'} aria-label={status}>
                          {status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="dry-run"
                          data-testid="edit-storage-rules"
                          aria-label={formatTemplate(labels.editStorageRules, { name: warehouse.name })}
                          aria-pressed={storageWarehouseId === warehouse.id}
                          onClick={() => {
                            setStorageWarehouseId(warehouse.id);
                            if (typeof document !== 'undefined') {
                              const panel = document.getElementById('warehouse-storage-rules');
                              panel?.scrollIntoView?.({ block: 'nearest' });
                            }
                          }}
                        >
                          {labels.storageRules}
                        </Button>
                        <Button type="button" variant="dry-run" disabled={!canUpdateInfra} aria-label={`${labels.renameWarehouse} — ${warehouse.name}`} onClick={() => { setRenameTarget(warehouse); setRenameName(warehouse.name); }}>
                          {labels.renameWarehouse}
                        </Button>
                        <Button type="button" variant="dry-run" disabled={!canUpdateInfra} aria-label={`${labels.deleteWarehouse} — ${warehouse.name}`} onClick={() => { setDeleteTarget(warehouse); setDeleteError(null); }}>
                          {labels.deleteWarehouse}
                        </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </Section>

      <div id="warehouse-storage-rules">
        <Section
          title={
            selectedStorageWarehouse
              ? `${labels.storageRules} — ${selectedStorageWarehouse.code}`
              : labels.storageRules
          }
          sub={
            selectedStorageWarehouse
              ? formatTemplate(labels.storageRulesSelectedHint, { name: selectedStorageWarehouse.name })
              : labels.storageRulesSubtitle
          }
          foot={
            selectedStorageWarehouse ? (
              <div className="flex items-center justify-end gap-3">
                {storageStatus ? (
                  <span role="status" className="text-sm text-emerald-700">{storageStatus}</span>
                ) : null}
                <Button
                  type="button"
                  className="btn-primary"
                  data-testid="save-storage-rules"
                  onClick={() => void submitStorageRules()}
                  disabled={!canUpdateInfra || storagePending}
                  aria-label={canUpdateInfra ? labels.saveStorageRules : `${labels.saveStorageRules} — ${labels.insufficientPermission}`}
                >
                  {storagePending ? labels.saveStorageRulesPending : labels.saveStorageRules}
                </Button>
              </div>
            ) : null
          }
        >
          {storageWarehouseOptions.length > 0 ? (
            <SelectField
              id="storage-rules-warehouse"
              label={labels.storageRulesWarehousePicker}
              hint={labels.storageRulesWarehousePickerHint}
              options={storageWarehouseOptions as { value: string; label: string }[]}
              value={storageWarehouseId}
              onChange={setStorageWarehouseId}
            />
          ) : null}

          {selectedStorageWarehouse ? (
            <>
              <SelectField
                id="bin-assignment-strategy"
                label={labels.binAssignmentStrategy}
                options={binAssignmentOptions as { value: string; label: string }[]}
                value={binStrategy}
                disabled={!canUpdateInfra || storagePending}
                onChange={(value) => setBinStrategy(value as BinAssignmentStrategy)}
              />
              <SRow label={labels.mixedLotBins} hint={labels.mixedLotBinsHint}>
                <Toggle aria-label={labels.mixedLotBins} checked={mixedLotBins} disabled={!canUpdateInfra || storagePending} onChange={setMixedLotBins} />
              </SRow>
              <SettingField
                id="expiry-warning-threshold"
                label={labels.expiryWarningThreshold}
                hint={labels.expiryWarningThresholdHint}
                type="number"
                value={expiryDays}
                disabled={!canUpdateInfra || storagePending}
                onChange={setExpiryDays}
              />
              <SRow label={labels.blockExpiredStock} hint={labels.blockExpiredStockHint}>
                <Toggle aria-label={labels.blockExpiredStock} checked={blockExpiredStock} disabled={!canUpdateInfra || storagePending} onChange={setBlockExpiredStock} />
              </SRow>
              {storageError ? (
                <p role="alert" className="sg-hint text-red-700">{storageError}</p>
              ) : null}
            </>
          ) : (
            <p className="sg-hint">{labels.storageRulesNoWarehouse}</p>
          )}
        </Section>
      </div>

      {createDialogOpen ? (
        <div role="dialog" aria-modal="true" aria-labelledby="add-warehouse-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <h2 id="add-warehouse-title" className="text-lg font-semibold text-slate-950">{labels.addWarehouse}</h2>
              <Button type="button" variant="dry-run" aria-label={labels.cancel} onClick={() => setCreateDialogOpen(false)} disabled={createPending}>×</Button>
            </div>
            <form id="add-warehouse-form" onSubmit={(event) => void submitCreateWarehouse(event)} className="mt-4 space-y-4">
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="new-warehouse-code">
                {labels.warehouseCode}
                <Input
                  id="new-warehouse-code"
                  aria-label={labels.warehouseCode}
                  value={newWarehouse.code}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setNewWarehouse((current) => ({ ...current, code: value }));
                  }}
                  disabled={!canUpdateInfra || createPending}
                  required
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-950"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="new-warehouse-name">
                {labels.warehouseName}
                <Input
                  id="new-warehouse-name"
                  aria-label={labels.warehouseName}
                  value={newWarehouse.name}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setNewWarehouse((current) => ({ ...current, name: value }));
                  }}
                  disabled={!canUpdateInfra || createPending}
                  required
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-950"
                />
              </label>
              <div className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <label htmlFor="new-warehouse-site">{labels.warehouseSite}</label>
                <Select
                  id="new-warehouse-site-select"
                  value={newWarehouse.site_id}
                  options={siteOptions}
                  onValueChange={(value) => setNewWarehouse((current) => ({ ...current, site_id: value }))}
                  disabled={!canUpdateInfra || createPending || siteOptions.length === 0}
                >
                  <SelectTrigger id="new-warehouse-site" aria-label={labels.warehouseSite}>
                    <SelectValue placeholder={labels.warehouseSitePlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {siteOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="new-warehouse-address">
                {labels.warehouseAddress}
                <Input
                  id="new-warehouse-address"
                  aria-label={labels.warehouseAddress}
                  value={newWarehouse.address}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setNewWarehouse((current) => ({ ...current, address: value }));
                  }}
                  disabled={!canUpdateInfra || createPending}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-950"
                />
              </label>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="dry-run" onClick={() => setCreateDialogOpen(false)} disabled={createPending}>{labels.cancel}</Button>
                <Button type="submit" className="btn-primary" disabled={!canUpdateInfra || createPending || !newWarehouse.site_id} aria-label={canUpdateInfra ? labels.createWarehouse : `${labels.createWarehouse} — ${labels.insufficientPermission}`}>
                  {createPending ? labels.createWarehousePending : labels.createWarehouse}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {renameTarget ? (
        <div role="dialog" aria-modal="true" aria-labelledby="rename-warehouse-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
            <h2 id="rename-warehouse-title" className="text-lg font-semibold text-slate-950">{labels.renameWarehouseTitle}</h2>
            <form onSubmit={(event) => void submitRename(event)} className="mt-4 space-y-4">
              <label className="grid gap-1 text-sm font-medium" htmlFor="rename-warehouse-name">
                {labels.warehouseName}
                <Input id="rename-warehouse-name" value={renameName} onChange={(event) => setRenameName(event.currentTarget.value)} disabled={renamePending} required />
              </label>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="dry-run" onClick={() => setRenameTarget(null)} disabled={renamePending}>{labels.cancel}</Button>
                <Button type="submit" disabled={renamePending || !renameName.trim()}>{renamePending ? labels.renameWarehousePending : labels.renameWarehouse}</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div role="dialog" aria-modal="true" aria-labelledby="delete-warehouse-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4">
          <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-5 shadow-lg">
            <h2 id="delete-warehouse-title" className="text-lg font-semibold text-slate-950">{labels.deleteWarehouseTitle}</h2>
            <p className="mt-3 text-sm text-slate-700">{formatTemplate(labels.deleteWarehouseBody, { name: deleteTarget.name })}</p>
            {deleteError ? <p role="alert" className="mt-3 text-sm text-red-700">{deleteError}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="dry-run" onClick={() => setDeleteTarget(null)} disabled={deletePending}>{labels.cancel}</Button>
              <Button type="button" onClick={() => void submitDelete()} disabled={deletePending}>{deletePending ? labels.deleteWarehousePending : labels.confirmDelete}</Button>
            </div>
          </div>
        </div>
      ) : null}

      {warning ? (
        <div role="dialog" aria-modal="true" aria-labelledby="warehouse-soft-warning-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4">
          <div className="w-full max-w-md rounded-xl border border-amber-200 bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <h2 id="warehouse-soft-warning-title" className="text-lg font-semibold text-slate-950">{labels.deactivationBlockedTitle}</h2>
              <Button type="button" variant="dry-run" aria-label={labels.cancel} onClick={() => setWarning(null)} disabled={pending}>×</Button>
            </div>
            <div className="mt-4 space-y-3">
              <Badge tone="warning">{labels.softWarningCode}</Badge>
              <p>{warning.message ?? labels.dependentsBlocked}</p>
              <p className="text-sm text-slate-600">
                {formatTemplate(labels.activeWoReference, { count: String(warning.activeWoCount), name: warning.warehouseName })}
              </p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="dry-run" onClick={() => setWarning(null)} disabled={pending}>{labels.cancel}</Button>
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

function usagePercent(warehouse: Warehouse) {
  const value = Number(warehouse.usedPercent ?? 0);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function displayCount(value: Warehouse['zones']) {
  if (value === undefined || value === null || value === '') return '0';
  return String(value);
}

function statusLabel(warehouse: Warehouse, labels: WarehouseLabels) {
  return warehouse.deactivated_at ? labels.statusDeactivated : labels.statusActive;
}

function formatTemplate(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), template);
}

function isDependencyBlock(result: Extract<DeactivateWarehouseResult, { ok: false }>) {
  return (
    result.error === 'has_dependents' ||
    result.code === 'SOFT_WARNING_ACTIVE_WO' ||
    result.warning?.code === 'SOFT_WARNING_ACTIVE_WO' ||
    result.warning?.code === 'ACTIVE_WO_REFERENCES' ||
    result.error === 'active_work_orders_reference_warehouse'
  );
}
