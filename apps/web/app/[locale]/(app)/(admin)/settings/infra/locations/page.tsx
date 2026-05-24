import React from 'react';

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

const h = React.createElement;

const labels = {
  title: 'Location Tree',
  subtitle: 'Hierarchical warehouse zones and bins ordered by ltree path. Drag-drop reorder is deferred to Phase 2.',
  warehouse: 'Warehouse',
  allWarehouses: 'All warehouses',
  importCsv: 'Import CSV',
  csvFile: 'CSV file',
  insufficientPermissions: 'Insufficient permissions: settings.infra.update is required to import CSV.',
  loading: 'Loading location tree…',
  empty: 'No locations are available for the selected warehouse.',
  error: 'Unable to load the location tree. Try again after the backend is available.',
  forbidden: 'You do not have permission to view location infrastructure settings.',
  provenance: 'Data source: live loader props; empty fallback is used only when the runtime loader has no rows.',
};

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

function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read CSV file'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsText(file);
  });
}

async function handleCsvImport(createLocation?: LocationTreePageProps['createLocation']) {
  const toast = document.getElementById('location-import-toast');
  const input = document.getElementById('location-csv-file') as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!toast || !file || !createLocation) return;

  const rows = parseCsv(await readFileText(file));
  const errors: string[] = [];
  for (const row of rows) {
    const result = await createLocation(row);
    if (!result.ok) {
      const error = 'error' in result ? (result.error ?? {}) : {};
      errors.push(`Row ${error.rowNumber ?? row.csvRowNumber}: ${error.code ?? 'IMPORT_ERROR'} (${error.validation ?? 'V-SET-60'}) ${error.message ?? ''}`.trim());
    }
  }

  toast.setAttribute('role', errors.length > 0 ? 'alert' : 'status');
  toast.setAttribute('aria-live', errors.length > 0 ? 'assertive' : 'polite');
  toast.textContent = errors.length > 0 ? errors.join('; ') : `Imported ${rows.length} location rows.`;
}

function expandLocation(rowId: string) {
  document.querySelectorAll<HTMLElement>(`[data-parent-id="${rowId}"]`).forEach((node) => {
    node.hidden = false;
  });
  document.querySelector<HTMLElement>(`[data-location-id="${rowId}"]`)?.setAttribute('aria-expanded', 'true');
}

function applyWarehouseFilter(value: string) {
  document.querySelectorAll<HTMLElement>('[data-location-id]').forEach((node) => {
    const warehouseId = node.getAttribute('data-warehouse-id');
    node.hidden = value !== 'all' && warehouseId !== value;
  });
}

function StateNotice({ state }: { state: NonNullable<LocationTreePageProps['state']> }) {
  if (state === 'loading') return h('div', { role: 'status', 'aria-live': 'polite' }, labels.loading);
  if (state === 'empty') return h('div', { role: 'status' }, labels.empty);
  if (state === 'error') return h('div', { role: 'alert' }, labels.error);
  if (state === 'permission_denied') return h('div', { role: 'alert' }, labels.forbidden);
  return null;
}

function renderToolbar(warehouses: Warehouse[], selectedWarehouseId: string, canImport: boolean, createLocation: LocationTreePageProps['createLocation']) {
  return h(
    'div',
    { className: 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm' },
    h(
      'div',
      { className: 'flex flex-wrap items-end justify-between gap-3' },
      h(
        'label',
        { className: 'grid gap-1 text-sm font-medium', htmlFor: 'warehouse-filter' },
        labels.warehouse,
        h(
          'select',
          {
            id: 'warehouse-filter',
            'aria-label': labels.warehouse,
            className: 'min-w-64 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm',
            defaultValue: selectedWarehouseId,
            onChange: (event: React.ChangeEvent<HTMLSelectElement>) => applyWarehouseFilter(event.currentTarget.value),
          },
          h('option', { value: 'all' }, labels.allWarehouses),
          ...warehouses.map((warehouse) => h('option', { key: warehouse.id, value: warehouse.id }, warehouse.name)),
        ),
      ),
      h(
        'div',
        { className: 'flex flex-wrap items-end gap-2' },
        h(
          'label',
          { className: 'grid gap-1 text-sm font-medium', htmlFor: 'location-csv-file' },
          labels.csvFile,
          h('input', {
            id: 'location-csv-file',
            'aria-label': labels.csvFile,
            className: 'rounded-md border border-slate-300 bg-white px-3 py-2 text-sm',
            type: 'file',
            accept: '.csv,text/csv',
            disabled: !canImport,
          }),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600',
            disabled: !canImport,
            'aria-label': !canImport ? labels.insufficientPermissions : labels.importCsv,
            onClick: () => handleCsvImport(createLocation),
          },
          labels.importCsv,
        ),
      ),
    ),
    h('p', { className: 'mt-3 text-xs text-slate-500' }, labels.provenance),
  );
}

function renderTree(locations: LocationRow[], selectedWarehouseId: string) {
  return h(
    'section',
    { className: 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm' },
    h(
      'div',
      { role: 'tree', 'aria-label': labels.title, className: 'space-y-2' },
      ...locations.map((location) => {
        const expandable = hasChildren(location, locations);
        const initiallyHidden = location.parentId !== null;
        return h(
          'div',
          {
            key: location.id,
            role: 'treeitem',
            'aria-level': location.level,
            'aria-expanded': expandable ? false : undefined,
            'data-location-id': location.id,
            'data-parent-id': location.parentId ?? undefined,
            'data-warehouse-id': location.warehouseId,
            hidden: initiallyHidden || (selectedWarehouseId !== 'all' && location.warehouseId !== selectedWarehouseId),
            className: 'rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm',
            style: { marginLeft: `${Math.max(location.level - 1, 0) * 24}px` },
          },
          h(
            'div',
            { className: 'flex items-center gap-2' },
            expandable
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700',
                    'aria-label': `Expand ${location.name}`,
                    onClick: () => expandLocation(location.id),
                  },
                  'Expand',
                )
              : h('span', { 'aria-hidden': 'true', className: 'w-14 text-center text-xs text-slate-400' }, '•'),
            h('span', { className: 'font-medium' }, location.name),
            h('span', { className: 'font-mono text-xs text-slate-500' }, location.path),
          ),
        );
      }),
    ),
  );
}

export default function LocationTreePage(propsInput: unknown) {
  const props = (propsInput ?? {}) as LocationTreePageProps;
  const warehouses = props.warehouses ?? [];
  const locations = sortByPath(props.locations ?? []);
  const selectedWarehouseId = props.selectedWarehouseId ?? 'all';
  const state = props.state ?? (locations.length === 0 ? 'empty' : 'ready');
  const canImport = props.canImport ?? false;

  return h(
    'main',
    { 'data-testid': 'app-shell', className: 'min-h-screen bg-slate-50 text-slate-950' },
    h('aside', { 'data-testid': 'app-sidebar', 'aria-label': 'Settings navigation', className: 'border-b border-slate-200 bg-white px-6 py-3 text-sm text-slate-600' }, 'Settings / Infrastructure'),
    h(
      'header',
      { 'data-testid': 'app-topbar', className: 'border-b border-slate-200 bg-white px-6 py-4' },
      h('div', { className: 'text-xs font-semibold uppercase tracking-wide text-slate-500' }, 'SET-014'),
      h('h1', { className: 'text-2xl font-semibold' }, labels.title),
      h('p', { className: 'mt-1 text-sm text-slate-600' }, labels.subtitle),
    ),
    h(
      'section',
      { className: 'mx-auto max-w-6xl space-y-4 p-6', 'aria-label': 'Location Tree workspace' },
      renderToolbar(warehouses, selectedWarehouseId, canImport, props.createLocation),
      state === 'ready'
        ? renderTree(locations, selectedWarehouseId)
        : h('section', { className: 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm' }, h(StateNotice, { state })),
      h('div', { id: 'location-import-toast', className: 'rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-800' }),
    ),
  );
}
