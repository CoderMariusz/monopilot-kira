import React from 'react';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import Input from '@monopilot/ui/Input';

import { upsertLocation as persistLocation } from '../../../../../../../actions/infra/location';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = { query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> };
type Warehouse = { id: string; code: string; name: string };
type LocationRow = { id: string; warehouseId: string; parentId: string | null; name: string; level: number; path: string; locationType?: string | null };
type CreateLocationInput = { csvRowNumber: number; warehouseId: string; parentPath: string | null; name: string; level: number; path: string };
type CreateLocationResult =
  | { ok: true; data?: unknown }
  | { ok: false; error?: { code?: string; rowNumber?: number; validation?: string; message?: string } };
type UpsertLocationInput = {
  id?: string;
  warehouseId: string;
  parentId: string | null;
  code: string;
  name: string;
  level: number;
  locationType: string;
  active?: boolean;
  barcode?: string | null;
};
type UpsertLocationResult =
  | { ok: true; data: { id: string; path: string; level: number } }
  | { ok: false; error: string };
type LocationTreePageProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<{ warehouseId?: string; importStatus?: string; importMessage?: string }> | { warehouseId?: string; importStatus?: string; importMessage?: string };
  warehouses?: Warehouse[];
  locations?: LocationRow[];
  selectedWarehouseId?: string;
  canImport?: boolean;
  canUpdateInfra?: boolean;
  createLocation?: (input: CreateLocationInput) => Promise<CreateLocationResult> | CreateLocationResult;
  upsertLocation?: (input: UpsertLocationInput) => Promise<UpsertLocationResult> | UpsertLocationResult;
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
  addLocation: string;
  editLocation: string;
  addChild: string;
  selectedLocation: string;
  selectedParent: string;
  selectedDepth: string;
  selectedType: string;
  selectedStatus: string;
  lpsHere: string;
  readOnly: string;
  dialogAddTitle: string;
  dialogEditTitle: string;
  fieldCode: string;
  fieldName: string;
  fieldParent: string;
  fieldType: string;
  fieldActive: string;
  fieldBarcode: string;
  depthExceeded: string;
  cancel: string;
  createLocation: string;
  saveChanges: string;
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
  title: 'Location tree',
  subtitle: 'Browse warehouse storage locations as a hierarchy.',
  workspace: 'Workspace',
  settingsNavigation: 'Settings navigation',
  sidebarLabel: 'Infrastructure',
  sectionTitle: 'Locations',
  warehouse: 'Warehouse',
  allWarehouses: 'All warehouses',
  importCsv: 'Import CSV',
  addLocation: '+ Add location',
  editLocation: 'Edit',
  addChild: '+ Child',
  selectedLocation: 'Selected location',
  selectedParent: 'Parent',
  selectedDepth: 'Depth level',
  selectedType: 'Type',
  selectedStatus: 'Status',
  lpsHere: 'LPs here',
  readOnly: 'Read-only — settings.infra.update required to edit',
  dialogAddTitle: 'Add location',
  dialogEditTitle: 'Edit location',
  fieldCode: 'Code',
  fieldName: 'Name',
  fieldParent: 'Parent location',
  fieldType: 'Type',
  fieldActive: 'Is active',
  fieldBarcode: 'Barcode (optional)',
  depthExceeded: 'Maximum location depth for this tenant is 3 levels (warehouse → zone → bin).',
  cancel: 'Cancel',
  createLocation: 'Create location',
  saveChanges: 'Save changes',
  csvFile: 'CSV file',
  insufficientPermissions: 'Insufficient permissions: settings.infra.update is required to import CSV.',
  loading: 'Loading location tree…',
  empty: 'No locations are available for the selected warehouse.',
  error: 'Unable to load location tree. Try again after the backend is available.',
  forbidden: 'You do not have permission to view location infrastructure settings.',
  provenance: 'Data source: withOrgContext-scoped location tree query; prototype mock rows are not used in production.',
  expand: 'Expand {name}',
  leaf: 'Leaf',
  level: 'Level {level}',
  importSuccess: 'CSV import completed.',
  importError: 'CSV import failed.',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof LocationTreeLabels>;
const LABEL_NAMESPACE = 'settings.infra.locations';
const UPDATE_PERMISSION = 'settings.infra.update';

function isMissingTranslation(key: keyof LocationTreeLabels, value: string) {
  return value === key || value === `${LABEL_NAMESPACE}.${key}`;
}

async function buildLabels(locale: string): Promise<LocationTreeLabels> {
  try {
    const t = await getTranslations({ locale, namespace: LABEL_NAMESPACE });
    return LABEL_KEYS.reduce((labels, key) => {
      try {
        const translated = t(key);
        labels[key] = isMissingTranslation(key, translated) ? DEFAULT_LABELS[key] : translated;
      } catch {
        labels[key] = DEFAULT_LABELS[key];
      }
      return labels;
    }, {} as LocationTreeLabels);
  } catch (error) {
    console.error('[settings/infra/locations] labels_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return { ...DEFAULT_LABELS };
  }
}

function formatLabel(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((label, [key, value]) => label.replace(`{${key}}`, String(value)), template);
}

function sortByPath(rows: LocationRow[]) {
  return [...rows].sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
}

async function hasPermission(client: QueryClient, userId: string, orgId: string, permission: string) {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or r.permissions ? $3 or r.code = any($4::text[]) or r.slug = any($4::text[]))
      limit 1`,
    [userId, orgId, permission, ['owner', 'admin', 'module_admin']],
  );
  return rows.length > 0;
}

function locationCodeFromPath(path: string) {
  return path.trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, '_').slice(0, 64) || 'LOCATION';
}

async function readLocationData(): Promise<{
  warehouses: Warehouse[];
  locations: LocationRow[];
  canImport: boolean;
  state: NonNullable<LocationTreePageProps['state']>;
}> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as QueryClient;
      const canImport = await hasPermission(queryClient, userId, orgId, UPDATE_PERMISSION);
      const [warehouseResult, locationResult] = await Promise.all([
        queryClient.query<Warehouse>(
          `select id, code, name
             from public.warehouses
            where org_id = app.current_org_id()
            order by code asc`,
        ),
        queryClient.query<LocationRow>(
          `select id,
                  warehouse_id as "warehouseId",
                  parent_id as "parentId",
                  name,
                  level,
                  path,
                  location_type as "locationType"
             from public.locations
            where org_id = app.current_org_id()
            order by path asc`,
        ),
      ]);
      return {
        warehouses: warehouseResult.rows,
        locations: sortByPath(locationResult.rows),
        canImport,
        state: locationResult.rows.length === 0 ? 'empty' : 'ready',
      };
    });
  } catch (error) {
    console.error('[settings/infra/locations] load_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return { warehouses: [], locations: [], canImport: false, state: 'error' };
  }
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
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as QueryClient;
      if (!(await hasPermission(queryClient, userId, orgId, UPDATE_PERMISSION))) {
        return { ok: false, error: { code: 'FORBIDDEN', rowNumber: input.csvRowNumber, validation: 'V-SET-60', message: 'Missing settings.infra.update permission' } };
      }

      const parentPath = input.parentPath?.trim() || null;
      let parent: { id: string; level: number } | null = null;
      if (parentPath) {
        const { rows } = await queryClient.query<{ id: string; level: number }>(
          `select id, level
             from public.locations
            where org_id = app.current_org_id()
              and warehouse_id = $1::uuid
              and path = $2
            limit 1`,
          [input.warehouseId, parentPath],
        );
        parent = rows[0] ?? null;
        if (!parent) {
          return { ok: false, error: { code: 'INVALID_PARENT', rowNumber: input.csvRowNumber, validation: 'V-SET-60', message: `Parent path not found: ${parentPath}` } };
        }
        if (input.level !== parent.level + 1) {
          return { ok: false, error: { code: 'INVALID_PARENT_LEVEL', rowNumber: input.csvRowNumber, validation: 'V-SET-60', message: 'Level must equal parent level + 1' } };
        }
      } else if (input.level !== 1) {
        return { ok: false, error: { code: 'INVALID_PARENT_LEVEL', rowNumber: input.csvRowNumber, validation: 'V-SET-60', message: 'Root locations must use level 1' } };
      }

      const code = locationCodeFromPath(input.path);
      await queryClient.query(
        `insert into public.locations (org_id, warehouse_id, parent_id, code, name, location_type, level, path)
         values (app.current_org_id(), $1::uuid, $2::uuid, $3, $4, 'storage', $5::integer, $6)
         on conflict (org_id, code) do update set
           warehouse_id = excluded.warehouse_id,
           parent_id = excluded.parent_id,
           name = excluded.name,
           level = excluded.level,
           path = excluded.path`,
        [input.warehouseId, parent?.id ?? null, code, input.name, input.level, input.path],
      );
      await queryClient.query(
        `insert into public.outbox_events (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
         values ($1::uuid, 'settings.location.imported', 'location', gen_random_uuid(), $2::jsonb, 'settings-infra-v1')`,
        [orgId, JSON.stringify({ warehouse_id: input.warehouseId, path: input.path, actor_user_id: userId })],
      );
      return { ok: true, data: { path: input.path } };
    });
  } catch (error) {
    console.error('[settings/infra/locations] import_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return { ok: false, error: { code: 'IMPORT_ERROR', rowNumber: input.csvRowNumber, validation: 'V-SET-60', message: 'Import failed' } };
  }
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
  const [labels, loadedData] = await Promise.all([buildLabels(locale), props.locations ? Promise.resolve(null) : readLocationData()]);
  const locations = sortByPath(props.locations ?? loadedData?.locations ?? []);
  const selectedWarehouseId = props.selectedWarehouseId ?? searchParams?.warehouseId ?? 'all';
  const state = props.state ?? loadedData?.state ?? (locations.length === 0 ? 'empty' : 'ready');
  const canImport = props.canImport ?? loadedData?.canImport ?? false;
  const canUpdateInfra = props.canUpdateInfra ?? canImport;
  const createLocation = props.createLocation ?? postLocationImport;
  const upsertLocation = props.upsertLocation ?? persistLocation;
  const importToast = searchParams?.importMessage
    ? { role: searchParams.importStatus === 'error' ? 'alert' as const : 'status' as const, message: searchParams.importMessage }
    : null;

  async function importCsvAction(formData: FormData): Promise<void> {
    'use server';
    if (!canImport) return;
    const file = formData.get('csvFile');
    if (!(file instanceof File)) return;
    const result = await importLocationCsvText(await readFileText(file), createLocation, labels);
    redirect(importResultHref(selectedWarehouseId, result.ok, result.message));
  }

  return (
    <LocationTreeScreen
      labels={labels}
      warehouses={props.warehouses ?? loadedData?.warehouses ?? []}
      locations={locations}
      selectedWarehouseId={selectedWarehouseId}
      canImport={canImport}
      canUpdateInfra={canUpdateInfra}
      state={state}
      importCsvAction={importCsvAction}
      importToast={importToast}
      upsertLocation={upsertLocation}
    />
  );
}

function LocationTreeScreen({
  labels,
  warehouses,
  locations,
  selectedWarehouseId,
  canImport,
  canUpdateInfra,
  state,
  importCsvAction,
  importToast,
  upsertLocation,
}: {
  labels: LocationTreeLabels;
  warehouses: Warehouse[];
  locations: LocationRow[];
  selectedWarehouseId: string;
  canImport: boolean;
  canUpdateInfra: boolean;
  state: NonNullable<LocationTreePageProps['state']>;
  importCsvAction: (formData: FormData) => Promise<void>;
  importToast: { role: 'status' | 'alert'; message: string } | null;
  upsertLocation: (input: UpsertLocationInput) => Promise<UpsertLocationResult> | UpsertLocationResult;
}) {
  const [rows, setRows] = React.useState<LocationRow[]>(() => [...locations]);
  const visibleRows = rows.filter((location) => selectedWarehouseId === 'all' || location.warehouseId === selectedWarehouseId);
  const tree = buildTree(visibleRows);
  const firstSelected = visibleRows[0] ?? null;
  const [selectedLocationId, setSelectedLocationId] = React.useState<string | null>(firstSelected?.id ?? null);
  const selectedLocation = visibleRows.find((location) => location.id === selectedLocationId) ?? firstSelected;
  const [dialogMode, setDialogMode] = React.useState<'add' | 'edit' | 'child' | null>(null);
  const [editingLocation, setEditingLocation] = React.useState<LocationRow | null>(null);
  const [form, setForm] = React.useState({ code: '', name: '', parentId: firstSelected?.id ?? '', locationType: 'storage', active: true, barcode: '' });
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setRows([...locations]);
  }, [locations]);

  React.useEffect(() => {
    if (selectedLocationId && visibleRows.some((location) => location.id === selectedLocationId)) return;
    setSelectedLocationId(firstSelected?.id ?? null);
  }, [firstSelected?.id, selectedLocationId, visibleRows]);

  const warehouseOptions = [
    { value: 'all', label: labels.allWarehouses },
    ...warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.name })),
  ];
  const parentLocation = visibleRows.find((location) => location.id === form.parentId) ?? null;
  const depthExceeded = parentLocation ? parentLocation.level >= 3 : false;
  const nextLevel = parentLocation ? parentLocation.level + 1 : 1;
  const valid = form.code.trim().length > 0 && form.name.trim().length > 0 && !depthExceeded;

  function openDialog(mode: 'add' | 'edit' | 'child', location?: LocationRow | null) {
    if (!canUpdateInfra) return;
    const target = location ?? selectedLocation;
    setDialogMode(mode);
    setEditingLocation(mode === 'edit' ? target ?? null : null);
    setForm({
      code: mode === 'edit' && target ? locationCode(target) : '',
      name: mode === 'edit' && target ? target.name : '',
      parentId: mode === 'child' && target ? target.id : target?.parentId ?? firstSelected?.id ?? '',
      locationType: mode === 'edit' && target ? target.locationType ?? 'storage' : 'storage',
      active: true,
      barcode: '',
    });
    setFormError(null);
  }

  async function submitDialog(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUpdateInfra || !valid) return;
    const warehouseId = editingLocation?.warehouseId ?? parentLocation?.warehouseId ?? selectedLocation?.warehouseId ?? warehouses[0]?.id;
    if (!warehouseId) return;
    const input: UpsertLocationInput = {
      id: editingLocation?.id,
      warehouseId,
      parentId: parentLocation?.id ?? null,
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      level: editingLocation && !parentLocation ? editingLocation.level : nextLevel,
      locationType: form.locationType,
      active: form.active,
      barcode: form.barcode.trim() || null,
    };
    const result = await upsertLocation(input);
    if (!result.ok) {
      setFormError(labels.error);
      return;
    }
    const saved: LocationRow = {
      id: result.data.id,
      warehouseId,
      parentId: input.parentId,
      name: input.name,
      level: result.data.level,
      path: result.data.path,
      locationType: input.locationType,
    };
    setRows((current) => sortByPath([saved, ...current.filter((row) => row.id !== saved.id)]));
    setSelectedLocationId(saved.id);
    setDialogMode(null);
    setEditingLocation(null);
  }

  return (
    <main data-testid="settings-location-tree-screen" data-screen="settings-location-tree" className="min-h-screen bg-slate-50 text-slate-950">
      <header data-region="page-head" className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">SET-014</div>
            <h1 className="text-2xl font-semibold">{labels.title}</h1>
            <p className="mt-1 text-sm text-slate-600">{labels.subtitle}</p>
          </div>
          {canUpdateInfra ? (
            <Button type="button" onClick={() => openDialog('add')} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
              {labels.addLocation}
            </Button>
          ) : (
            <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{labels.readOnly}</span>
          )}
        </div>
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
                      <a key={option.value} role="option" aria-selected={option.value === selectedWarehouseId} href={optionHref(option.value)} className="rounded px-2 py-1 text-slate-700 hover:bg-slate-100">
                        {option.label}
                      </a>
                    ))}
                  </div>
                </details>
              </div>

              <label className="grid gap-1 text-sm font-medium" htmlFor="location-csv-file">
                {labels.csvFile}
                <Input id="location-csv-file" name="csvFile" aria-label={labels.csvFile} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" type="file" accept=".csv,text/csv" disabled={!canImport} />
              </label>

              <Button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600" disabled={!canImport} aria-label={!canImport ? labels.insufficientPermissions : labels.importCsv}>
                {labels.importCsv}
              </Button>
            </div>
          </div>
        </form>

        {state === 'ready' ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.4fr)]">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div role="tree" aria-label={labels.title} className="space-y-2">
                {tree.map((location) => renderLocationNode(location, labels, setSelectedLocationId))}
              </div>
            </section>
            <section role="region" aria-label={labels.selectedLocation} className="space-y-3">
              {selectedLocation ? (
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-mono text-lg font-semibold">{locationCode(selectedLocation)} — {selectedLocation.name}</h2>
                      <p className="mt-1 font-mono text-xs text-slate-500">{selectedLocation.path.replace(/\./g, ' › ')}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{selectedLocation.locationType ?? 'storage'}</Badge>
                      <Badge variant="success">● Active</Badge>
                      {canUpdateInfra ? (
                        <>
                          <Button type="button" onClick={() => openDialog('edit', selectedLocation)}>{labels.editLocation}</Button>
                          <Button type="button" onClick={() => openDialog('child', selectedLocation)}>{labels.addChild}</Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-4">
                    <SummaryItem label={labels.lpsHere} value="0" />
                    <SummaryItem label={labels.selectedParent} value={selectedLocation.parentId ?? '—'} mono />
                    <SummaryItem label={labels.selectedDepth} value={`L${selectedLocation.level}`} />
                    <SummaryItem label={labels.selectedStatus} value="Active" />
                  </div>
                </div>
              ) : null}
              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <table role="table" aria-label="LPs at this location" className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr><th scope="col" className="px-4 py-3">LP</th><th scope="col" className="px-4 py-3">{labels.warehouse}</th><th scope="col" className="px-4 py-3">{labels.selectedStatus}</th></tr>
                  </thead>
                  <tbody><tr><td className="px-4 py-4 text-slate-500" colSpan={3}>0</td></tr></tbody>
                </table>
              </section>
            </section>
          </div>
        ) : renderState(state, labels)}

        {importToast ? (
          <div id="location-import-toast" role={importToast.role} aria-live={importToast.role === 'alert' ? 'assertive' : 'polite'} className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-800">
            {importToast.message}
          </div>
        ) : (
          <div id="location-import-toast" role="status" aria-live="polite" className="hidden rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-800" />
        )}
      </section>

      {dialogMode && canUpdateInfra ? (
        <div role="dialog" aria-modal="true" aria-labelledby="location-dialog-title" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4">
          <form onSubmit={submitDialog} className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h2 id="location-dialog-title" className="text-lg font-semibold">{dialogMode === 'edit' ? labels.dialogEditTitle : labels.dialogAddTitle}</h2>
            <div className="mt-4 grid gap-4">
              <label className="grid gap-1 text-sm font-medium" htmlFor="location-code">
                {labels.fieldCode}
                <Input id="location-code" value={form.code} maxLength={20} onChange={(event) => { const value = event.currentTarget.value.toUpperCase(); setForm((current) => ({ ...current, code: value })); }} className="font-mono" />
              </label>
              <label className="grid gap-1 text-sm font-medium" htmlFor="location-name">
                {labels.fieldName}
                <Input id="location-name" value={form.name} maxLength={80} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, name: value })); }} />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium" htmlFor="location-parent">
                  {labels.fieldParent}
                  <select id="location-parent" value={form.parentId} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, parentId: value })); }} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option value="">—</option>
                    {visibleRows.map((location) => <option key={location.id} value={location.id}>{location.path.replace(/\./g, ' › ')}</option>)}
                  </select>
                  {depthExceeded ? <span className="text-xs font-medium text-red-700">{labels.depthExceeded}</span> : null}
                </label>
                <label className="grid gap-1 text-sm font-medium" htmlFor="location-type">
                  {labels.fieldType}
                  <select id="location-type" value={form.locationType} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, locationType: value })); }} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option value="storage">storage</option><option value="transit">transit</option><option value="receiving">receiving</option><option value="production_line">production_line</option>
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium" htmlFor="location-active">
                <input id="location-active" type="checkbox" checked={form.active} onChange={(event) => { const checked = event.currentTarget.checked; setForm((current) => ({ ...current, active: checked })); }} />
                {labels.fieldActive}
              </label>
              {form.code || form.name ? (
                <label className="grid gap-1 text-sm font-medium" htmlFor="location-barcode">
                  {labels.fieldBarcode}
                  <Input id="location-barcode" value={form.barcode} onChange={(event) => { const value = event.currentTarget.value; setForm((current) => ({ ...current, barcode: value })); }} className="font-mono" />
                </label>
              ) : null}
              {formError ? <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{formError}</div> : null}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" onClick={() => setDialogMode(null)}>{labels.cancel}</Button>
              <Button type="submit" disabled={!valid}>{dialogMode === 'edit' ? labels.saveChanges : labels.createLocation}</Button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function SummaryItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><div className="text-xs text-slate-500">{label}</div><div className={mono ? 'font-mono text-sm font-semibold' : 'text-sm font-semibold'}>{value}</div></div>;
}

function locationCode(location: LocationRow) {
  return location.path.split('.').filter(Boolean).at(-1)?.toUpperCase() ?? location.name.toUpperCase();
}

function renderLocationNode(location: TreeNode, labels: LocationTreeLabels, onSelect?: (id: string) => void): React.ReactNode {
  const content = (
    <div className="flex items-center gap-2" onClick={() => onSelect?.(location.id)}>
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
        {location.children.map((child) => renderLocationNode(child, labels, onSelect))}
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
