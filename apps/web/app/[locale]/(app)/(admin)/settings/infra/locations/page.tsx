import React from 'react';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';

type Warehouse = { id: string; code: string; name: string };
type LocationRow = { id: string; warehouseId: string; parentId: string | null; name: string; level: number; path: string };
type CreateLocationInput = { csvRowNumber: number; warehouseId: string; parentPath: string | null; name: string; level: number; path: string };
type CreateLocationResult =
  | { ok: true; data?: unknown }
  | { ok: false; error?: { code?: string; rowNumber?: number; validation?: string; message?: string } };
type LocationTreePageProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<{ warehouseId?: string; importStatus?: string; importMessage?: string }> | { warehouseId?: string; importStatus?: string; importMessage?: string };
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

type TreeNode = LocationRow & { children: TreeNode[] };

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

function buildTree(rows: LocationRow[]): TreeNode[] {
  const nodes = new Map<string, TreeNode>();
  for (const row of rows) nodes.set(row.id, { ...row, children: [] });

  const roots: TreeNode[] = [];
  for (const row of rows) {
    const node = nodes.get(row.id)!;
    if (row.parentId && nodes.has(row.parentId)) nodes.get(row.parentId)!.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function optionHref(value: string) {
  return value === 'all' ? '?' : `?warehouseId=${encodeURIComponent(value)}`;
}

function importResultHref(selectedWarehouseId: string, ok: boolean, message: string) {
  const params = new URLSearchParams();
  if (selectedWarehouseId !== 'all') params.set('warehouseId', selectedWarehouseId);
  params.set('importStatus', ok ? 'success' : 'error');
  params.set('importMessage', message);
  const query = params.toString();
  return query ? `?${query}` : '?';
}

export async function importLocationCsvText(
  text: string,
  createLocation: (input: CreateLocationInput) => Promise<CreateLocationResult> | CreateLocationResult,
  labels: Pick<LocationTreeLabels, 'importError' | 'importSuccess'> = DEFAULT_LABELS,
) {
  const rows = parseCsv(text);
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
  return errors.length > 0
    ? { ok: false as const, message: errors.join('; '), rows }
    : { ok: true as const, message: formatLabel(labels.importSuccess, { count: rows.length }), rows };
}

export default async function LocationTreePage(propsInput: unknown) {
  const props = (propsInput ?? {}) as LocationTreePageProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const searchParams = props.searchParams ? await props.searchParams : {};
  const labels = await buildLabels(locale);
  const locations = sortByPath(props.locations ?? []);
  const selectedWarehouseId = props.selectedWarehouseId ?? searchParams?.warehouseId ?? 'all';
  const state = props.state ?? (locations.length === 0 ? 'empty' : 'ready');
  const createLocation = props.createLocation ?? postLocationImport;
  const importToast = searchParams?.importMessage
    ? { role: searchParams.importStatus === 'error' ? 'alert' as const : 'status' as const, message: searchParams.importMessage }
    : null;

  async function importCsvAction(formData: FormData): Promise<void> {
    'use server';
    if (!(props.canImport ?? false)) return;
    const file = formData.get('csvFile');
    if (!(file instanceof File)) return;
    const result = await importLocationCsvText(await readFileText(file), createLocation, labels);
    redirect(importResultHref(selectedWarehouseId, result.ok, result.message));
  }

  return (
    <LocationTreeScreen
      labels={labels}
      warehouses={props.warehouses ?? []}
      locations={locations}
      selectedWarehouseId={selectedWarehouseId}
      canImport={props.canImport ?? false}
      state={state}
      importCsvAction={importCsvAction}
      importToast={importToast}
    />
  );
}

function LocationTreeScreen({
  labels,
  warehouses,
  locations,
  selectedWarehouseId,
  canImport,
  state,
  importCsvAction,
  importToast,
}: {
  labels: LocationTreeLabels;
  warehouses: Warehouse[];
  locations: LocationRow[];
  selectedWarehouseId: string;
  canImport: boolean;
  state: NonNullable<LocationTreePageProps['state']>;
  importCsvAction: (formData: FormData) => Promise<void>;
  importToast: { role: 'status' | 'alert'; message: string } | null;
}) {
  const visibleRows = locations.filter((location) => selectedWarehouseId === 'all' || location.warehouseId === selectedWarehouseId);
  const tree = buildTree(visibleRows);
  const warehouseOptions = [
    { value: 'all', label: labels.allWarehouses },
    ...warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name })),
  ];

  return (
    <main data-testid="settings-location-tree-screen" data-screen="settings-location-tree" className="min-h-screen bg-slate-50 text-slate-950">
      <header data-region="page-head" className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">SET-014</div>
        <h1 className="text-2xl font-semibold">{labels.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{labels.subtitle}</p>
      </header>

      <section className="mx-auto max-w-6xl space-y-4 p-6" aria-label={labels.workspace}>
        <form action={importCsvAction} data-location-import-form="true" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-base font-semibold">{labels.sectionTitle} ({visibleRows.length})</div>
              <p className="mt-1 text-xs text-slate-500">{labels.provenance}</p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-1 text-sm font-medium">
                <span id="warehouse-filter-label">{labels.warehouse}</span>
                <details className="min-w-64 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                  <summary role="combobox" aria-label={labels.warehouse} aria-haspopup="listbox" aria-expanded="false" className="cursor-pointer list-none">
                    {warehouseOptions.find((option) => option.value === selectedWarehouseId)?.label ?? labels.allWarehouses}
                  </summary>
                  <div role="listbox" className="mt-2 grid gap-1">
                    {warehouseOptions.map((option) => (
                      <a
                        key={option.value}
                        role="option"
                        aria-selected={option.value === selectedWarehouseId}
                        href={optionHref(option.value)}
                        className="rounded px-2 py-1 text-slate-700 hover:bg-slate-100"
                      >
                        {option.label}
                      </a>
                    ))}
                  </div>
                </details>
              </div>

              <label className="grid gap-1 text-sm font-medium" htmlFor="location-csv-file">
                {labels.csvFile}
                <Input
                  id="location-csv-file"
                  name="csvFile"
                  aria-label={labels.csvFile}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                  type="file"
                  accept=".csv,text/csv"
                  disabled={!canImport}
                />
              </label>

              <Button
                type="submit"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
                disabled={!canImport}
                aria-label={!canImport ? labels.insufficientPermissions : labels.importCsv}
              >
                {labels.importCsv}
              </Button>
            </div>
          </div>
        </form>

        {state === 'ready' ? (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div role="tree" aria-label={labels.title} className="space-y-2">
              {tree.map((location) => renderLocationNode(location, labels))}
            </div>
          </section>
        ) : renderState(state, labels)}

        {importToast ? (
          <div
            id="location-import-toast"
            role={importToast.role}
            aria-live={importToast.role === 'alert' ? 'assertive' : 'polite'}
            className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-800"
          >
            {importToast.message}
          </div>
        ) : (
          <div
            id="location-import-toast"
            role="status"
            aria-live="polite"
            className="hidden rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-800"
          />
        )}
      </section>
    </main>
  );
}

function renderLocationNode(location: TreeNode, labels: LocationTreeLabels): React.ReactNode {
  const content = (
    <div className="flex items-center gap-2">
      <span aria-hidden="true" className="w-14 text-center text-xs font-medium text-slate-500">
        {location.children.length > 0 ? '▸' : '•'}
      </span>
      <span className="font-medium">{location.name}</span>
      <Badge variant="outline" className="font-mono text-xs">{location.path}</Badge>
      <Badge variant={location.level === 1 ? 'info' : 'secondary'}>{formatLabel(labels.level, { level: location.level })}</Badge>
    </div>
  );

  if (location.children.length === 0) {
    return (
      <div
        key={location.id}
        role="treeitem"
        aria-level={location.level}
        data-location-id={location.id}
        data-parent-id={location.parentId ?? undefined}
        data-warehouse-id={location.warehouseId}
        className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
        style={{ marginLeft: `${Math.max(location.level - 1, 0) * 24}px` }}
      >
        {content}
      </div>
    );
  }

  return (
    <details
      key={location.id}
      role="treeitem"
      aria-level={location.level}
      data-location-id={location.id}
      data-parent-id={location.parentId ?? undefined}
      data-warehouse-id={location.warehouseId}
      className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
      style={{ marginLeft: `${Math.max(location.level - 1, 0) * 24}px` }}
    >
      <summary aria-label={formatLabel(labels.expand, { name: location.name })} className="cursor-pointer list-none">
        {content}
      </summary>
      <div role="group" className="mt-2 space-y-2">
        {location.children.map((child) => renderLocationNode(child, labels))}
      </div>
    </details>
  );
}

function renderState(state: NonNullable<LocationTreePageProps['state']>, labels: LocationTreeLabels) {
  if (state === 'loading') return <section role="status" aria-live="polite" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">{labels.loading}</section>;
  if (state === 'error') return <section role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 shadow-sm">{labels.error}</section>;
  if (state === 'permission_denied') return <section role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 shadow-sm">{labels.forbidden}</section>;
  if (state === 'empty') return <section role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-slate-600 shadow-sm">{labels.empty}</section>;
  return null;
}
