'use client';

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Checkbox } from '@monopilot/ui/Checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

export type MachineStatus = 'active' | 'offline' | 'maintenance';
export type PageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

export type LocationRow = {
  id: string;
  warehouseId: string;
  path: string;
  name: string;
};

export type MachineRow = {
  id: string;
  code: string;
  name: string;
  warehouseId: string;
  locationId: string;
  locationPath: string;
  specs: { status?: MachineStatus | string | null };
  deactivated_at: string | null;
};

export type MachineActionInput = { machineId: string };
export type MachineActionResult = {
  ok: boolean;
  data?: { machineId: string; deactivated_at?: string | null };
};

export type MachinesLabels = {
  title: string;
  subtitle: string;
  sectionTitle: string;
  toolbarLabel: string;
  status: string;
  warehouse: string;
  statusAll: string;
  warehouseAll: string;
  statusActive: string;
  statusOffline: string;
  statusMaintenance: string;
  locationBreadcrumb: string;
  columnSelect: string;
  columnName: string;
  columnCode: string;
  columnStatus: string;
  columnLocation: string;
  columnDeactivated: string;
  bulkActivate: string;
  bulkActivatePending: string;
  bulkDeactivate: string;
  bulkDeactivatePending: string;
  deactivated: string;
  selectMachine: string;
  insufficientPermission: string;
  loading: string;
  empty: string;
  error: string;
  forbidden: string;
  actionError: string;
  provenance: string;
};

export const DEFAULT_MACHINE_LABELS: MachinesLabels = {
  title: 'Machines',
  subtitle: 'Manage equipment status, location, and infrastructure availability.',
  sectionTitle: 'Machine infrastructure',
  toolbarLabel: 'Machine table controls',
  status: 'Status',
  warehouse: 'Warehouse',
  statusAll: 'All statuses',
  warehouseAll: 'All warehouses',
  statusActive: 'Active',
  statusOffline: 'Offline',
  statusMaintenance: 'Maintenance',
  locationBreadcrumb: 'Location breadcrumb',
  columnSelect: 'Select',
  columnName: 'Machine',
  columnCode: 'Code',
  columnStatus: 'Status',
  columnLocation: 'Location',
  columnDeactivated: 'Deactivated',
  bulkActivate: 'Bulk Activate',
  bulkActivatePending: 'Activating…',
  bulkDeactivate: 'Bulk Deactivate',
  bulkDeactivatePending: 'Deactivating…',
  deactivated: 'Deactivated',
  selectMachine: 'Select {name}',
  insufficientPermission:
    'Insufficient permissions: settings.infra.update is required to activate or deactivate machines.',
  loading: 'Loading machines…',
  empty: 'No machines are available for this organization.',
  error: 'Unable to load machines. Try again after the backend is available.',
  forbidden: 'You do not have permission to view machine infrastructure settings.',
  actionError: 'Machine status update failed. Try again or contact an administrator.',
  provenance: 'Data source: withOrgContext machine/location loader; status is read from machines.specs.status and breadcrumbs from locations.path.',
};

function pathToBreadcrumb(path: string, locations: LocationRow[]) {
  const segments = path.split('.').filter(Boolean);
  return segments.slice(0, 4).map((_, index) => {
    const cumulativePath = segments.slice(0, index + 1).join('.');
    return locations.find((location) => location.path === cumulativePath)?.name ?? segments[index].replace(/_/g, ' ');
  });
}

function normalizeStatus(machine: MachineRow) {
  if (machine.deactivated_at) return 'deactivated';
  return String(machine.specs?.status ?? 'offline').toLowerCase();
}

function statusLabel(status: string, labels: MachinesLabels) {
  if (status === 'active') return labels.statusActive;
  if (status === 'maintenance') return labels.statusMaintenance;
  if (status === 'deactivated') return labels.deactivated;
  return labels.statusOffline;
}

function statusVariant(status: string) {
  if (status === 'active') return 'success' as const;
  if (status === 'maintenance') return 'warning' as const;
  if (status === 'deactivated') return 'muted' as const;
  return 'danger' as const;
}

function formatSelectMachineLabel(template: string, name: string) {
  return template.replace('{name}', name);
}

function StateNotice({ state, labels }: { state: PageState; labels: MachinesLabels }) {
  if (state === 'loading') return <div role="status" aria-live="polite">{labels.loading}</div>;
  if (state === 'empty') return <div role="status">{labels.empty}</div>;
  if (state === 'error') return <div role="alert">{labels.error}</div>;
  if (state === 'permission_denied') return <div role="alert">{labels.forbidden}</div>;
  return null;
}

function MachineStatusBadge({ status, labels }: { status: string; labels: MachinesLabels }) {
  const text = statusLabel(status, labels);
  return (
    <Badge variant={statusVariant(status)} data-machine-status aria-label={text}>
      {text}
    </Badge>
  );
}

function MachineBreadcrumb({ machine, locations, labels }: { machine: MachineRow; locations: LocationRow[]; labels: MachinesLabels }) {
  const crumbs = pathToBreadcrumb(machine.locationPath, locations);
  return (
    <nav aria-label={labels.locationBreadcrumb} className="text-xs text-slate-600">
      <ol className="flex flex-wrap items-center gap-1">
        {crumbs.map((crumb, index) => (
          <li key={`${machine.id}-${crumb}`} className="inline-flex items-center gap-1">
            <span className={index === crumbs.length - 1 ? 'font-medium text-slate-900' : undefined}>{crumb}</span>
            {index < crumbs.length - 1 ? <span aria-hidden="true" className="text-slate-400">/</span> : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export default function MachinesListScreen({
  initialMachines,
  locations,
  labels,
  canUpdateInfra,
  activateMachine,
  deactivateMachine,
  state = 'ready',
}: {
  initialMachines: MachineRow[];
  locations: LocationRow[];
  labels: MachinesLabels;
  canUpdateInfra: boolean;
  activateMachine: (input: MachineActionInput) => Promise<MachineActionResult> | MachineActionResult;
  deactivateMachine: (input: MachineActionInput) => Promise<MachineActionResult> | MachineActionResult;
  state?: PageState;
}) {
  const [rows, setRows] = React.useState<MachineRow[]>(() => [...initialMachines]);
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [warehouseFilter, setWarehouseFilter] = React.useState('all');
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [pendingAction, setPendingAction] = React.useState<'activate' | 'deactivate' | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const warehouseOptions = React.useMemo(() => {
    const byWarehouse = new Map<string, string>();
    for (const location of locations) {
      if (!location.warehouseId || byWarehouse.has(location.warehouseId)) continue;
      const root = locations.find((candidate) => candidate.warehouseId === location.warehouseId && !candidate.path.includes('.'));
      byWarehouse.set(location.warehouseId, root?.name ?? location.name);
    }
    for (const machine of rows) {
      if (machine.warehouseId && !byWarehouse.has(machine.warehouseId)) byWarehouse.set(machine.warehouseId, machine.warehouseId);
    }
    return Array.from(byWarehouse.entries()).map(([value, label]) => ({ value, label }));
  }, [locations, rows]);

  const visibleRows = React.useMemo(
    () => rows.filter((row) => {
      const status = normalizeStatus(row);
      const matchesStatus = statusFilter === 'all' || status === statusFilter;
      const matchesWarehouse = warehouseFilter === 'all' || row.warehouseId === warehouseFilter;
      return matchesStatus && matchesWarehouse;
    }),
    [rows, statusFilter, warehouseFilter],
  );

  function toggleSelected(machineId: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(machineId);
      else next.delete(machineId);
      return next;
    });
  }

  async function runBulkAction(action: 'activate' | 'deactivate') {
    if (!canUpdateInfra || pendingAction || selected.size === 0) return;
    setPendingAction(action);
    setActionError(null);
    const callback = action === 'activate' ? activateMachine : deactivateMachine;
    try {
      for (const machineId of selected) {
        const result = await callback({ machineId });
        if (!result.ok) {
          setActionError(labels.actionError);
          return;
        }
        setRows((current) =>
          current.map((row) => {
            if (row.id !== machineId) return row;
            const nextDeactivatedAt = action === 'activate' ? null : result.data?.deactivated_at ?? new Date().toISOString();
            const nextStatus = action === 'activate' ? 'active' : 'offline';
            return {
              ...row,
              deactivated_at: nextDeactivatedAt,
              specs: { ...row.specs, status: nextStatus },
            };
          }),
        );
      }
      setSelected(new Set());
    } finally {
      setPendingAction(null);
    }
  }

  const disabledReason = canUpdateInfra ? undefined : labels.insufficientPermission;
  const bulkDisabled = !canUpdateInfra || selected.size === 0 || pendingAction !== null;
  const activateLabel = disabledReason ? `${labels.bulkActivate} — ${disabledReason}` : labels.bulkActivate;
  const deactivateLabel = disabledReason ? `${labels.bulkDeactivate} — ${disabledReason}` : labels.bulkDeactivate;

  return (
    <main data-testid="settings-machine-screen" data-screen="settings-machine-list" aria-labelledby="settings-machines-title" className="settings-screen settings-screen--machines space-y-4">
      <header className="flex items-start justify-between gap-4" data-region="page-head">
        <div>
          <p className="settings-eyebrow">SET-016</p>
          <h1 id="settings-machines-title">{labels.title}</h1>
          <p className="muted">{labels.subtitle}</p>
        </div>
      </header>

      <section className="settings-section rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="machine-toolbar-title">
        <div className="settings-section__head flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="machine-toolbar-title">{labels.sectionTitle}</h2>
            <p className="muted text-sm">{labels.provenance}</p>
          </div>
          <div className="settings-toolbar flex flex-wrap items-end gap-3" role="group" aria-label={labels.toolbarLabel}>
            <div className="settings-field grid gap-1 text-sm font-medium text-slate-700">
              <span id="machine-status-filter-label">{labels.status}</span>
              <Select value={statusFilter} onValueChange={setStatusFilter} options={[
                { value: 'all', label: labels.statusAll },
                { value: 'active', label: labels.statusActive },
                { value: 'maintenance', label: labels.statusMaintenance },
                { value: 'offline', label: labels.statusOffline },
              ]}>
                <SelectTrigger aria-label={labels.status}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{labels.statusAll}</SelectItem>
                  <SelectItem value="active">{labels.statusActive}</SelectItem>
                  <SelectItem value="maintenance">{labels.statusMaintenance}</SelectItem>
                  <SelectItem value="offline">{labels.statusOffline}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="settings-field grid gap-1 text-sm font-medium text-slate-700">
              <span id="machine-warehouse-filter-label">{labels.warehouse}</span>
              <Select
                value={warehouseFilter}
                onValueChange={setWarehouseFilter}
                options={[{ value: 'all', label: labels.warehouseAll }, ...warehouseOptions]}
              >
                <SelectTrigger aria-label={labels.warehouse}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{labels.warehouseAll}</SelectItem>
                  {warehouseOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" disabled={bulkDisabled} aria-label={activateLabel} onClick={() => runBulkAction('activate')}>
              {pendingAction === 'activate' ? labels.bulkActivatePending : labels.bulkActivate}
            </Button>
            <Button type="button" disabled={bulkDisabled} aria-label={deactivateLabel} onClick={() => runBulkAction('deactivate')}>
              {pendingAction === 'deactivate' ? labels.bulkDeactivatePending : labels.bulkDeactivate}
            </Button>
          </div>
        </div>
        {actionError ? <div role="alert" className="mt-3 text-sm text-red-700">{actionError}</div> : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="machine-list-title">
        <h2 id="machine-list-title" className="sr-only">{labels.sectionTitle}</h2>
        {state === 'ready' ? (
          visibleRows.length > 0 ? (
            <Table aria-label={labels.title} className="w-full border-collapse text-left text-sm">
              <TableHeader className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <TableRow>
                  <TableHead scope="col" className="px-4 py-3"><span className="sr-only">{labels.columnSelect}</span></TableHead>
                  <TableHead scope="col" className="px-4 py-3">{labels.columnName}</TableHead>
                  <TableHead scope="col" className="px-4 py-3">{labels.columnCode}</TableHead>
                  <TableHead scope="col" className="px-4 py-3">{labels.columnStatus}</TableHead>
                  <TableHead scope="col" className="px-4 py-3">{labels.columnLocation}</TableHead>
                  <TableHead scope="col" className="px-4 py-3">{labels.columnDeactivated}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100">
                {visibleRows.map((machine) => {
                  const status = normalizeStatus(machine);
                  return (
                    <TableRow key={machine.id} data-testid="settings-machine-row" data-machine-id={machine.id} data-status={status} className="align-top hover:bg-slate-50">
                      <TableCell className="px-4 py-3">
                        <Checkbox
                          checked={selected.has(machine.id)}
                          onCheckedChange={(checked) => toggleSelected(machine.id, checked)}
                          aria-label={formatSelectMachineLabel(labels.selectMachine, machine.name)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                      </TableCell>
                      <TableCell className="px-4 py-3 font-medium text-slate-950">{machine.name}</TableCell>
                      <TableCell className="px-4 py-3 font-mono text-xs text-slate-600">{machine.code}</TableCell>
                      <TableCell className="px-4 py-3"><MachineStatusBadge status={status} labels={labels} /></TableCell>
                      <TableCell className="px-4 py-3"><MachineBreadcrumb machine={machine} locations={locations} labels={labels} /></TableCell>
                      <TableCell className="px-4 py-3 text-xs text-slate-600" data-machine-deactivated-at>
                        {machine.deactivated_at ? `${labels.deactivated} ${machine.deactivated_at.slice(0, 10)}` : ''}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div role="status" className="p-4">{labels.empty}</div>
          )
        ) : (
          <div className="p-4"><StateNotice state={state} labels={labels} /></div>
        )}
      </section>
    </main>
  );
}
