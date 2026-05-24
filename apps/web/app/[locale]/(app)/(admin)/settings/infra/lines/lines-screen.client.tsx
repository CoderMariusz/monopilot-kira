'use client';

import React from 'react';
import { useTranslations } from 'next-intl';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, type SelectOption } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

export type LineStatus = 'draft' | 'active' | 'inactive';

export type MachinePreview = {
  id: string;
  code: string;
  name: string;
  seq: number;
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

export type ActivateLineResult =
  | { ok: true; data: { lineId: string; status: 'active' } }
  | { ok: false; code: 'NO_MACHINE'; validation: 'V-SET-62'; lineId: string; message: string };

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
  canUpdateInfra: boolean;
  activateLine: (input: ActivateLineInput) => Promise<ActivateLineResult> | ActivateLineResult;
  state: LinesPageState;
};

function labelsFromTranslations(t: ReturnType<typeof useTranslations>): LinesLabels {
  return LINE_LABEL_KEYS.reduce((labels, key) => {
    try {
      const translated = t(key);
      labels[key] = translated === key ? DEFAULT_LINES_LABELS[key] : translated;
    } catch {
      labels[key] = DEFAULT_LINES_LABELS[key];
    }
    return labels;
  }, {} as LinesLabels);
}

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

export default function LinesScreen({ labels: labelsProp, lines, canUpdateInfra, activateLine, state }: LinesScreenProps) {
  const t = useTranslations('settings.infra.lines');
  const labels = React.useMemo(() => labelsProp ?? labelsFromTranslations(t), [labelsProp, t]);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [statusById, setStatusById] = React.useState<Record<string, LineStatus>>(() =>
    Object.fromEntries(lines.map((line) => [line.id, line.status])),
  );
  const [rowErrors, setRowErrors] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const [warehouseFilter, setWarehouseFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');

  React.useEffect(() => {
    setStatusById(Object.fromEntries(lines.map((line) => [line.id, line.status])));
    setSelectedIds([]);
    setRowErrors({});
    setWarehouseFilter('all');
    setStatusFilter('all');
  }, [lines]);

  const warehouseOptions = React.useMemo<SelectOption[]>(() => {
    const seen = new Map<string, string>();
    for (const line of lines) {
      if (line.warehouseId) seen.set(line.warehouseId, line.warehouseName ?? line.warehouseId);
    }
    return [
      { value: 'all', label: labels.allWarehouses },
      ...Array.from(seen.entries()).map(([value, label]) => ({ value, label })),
    ];
  }, [labels.allWarehouses, lines]);

  const visibleLines = React.useMemo(() => {
    return lines.filter((line) => {
      const currentStatus = statusById[line.id] ?? line.status;
      const warehouseMatches = warehouseFilter === 'all' || line.warehouseId === warehouseFilter;
      const statusMatches = statusFilter === 'all' || currentStatus === statusFilter;
      return warehouseMatches && statusMatches;
    });
  }, [lines, statusById, statusFilter, warehouseFilter]);

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
        nextErrors[result.lineId] = `${labels.noMachineCode}: ${result.message || labels.noMachineBody} ${result.validation}`;
      }
    }

    setRowErrors(nextErrors);
    setPending(false);
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
            disabled={!canUpdateInfra || pending || selectedVisibleCount === 0}
            aria-label={!canUpdateInfra ? labels.insufficientPermission : labels.bulkActivate}
            onClick={() => void bulkActivate()}
          >
            {pending ? labels.bulkActivatePending : labels.bulkActivate}
          </Button>
          <Button type="button" variant="dry-run" disabled={!canUpdateInfra || selectedVisibleCount === 0} aria-label={!canUpdateInfra ? labels.insufficientPermission : labels.bulkDeactivate}>
            {labels.bulkDeactivate}
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
    </main>
  );
}
