'use client';

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Checkbox } from '@monopilot/ui/Checkbox';
import Input from '@monopilot/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, type SelectOption } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

export type LineStatus = 'draft' | 'active' | 'inactive';

export type MachinePreview = {
  id: string;
  code: string;
  name: string;
  seq: number;
};

export type MachineOption = {
  id: string;
  code: string;
  name: string;
};

export type SiteOption = {
  id: string;
  code: string;
  name: string;
  isDefault?: boolean;
};

export type WarehouseOption = {
  id: string;
  name: string;
};

export type LocationOption = {
  id: string;
  code: string;
  name: string;
  warehouseId: string | null;
  path: string | null;
};

export type ProductionLine = {
  id: string;
  code: string;
  name: string;
  status: LineStatus;
  defaultLocationId?: string | null;
  defaultLocationBreadcrumb?: string | null;
  warehouseId?: string | null;
  warehouseName?: string | null;
  machines: MachinePreview[];
};

export type ActivateLineInput = { lineId: string };
export type DeactivateLineInput = { lineId: string };
export type CreateLineInput = {
  siteId?: string | null;
  warehouseId?: string | null;
  defaultOutputLocationId?: string | null;
  code: string;
  name: string;
  status: 'draft' | 'active';
  machineIds: string[];
};
export type CreateLineResult =
  | { ok: true; data: { id: string; status: 'draft' | 'active' } }
  | { ok: false; error?: string };

export type ActivateLineResult =
  | { ok: true; data: { lineId: string; status: 'active' } }
  | { ok: false; code: 'NO_MACHINE'; validation: 'V-SET-62'; lineId: string; message: string }
  | { ok: false; code: 'ACTIVATION_FAILED'; lineId: string; message: string };

export type DeactivateLineResult =
  | { ok: true; data: { lineId: string; status: 'inactive' } }
  | { ok: false; code: 'PERMISSION_DENIED'; lineId: string; message: string }
  | { ok: false; code: 'DEACTIVATION_FAILED'; lineId: string; message: string };

export type LinesPageState = 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';

export type LinesLabels = {
  title: string;
  subtitle: string;
  sectionTitle: string;
  sectionSubtitle: string;
  columnSelect: string;
  columnLine: string;
  columnDefaultLocation: string;
  columnStatus: string;
  columnMachines: string;
  warehouseFilter: string;
  allWarehouses: string;
  statusFilter: string;
  statusAll: string;
  statusActive: string;
  statusDraft: string;
  bulkActivate: string;
  bulkActivatePending: string;
  bulkDeactivate: string;
  bulkDeactivatePending: string;
  addLine: string;
  dialogAddTitle: string;
  fieldCode: string;
  fieldName: string;
  fieldSite: string;
  fieldStatus: string;
  fieldMachines: string;
  createLine: string;
  createLinePending: string;
  cancel: string;
  createLineSuccess: string;
  createLineFailed: string;
  noMachinesAvailable: string;
  insufficientPermission: string;
  noMachineTitle: string;
  noMachineCode: string;
  noMachineBody: string;
  selectLine: string;
  loading: string;
  empty: string;
  error: string;
  forbidden: string;
  provenance: string;
  unavailable: string;
};

export const DEFAULT_LINES_LABELS: LinesLabels = {
  title: 'Production lines',
  subtitle: 'Manage production lines and their assigned machine sequence.',
  sectionTitle: 'Production lines',
  sectionSubtitle: 'Live production line rows with ordered machine sequence previews.',
  columnSelect: 'Select',
  columnLine: 'Line',
  columnDefaultLocation: 'Default location',
  columnStatus: 'Status',
  columnMachines: 'Machine sequence preview',
  warehouseFilter: 'Warehouse',
  allWarehouses: 'All warehouses',
  statusFilter: 'Status',
  statusAll: 'All statuses',
  statusActive: 'Active',
  statusDraft: 'Draft',
  bulkActivate: 'Bulk Activate',
  bulkActivatePending: 'Activating…',
  bulkDeactivate: 'Bulk Deactivate',
  bulkDeactivatePending: 'Deactivating…',
  addLine: 'Add line',
  dialogAddTitle: 'Add production line',
  fieldCode: 'Code',
  fieldName: 'Name',
  fieldSite: 'Site',
  fieldStatus: 'Status',
  fieldMachines: 'Machine sequence',
  createLine: 'Create line',
  createLinePending: 'Creating…',
  cancel: 'Cancel',
  createLineSuccess: 'Production line created.',
  createLineFailed: 'Production line could not be created.',
  noMachinesAvailable: 'Create at least one machine before creating an active line.',
  insufficientPermission: 'Insufficient permissions: settings.infra.update is required to activate production lines.',
  noMachineTitle: 'No machines assigned',
  noMachineCode: 'NO_MACHINE',
  noMachineBody: 'Assign at least one machine before activating this line. V-SET-62',
  selectLine: 'Select {name}',
  loading: 'Loading production lines…',
  empty: 'No production lines are available for this workspace.',
  error: 'Unable to load production lines. Try again after the backend is available.',
  forbidden: 'You do not have permission to view production line infrastructure settings.',
  provenance: 'Data source: withOrgContext-scoped production_lines query; prototype mock rows are not used in production.',
  unavailable: '—',
};

export const LINE_LABEL_KEYS = Object.keys(DEFAULT_LINES_LABELS) as Array<keyof LinesLabels>;

export type LinesScreenProps = {
  labels?: LinesLabels;
  lines: ProductionLine[];
  machines: MachineOption[];
  sites?: SiteOption[];
  warehouses?: WarehouseOption[];
  locations?: LocationOption[];
  canUpdateInfra: boolean;
  activateLine: (input: ActivateLineInput) => Promise<ActivateLineResult> | ActivateLineResult;
  deactivateLine?: (input: DeactivateLineInput) => Promise<DeactivateLineResult> | DeactivateLineResult;
  createLine: (input: CreateLineInput) => Promise<CreateLineResult> | CreateLineResult;
  state: LinesPageState;
};

function orderedMachines(line: ProductionLine) {
  return [...line.machines].sort((left, right) => left.seq - right.seq || left.code.localeCompare(right.code));
}

function formatSelectLabel(template: string, line: ProductionLine) {
  return template.includes('{name}') ? template.replace('{name}', line.name) : `Select ${line.name}`;
}

function formatStatus(label: LinesLabels, status: LineStatus) {
  if (status === 'active') return label.statusActive;
  if (status === 'draft') return label.statusDraft;
  return status;
}

function statusVariant(status: LineStatus) {
  return status === 'active' ? 'success' : 'secondary';
}

function formatActivationError(result: Extract<ActivateLineResult, { ok: false }>, labels: LinesLabels) {
  if (result.code === 'NO_MACHINE') {
    return `${labels.noMachineCode}: ${result.message || labels.noMachineBody} ${result.validation}`;
  }
  return result.message || labels.error;
}

function defaultSiteId(sites: SiteOption[]) {
  return sites.find((site) => site.isDefault)?.id ?? sites[0]?.id ?? null;
}

function defaultWarehouseId(warehouses: WarehouseOption[], warehouseFilter: string) {
  if (warehouseFilter !== 'all' && warehouses.some((warehouse) => warehouse.id === warehouseFilter)) return warehouseFilter;
  return null;
}

function SelectField({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-800" htmlFor={id}>
      {label}
      <Select value={value} onValueChange={onChange} options={options} id={id} name={label} aria-label={label}>
        <SelectTrigger className="min-w-48" aria-label={label}>
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

export default function LinesScreen({ labels: labelsProp, lines, machines, sites = [], warehouses = [], locations = [], canUpdateInfra, activateLine, deactivateLine, createLine, state }: LinesScreenProps) {
  const labels = labelsProp ?? DEFAULT_LINES_LABELS;
  const [rows, setRows] = React.useState<ProductionLine[]>(() => [...lines]);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [statusById, setStatusById] = React.useState<Record<string, LineStatus>>(() =>
    Object.fromEntries(rows.map((line) => [line.id, line.status])),
  );
  const [rowErrors, setRowErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const [deactivatePending, setDeactivatePending] = React.useState(false);
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [createPending, setCreatePending] = React.useState(false);
  const [createStatus, setCreateStatus] = React.useState<string | null>(null);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [warehouseFilter, setWarehouseFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [newLine, setNewLine] = React.useState<CreateLineInput>(() => ({
    siteId: defaultSiteId(sites),
    warehouseId: defaultWarehouseId(warehouses, 'all'),
    defaultOutputLocationId: null,
    code: '',
    name: '',
    status: 'draft',
    machineIds: [],
  }));

  React.useEffect(() => {
    setRows([...lines]);
  }, [lines]);

  React.useEffect(() => {
    setNewLine((current) => ({
      ...current,
      siteId: current.siteId ?? defaultSiteId(sites),
      warehouseId: current.warehouseId && warehouses.some((warehouse) => warehouse.id === current.warehouseId)
        ? current.warehouseId
        : defaultWarehouseId(warehouses, warehouseFilter),
      defaultOutputLocationId: current.defaultOutputLocationId && locations.some((location) => location.id === current.defaultOutputLocationId && location.warehouseId === current.warehouseId)
        ? current.defaultOutputLocationId
        : null,
    }));
  }, [locations, sites, warehouseFilter, warehouses]);

  React.useEffect(() => {
    setStatusById(Object.fromEntries(rows.map((line) => [line.id, line.status])));
    setSelectedIds([]);
    setRowErrors({});
  }, [rows]);

  const warehouseOptions = React.useMemo<SelectOption[]>(() => {
    return [
      { value: 'all', label: labels.allWarehouses },
      ...warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name })),
    ];
  }, [labels.allWarehouses, warehouses]);

  const createWarehouseOptions = React.useMemo<SelectOption[]>(() => [
    { value: 'none', label: labels.unavailable },
    ...warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name })),
  ], [labels.unavailable, warehouses]);

  const outputLocationOptions = React.useMemo<SelectOption[]>(() => {
    const matchingLocations = newLine.warehouseId
      ? locations.filter((location) => location.warehouseId === newLine.warehouseId)
      : [];
    return [
      { value: 'none', label: '— none —' },
      ...matchingLocations.map((location) => ({
        value: location.id,
        label: `${location.code} - ${location.name}${location.path ? ` (${location.path})` : ''}`,
      })),
    ];
  }, [locations, newLine.warehouseId]);

  const visibleLines = React.useMemo(() => {
    return rows.filter((line) => {
      const currentStatus = statusById[line.id] ?? line.status;
      const warehouseMatches = warehouseFilter === 'all' || line.warehouseId === warehouseFilter;
      const statusMatches = statusFilter === 'all' || currentStatus === statusFilter;
      return warehouseMatches && statusMatches;
    });
  }, [rows, statusById, statusFilter, warehouseFilter]);

  const toggleSelected = (lineId: string, checked: boolean) => {
    setSelectedIds((current) => (checked ? [...new Set([...current, lineId])] : current.filter((id) => id !== lineId)));
  };

  const bulkActivate = async () => {
    if (!canUpdateInfra || selectedIds.length === 0) return;
    setPending(true);
    const nextErrors: Record<string, string> = {};

    for (const lineId of selectedIds) {
      const result = await activateLine({ lineId });
      if ('data' in result) {
        setStatusById((current) => ({ ...current, [result.data.lineId]: result.data.status }));
      } else {
        nextErrors[result.lineId] = formatActivationError(result, labels);
      }
    }

    setRowErrors(nextErrors);
    setPending(false);
  };

  const bulkDeactivate = async () => {
    if (!canUpdateInfra || !deactivateLine || selectedIds.length === 0) return;
    setDeactivatePending(true);
    const nextErrors: Record<string, string> = {};

    for (const lineId of selectedIds) {
      const result = await deactivateLine({ lineId });
      if ('data' in result) {
        setStatusById((current) => ({ ...current, [result.data.lineId]: result.data.status }));
      } else {
        nextErrors[result.lineId] = result.message || labels.error;
      }
    }

    setRowErrors(nextErrors);
    setDeactivatePending(false);
  };

  const toggleCreateMachine = (machineId: string, checked: boolean) => {
    setNewLine((current) => ({
      ...current,
      machineIds: checked ? [...current.machineIds, machineId] : current.machineIds.filter((id) => id !== machineId),
    }));
  };

  const submitCreateLine = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canUpdateInfra || createPending) return;
    if (newLine.status === 'active' && newLine.machineIds.length === 0) {
      setCreateError(labels.noMachineBody);
      return;
    }
    setCreatePending(true);
    setCreateError(null);
    setCreateStatus(null);
    try {
      const createInput: CreateLineInput = newLine.defaultOutputLocationId
        ? newLine
        : {
            siteId: newLine.siteId,
            warehouseId: newLine.warehouseId,
            code: newLine.code,
            name: newLine.name,
            status: newLine.status,
            machineIds: newLine.machineIds,
          };
      const result = await createLine(createInput);
      if (!result.ok) {
        setCreateError(labels.createLineFailed);
        return;
      }
      const selectedMachines = newLine.machineIds
        .map((id, index) => {
          const machine = machines.find((candidate) => candidate.id === id);
          return machine ? { ...machine, seq: index + 1 } : null;
        })
        .filter((machine): machine is MachinePreview => machine !== null);
      const selectedWarehouse = newLine.warehouseId ? warehouses.find((warehouse) => warehouse.id === newLine.warehouseId) ?? null : null;
      setRows((current) => [
        {
          id: result.data.id,
          code: newLine.code.trim().toUpperCase(),
          name: newLine.name.trim(),
          status: result.data.status,
          warehouseId: newLine.warehouseId ?? null,
          warehouseName: selectedWarehouse?.name ?? null,
          defaultLocationId: newLine.defaultOutputLocationId ?? null,
          defaultLocationBreadcrumb: newLine.defaultOutputLocationId
            ? locations.find((location) => location.id === newLine.defaultOutputLocationId)?.path
              ?? locations.find((location) => location.id === newLine.defaultOutputLocationId)?.name
              ?? null
            : null,
          machines: selectedMachines,
        },
        ...current.filter((line) => line.id !== result.data.id),
      ]);
      setNewLine({
        siteId: defaultSiteId(sites),
        warehouseId: defaultWarehouseId(warehouses, warehouseFilter),
        defaultOutputLocationId: null,
        code: '',
        name: '',
        status: 'draft',
        machineIds: [],
      });
      setCreateStatus(labels.createLineSuccess);
      setCreateDialogOpen(false);
    } finally {
      setCreatePending(false);
    }
  };

  const openCreateDialog = () => {
    if (!canUpdateInfra) return;
    setNewLine((current) => ({
      ...current,
      siteId: current.siteId ?? defaultSiteId(sites),
      warehouseId: defaultWarehouseId(warehouses, warehouseFilter) ?? current.warehouseId ?? null,
      defaultOutputLocationId: null,
    }));
    setCreateDialogOpen(true);
  };

  const renderState = () => {
    if (state === 'loading') return <section role="status" aria-live="polite" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">{labels.loading}</section>;
    if (state === 'error') return <section role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 shadow-sm">{labels.error}</section>;
    if (state === 'permission_denied') return <section role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 shadow-sm">{labels.forbidden}</section>;
    if (state === 'empty') return <section role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-slate-600 shadow-sm">{labels.empty}</section>;
    return null;
  };

  const selectedVisibleCount = selectedIds.filter((id) => visibleLines.some((line) => line.id === id)).length;

  return (
    <main data-screen="settings-infra-lines" className="space-y-4" aria-labelledby="settings-infra-lines-title">
      <header data-region="page-head" className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">SET-018 · Line infrastructure</div>
          <h1 id="settings-infra-lines-title" className="text-2xl font-semibold text-slate-950">{labels.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{labels.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Production line actions">
          <Button
            type="button"
            className="btn-primary"
            disabled={!canUpdateInfra}
            aria-label={canUpdateInfra ? labels.addLine : `${labels.addLine} — ${labels.insufficientPermission}`}
            onClick={openCreateDialog}
          >
            + {labels.addLine}
          </Button>
          <Button
            type="button"
            className="btn-secondary"
            disabled={!canUpdateInfra || pending || selectedVisibleCount === 0}
            aria-label={!canUpdateInfra ? labels.insufficientPermission : labels.bulkActivate}
            onClick={() => void bulkActivate()}
          >
            {pending ? labels.bulkActivatePending : labels.bulkActivate}
          </Button>
          <Button
            type="button"
            variant="dry-run"
            disabled={!canUpdateInfra || !deactivateLine || deactivatePending || selectedVisibleCount === 0}
            aria-label={!canUpdateInfra ? labels.insufficientPermission : labels.bulkDeactivate}
            onClick={() => void bulkDeactivate()}
          >
            {deactivatePending ? labels.bulkDeactivatePending : labels.bulkDeactivate}
          </Button>
        </div>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Production line controls">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-base font-semibold">{labels.sectionTitle} ({visibleLines.length})</div>
            <p className="mt-1 text-xs text-slate-500">{labels.sectionSubtitle}</p>
            <p className="mt-1 text-xs text-slate-500">{labels.provenance}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <SelectField id="line-warehouse-filter" label={labels.warehouseFilter} value={warehouseFilter} options={warehouseOptions} onChange={setWarehouseFilter} />
            <SelectField
              id="line-status-filter"
              label={labels.statusFilter}
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: labels.statusAll },
                { value: 'active', label: labels.statusActive },
                { value: 'draft', label: labels.statusDraft },
              ]}
            />
          </div>
        </div>
      </section>

      {createStatus ? <section role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-sm">{createStatus}</section> : null}
      {createError ? <section role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm">{createError}</section> : null}

      {state === 'ready' ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-label={labels.title}>
          <Table aria-label={labels.title} className="w-full text-sm">
            <TableHeader className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <TableRow>
                <TableHead scope="col" className="w-12 px-4 py-3"><span className="sr-only">{labels.columnSelect}</span></TableHead>
                <TableHead scope="col" className="px-4 py-3">{labels.columnLine}</TableHead>
                <TableHead scope="col" className="px-4 py-3">{labels.columnDefaultLocation}</TableHead>
                <TableHead scope="col" className="px-4 py-3">{labels.columnMachines}</TableHead>
                <TableHead scope="col" className="px-4 py-3">{labels.columnStatus}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-100">
              {visibleLines.map((line) => {
                const status = statusById[line.id] ?? line.status;
                const machines = orderedMachines(line);
                const visibleMachines = machines.slice(0, 6);
                const overflowCount = Math.max(machines.length - visibleMachines.length, 0);
                const rowError = rowErrors[line.id];

                return (
                  <TableRow key={line.id} className="align-top" data-testid="settings-line-row">
                    <TableCell className="px-4 py-4">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        aria-label={formatSelectLabel(labels.selectLine, line)}
                        checked={selectedIds.includes(line.id)}
                        onChange={(event) => toggleSelected(line.id, event.currentTarget.checked)}
                      />
                    </TableCell>
                    <TableCell className="px-4 py-4">
                      <div className="font-medium text-slate-950">{line.name}</div>
                      <div className="mt-1 font-mono text-xs text-slate-500">{line.code}</div>
                      {rowError ? (
                        <div role="alert" className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
                          <span className="font-semibold">{labels.noMachineTitle}</span>: {rowError}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="px-4 py-4 text-sm text-slate-700">
                      <span className="font-mono text-xs">{line.defaultLocationBreadcrumb || labels.unavailable}</span>
                    </TableCell>
                    <TableCell className="px-4 py-4">
                      <div data-testid="settings-line-machine-preview" className="flex max-w-xl flex-wrap gap-2">
                        {visibleMachines.length > 0 ? visibleMachines.map((machine) => (
                          <Badge
                            key={machine.id}
                            data-testid="settings-line-machine-chip"
                            variant="outline"
                            className="gap-1 font-mono text-xs"
                            title={machine.name}
                          >
                            <span className="font-semibold">{machine.seq}</span> {machine.code}
                          </Badge>
                        )) : <span className="text-xs text-slate-500">{labels.noMachineTitle}</span>}
                        {overflowCount > 0 ? <Badge variant="secondary" className="font-mono text-xs">+{overflowCount} more</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-4">
                      <Badge variant={statusVariant(status)}>{formatStatus(labels, status)}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {visibleLines.length === 0 ? <div role="status" className="border-t border-slate-100 p-4 text-sm text-slate-600">{labels.empty}</div> : null}
        </section>
      ) : renderState()}

      {createDialogOpen ? (
        <div role="dialog" aria-modal="true" aria-labelledby="add-line-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <h2 id="add-line-title" className="text-lg font-semibold text-slate-950">{labels.dialogAddTitle}</h2>
              <Button type="button" variant="dry-run" aria-label={labels.cancel} onClick={() => setCreateDialogOpen(false)} disabled={createPending}>x</Button>
            </div>
            <form onSubmit={(event) => void submitCreateLine(event)} className="mt-4 space-y-4">
              {/* Modal field set: code, name, site, warehouse, default output location, status, machine sequence. */}
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="new-line-code">
                {labels.fieldCode}
                <Input
                  id="new-line-code"
                  aria-label={labels.fieldCode}
                  value={newLine.code}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setNewLine((current) => ({ ...current, code: value }));
                  }}
                  required
                  disabled={createPending}
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="new-line-name">
                {labels.fieldName}
                <Input
                  id="new-line-name"
                  aria-label={labels.fieldName}
                  value={newLine.name}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setNewLine((current) => ({ ...current, name: value }));
                  }}
                  required
                  disabled={createPending}
                />
              </label>
              {sites.length > 0 ? (
                <div className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <span id="new-line-site-label">{labels.fieldSite}</span>
                  <Select
                    value={newLine.siteId ?? ''}
                    onValueChange={(value) => setNewLine((current) => ({ ...current, siteId: value || null }))}
                  >
                    <SelectTrigger aria-label={labels.fieldSite}>
                      <SelectValue placeholder={labels.fieldSite} />
                    </SelectTrigger>
                    <SelectContent>
                      {sites.map((site) => (
                        <SelectItem key={site.id} value={site.id}>
                          {site.code} - {site.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span id="new-line-warehouse-label">{labels.warehouseFilter}</span>
                <Select
                  value={newLine.warehouseId ?? 'none'}
                  onValueChange={(value) => setNewLine((current) => ({
                    ...current,
                    warehouseId: value === 'none' ? null : value,
                    defaultOutputLocationId: null,
                  }))}
                  options={createWarehouseOptions}
                  disabled={createPending}
                >
                  <SelectTrigger aria-label={labels.warehouseFilter}>
                    <SelectValue placeholder={labels.warehouseFilter} />
                  </SelectTrigger>
                  <SelectContent>
                    {createWarehouseOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span id="new-line-default-output-location-label">Default output location</span>
                <Select
                  value={newLine.defaultOutputLocationId ?? 'none'}
                  onValueChange={(value) => setNewLine((current) => ({ ...current, defaultOutputLocationId: value === 'none' ? null : value }))}
                  options={outputLocationOptions}
                  disabled={createPending || !newLine.warehouseId}
                >
                  <SelectTrigger aria-label="Default output location">
                    <SelectValue placeholder="Default output location" />
                  </SelectTrigger>
                  <SelectContent>
                    {outputLocationOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span id="new-line-status-label">{labels.fieldStatus}</span>
                <Select value={newLine.status} onValueChange={(value) => setNewLine((current) => ({ ...current, status: value === 'active' ? 'active' : 'draft' }))}>
                  <SelectTrigger aria-label={labels.fieldStatus}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">{labels.statusDraft}</SelectItem>
                    <SelectItem value="active">{labels.statusActive}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <fieldset className="grid gap-2 rounded-lg border border-slate-200 p-3">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{labels.fieldMachines}</legend>
                {machines.length > 0 ? machines.map((machine) => (
                  <label key={machine.id} className="flex items-center gap-2 text-sm text-slate-800">
                    <Checkbox checked={newLine.machineIds.includes(machine.id)} onCheckedChange={(checked) => toggleCreateMachine(machine.id, checked)} disabled={createPending} />
                    <span><span className="font-mono text-xs text-slate-500">{machine.code}</span> {machine.name}</span>
                  </label>
                )) : <p className="text-sm text-slate-600">{labels.noMachinesAvailable}</p>}
              </fieldset>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="dry-run" onClick={() => setCreateDialogOpen(false)} disabled={createPending}>{labels.cancel}</Button>
                <Button type="submit" className="btn-primary" disabled={!canUpdateInfra || createPending} aria-label={canUpdateInfra ? labels.createLine : `${labels.createLine} — ${labels.insufficientPermission}`}>
                  {createPending ? labels.createLinePending : labels.createLine}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
