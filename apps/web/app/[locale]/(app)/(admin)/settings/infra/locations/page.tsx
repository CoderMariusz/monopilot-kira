import React from 'react';
import { getTranslations } from 'next-intl/server';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';

type Warehouse = { id: string; code: string; name: string };
type LocationRow = { id: string; warehouseId: string; parentId: string | null; name: string; level: number; path: string };
type CreateLocationInput = { csvRowNumber: number; warehouseId: string; parentPath: string | null; name: string; level: number; path: string };
type CreateLocationResult =
  | { ok: true; data?: unknown }
  | { ok: false; error?: { code?: string; rowNumber?: number; validation?: string; message?: string } };
type LocationTreePageProps = {
  params?: Promise<{ locale: string }>;
  warehouses?: Warehouse[];
  locations?: LocationRow[];
  selectedWarehouseId?: string;
  canImport?: boolean;
  createLocation?: (input: CreateLocationInput) => Promise<CreateLocationResult> | CreateLocationResult;
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';
};

type LocationTreeLabels = {
  title: string;
  subtitle: string;
  workspace: string;
  settingsNavigation: string;
  sidebarLabel: string;
  sectionTitle: string;
  warehouse: string;
  allWarehouses: string;
  importCsv: string;
  csvFile: string;
  insufficientPermissions: string;
  loading: string;
  empty: string;
  error: string;
  forbidden: string;
  provenance: string;
  expand: string;
  leaf: string;
  level: string;
  importSuccess: string;
  importError: string;
};

const DEFAULT_LABELS: LocationTreeLabels = {
  title: 'title',
  subtitle: 'subtitle',
  workspace: 'workspace',
  settingsNavigation: 'settingsNavigation',
  sidebarLabel: 'sidebarLabel',
  sectionTitle: 'sectionTitle',
  warehouse: 'warehouse',
  allWarehouses: 'allWarehouses',
  importCsv: 'importCsv',
  csvFile: 'csvFile',
  insufficientPermissions: 'insufficientPermissions',
  loading: 'loading',
  empty: 'empty',
  error: 'error',
  forbidden: 'forbidden',
  provenance: 'provenance',
  expand: 'expand',
  leaf: 'leaf',
  level: 'level',
  importSuccess: 'importSuccess',
  importError: 'importError',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof LocationTreeLabels>;

async function buildLabels(locale: string): Promise<LocationTreeLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.infra.locations' });
    return LABEL_KEYS.reduce((labels, key) => {
      try {
        labels[key] = t(key);
      } catch {
        labels[key] = DEFAULT_LABELS[key];
      }
      return labels;
    }, {} as LocationTreeLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

function formatLabel(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((label, [key, value]) => label.replace(`{${key}}`, String(value)), template);
}

function sortByPath(rows: LocationRow[]) {
  return [...rows].sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
}

function hasChildren(row: LocationRow, rows: LocationRow[]) {
  return rows.some((candidate) => candidate.parentId === row.id);
}

function parseCsv(text: string): CreateLocationInput[] {
  const [headerLine, ...lines] = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const headers = (headerLine ?? '').split(',').map((header) => header.trim());
  const indexOf = (name: string) => headers.indexOf(name);
  return lines.map((line, index) => {
    const cells = line.split(',').map((cell) => cell.trim());
    const value = (name: string) => cells[indexOf(name)] ?? '';
    const parentPath = value('parentPath');
    return {
      csvRowNumber: index + 1,
      warehouseId: value('warehouseId'),
      parentPath: parentPath.length > 0 ? parentPath : null,
      name: value('name'),
      level: Number.parseInt(value('level'), 10),
      path: value('path'),
    };
  });
}

async function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('csv_read_failed'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsText(file);
  });
}

async function postLocationImport(input: CreateLocationInput): Promise<CreateLocationResult> {
  const response = await fetch('/api/infra/locations/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    return {
      ok: false,
      error: {
        code: payload?.error?.code ?? payload?.code ?? 'IMPORT_ERROR',
        rowNumber: payload?.error?.rowNumber ?? payload?.rowNumber ?? input.csvRowNumber,
        validation: payload?.error?.validation ?? payload?.validation ?? 'V-SET-60',
        message: payload?.error?.message ?? payload?.message ?? '',
      },
    };
  }
  return { ok: true, data: payload?.data ?? payload };
}

export default async function LocationTreePage(propsInput: unknown) {
  const props = (propsInput ?? {}) as LocationTreePageProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const labels = await buildLabels(locale);
  const locations = sortByPath(props.locations ?? []);
  const state = props.state ?? (locations.length === 0 ? 'empty' : 'ready');

  return (
    <LocationTreeScreen
      labels={labels}
      warehouses={props.warehouses ?? []}
      locations={locations}
      selectedWarehouseId={props.selectedWarehouseId ?? 'all'}
      canImport={props.canImport ?? false}
      createLocation={props.createLocation ?? postLocationImport}
      state={state}
    />
  );
}

function LocationTreeScreen({
  labels,
  warehouses,
  locations,
  selectedWarehouseId: initialWarehouseId,
  canImport,
  createLocation,
  state,
}: {
  labels: LocationTreeLabels;
  warehouses: Warehouse[];
  locations: LocationRow[];
  selectedWarehouseId: string;
  canImport: boolean;
  createLocation: (input: CreateLocationInput) => Promise<CreateLocationResult> | CreateLocationResult;
  state: NonNullable<LocationTreePageProps['state']>;
}) {
  const [selectedWarehouseId, setSelectedWarehouseId] = React.useState(initialWarehouseId);
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(() => new Set());
  const [csvFile, setCsvFile] = React.useState<File | null>(null);
  const [toast, setToast] = React.useState<{ role: 'status' | 'alert'; message: string }>({ role: 'status', message: '' });
  const [pendingImport, setPendingImport] = React.useState(false);

  React.useEffect(() => {
    setSelectedWarehouseId(initialWarehouseId);
    setExpandedIds(new Set());
    setToast({ role: 'status', message: '' });
  }, [initialWarehouseId, locations]);

  const toggleExpanded = (rowId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const importCsv = async () => {
    if (!canImport || !csvFile) return;
    setPendingImport(true);
    const rows = parseCsv(await readFileText(csvFile));
    const errors: string[] = [];

    for (const row of rows) {
      const result = await createLocation(row);
      if (!result.ok) {
        const error = 'error' in result ? (result.error ?? {}) : {};
        errors.push(formatLabel(labels.importError, {
          row: error.rowNumber ?? row.csvRowNumber,
          code: error.code ?? 'IMPORT_ERROR',
          validation: error.validation ?? 'V-SET-60',
          message: error.message ?? '',
        }).trim());
      }
    }

    setToast(
      errors.length > 0
        ? { role: 'alert', message: errors.join('; ') }
        : { role: 'status', message: formatLabel(labels.importSuccess, { count: rows.length }) },
    );
    setPendingImport(false);
  };

  const renderState = () => {
    if (state === 'loading') return <section role="status" aria-live="polite" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">{labels.loading}</section>;
    if (state === 'error') return <section role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 shadow-sm">{labels.error}</section>;
    if (state === 'permission_denied') return <section role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 shadow-sm">{labels.forbidden}</section>;
    if (state === 'empty') return <section role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-slate-600 shadow-sm">{labels.empty}</section>;
    return null;
  };

  const visibleRows = locations.filter((location) => selectedWarehouseId === 'all' || location.warehouseId === selectedWarehouseId);

  return (
    <main data-testid="app-shell" className="min-h-screen bg-slate-50 text-slate-950">
      <aside data-testid="app-sidebar" aria-label={labels.settingsNavigation} className="border-b border-slate-200 bg-white px-6 py-3 text-sm text-slate-600">
        {labels.sidebarLabel}
      </aside>
      <header data-testid="app-topbar" className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">SET-014</div>
        <h1 className="text-2xl font-semibold">{labels.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{labels.subtitle}</p>
      </header>

      <section className="mx-auto max-w-6xl space-y-4 p-6" aria-label={labels.workspace}>
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-base font-semibold">{labels.sectionTitle} ({visibleRows.length})</div>
              <p className="mt-1 text-xs text-slate-500">{labels.provenance}</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-sm font-medium" htmlFor="warehouse-filter">
                {labels.warehouse}
                <Select
                  id="warehouse-filter"
                  aria-label={labels.warehouse}
                  className="min-w-64"
                  value={selectedWarehouseId}
                  options={[
                    { value: 'all', label: labels.allWarehouses },
                    ...warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name })),
                  ]}
                  onValueChange={setSelectedWarehouseId}
                >
                  <SelectTrigger aria-label={labels.warehouse}>
                    <SelectValue placeholder={labels.allWarehouses} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{labels.allWarehouses}</SelectItem>
                    {warehouses.map((warehouse) => (
                      <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              <label className="grid gap-1 text-sm font-medium" htmlFor="location-csv-file">
                {labels.csvFile}
                <Input
                  id="location-csv-file"
                  aria-label={labels.csvFile}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                  type="file"
                  accept=".csv,text/csv"
                  disabled={!canImport || pendingImport}
                  onChange={(event) => setCsvFile(event.currentTarget.files?.[0] ?? null)}
                />
              </label>

              <Button
                type="button"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
                disabled={!canImport || pendingImport}
                aria-label={!canImport ? labels.insufficientPermissions : labels.importCsv}
                onClick={() => void importCsv()}
              >
                {labels.importCsv}
              </Button>
            </div>
          </div>
        </section>

        {state === 'ready' ? (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div role="tree" aria-label={labels.title} className="space-y-2">
              {visibleRows.map((location) => {
                const expandable = hasChildren(location, locations);
                const parentCollapsed = location.parentId !== null && !expandedIds.has(location.parentId);
                const expanded = expandable ? expandedIds.has(location.id) : undefined;

                if (parentCollapsed) return null;

                return (
                  <div
                    key={location.id}
                    role="treeitem"
                    aria-level={location.level}
                    aria-expanded={expanded}
                    data-location-id={location.id}
                    data-parent-id={location.parentId ?? undefined}
                    data-warehouse-id={location.warehouseId}
                    className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
                    style={{ marginLeft: `${Math.max(location.level - 1, 0) * 24}px` }}
                  >
                    <div className="flex items-center gap-2">
                      {expandable ? (
                        <Button
                          type="button"
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700"
                          aria-label={formatLabel(labels.expand, { name: location.name })}
                          onClick={() => toggleExpanded(location.id)}
                        >
                          {labels.expand.replace(' {name}', '')}
                        </Button>
                      ) : (
                        <span aria-hidden="true" className="w-14 text-center text-xs text-slate-400">•</span>
                      )}
                      <span className="font-medium">{location.name}</span>
                      <Badge variant="outline" className="font-mono text-xs">{location.path}</Badge>
                      <Badge variant={location.level === 1 ? 'info' : 'secondary'}>{formatLabel(labels.level, { level: location.level })}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : renderState()}

        {toast.message ? (
          <div id="location-import-toast" role={toast.role} aria-live={toast.role === 'alert' ? 'assertive' : 'polite'} className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-800">
            {toast.message}
          </div>
        ) : null}
      </section>
    </main>
  );
}
