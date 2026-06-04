import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { LocationTreeScreen } from './location-tree-client';

import { deleteLocation as removeLocation, upsertLocation as persistLocation } from '../../../../../../../actions/infra/location';
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
type DeleteLocationInput = { locationId: string; warehouseId: string };
type DeleteLocationResult =
  | { ok: true; data: { locationId: string; warehouseId: string } }
  | { ok: false; error: string };
type LocationTreePageProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<{ warehouseId?: string; importStatus?: string; importMessage?: string; modal?: string; selectedLocationId?: string; parentId?: string; upsertStatus?: string; upsertMessage?: string }> | { warehouseId?: string; importStatus?: string; importMessage?: string; modal?: string; selectedLocationId?: string; parentId?: string; upsertStatus?: string; upsertMessage?: string };
  warehouses?: Warehouse[];
  locations?: LocationRow[];
  selectedWarehouseId?: string;
  canImport?: boolean;
  canUpdateInfra?: boolean;
  createLocation?: (input: CreateLocationInput) => Promise<CreateLocationResult> | CreateLocationResult;
  upsertLocation?: (input: UpsertLocationInput) => Promise<UpsertLocationResult> | UpsertLocationResult;
  deleteLocation?: (input: DeleteLocationInput) => Promise<DeleteLocationResult> | DeleteLocationResult;
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
  deleteLocation: string;
  selectedLocation: string;
  selectedParent: string;
  selectedDepth: string;
  selectedType: string;
  selectedStatus: string;
  lpsHere: string;
  readOnly: string;
  dialogAddTitle: string;
  dialogEditTitle: string;
  dialogDeleteTitle: string;
  dialogDeleteBody: string;
  fieldCode: string;
  fieldName: string;
  fieldParent: string;
  fieldType: string;
  fieldActive: string;
  fieldBarcode: string;
  depthExceeded: string;
  cancel: string;
  createLocation: string;
  confirmDelete: string;
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
  active: string;
  lpsTableTitle: string;
  openFullLpList: string;
  lpColumn: string;
  productColumn: string;
  qtyColumn: string;
  batchColumn: string;
  expiryColumn: string;
  statusColumn: string;
  qaColumn: string;
  noLpsAtLocation: string;
  utilization: string;
  binOccupancyTitle: string;
  binOccupancyLegend: string;
  noBinsTitle: string;
  noBinsAdmin: string;
  fieldCodeHelp: string;
  fieldBarcodeHelp: string;
  upsertSuccess: string;
  upsertError: string;
  deleteSuccess: string;
  deleteError: string;
  deleteHasChildren: string;
};

type TreeNode = LocationRow & { children: TreeNode[] };

const DEFAULT_LABELS: LocationTreeLabels = {
  title: 'Locations hierarchy',
  subtitle: 'Backed by ltree column · depth 3 max · Apex default: warehouse → zone → bin',
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
  deleteLocation: 'Delete',
  selectedLocation: 'Selected location',
  selectedParent: 'Parent',
  selectedDepth: 'Depth level',
  selectedType: 'Type',
  selectedStatus: 'Status',
  lpsHere: 'LPs here',
  readOnly: 'Read-only — settings.infra.update required to edit',
  dialogAddTitle: 'Add location',
  dialogEditTitle: 'Edit location',
  dialogDeleteTitle: 'Delete location',
  dialogDeleteBody: 'Delete {name}? This cannot be undone.',
  fieldCode: 'Code',
  fieldName: 'Name',
  fieldParent: 'Parent location',
  fieldType: 'Type',
  fieldActive: 'Is active',
  fieldBarcode: 'Barcode (optional)',
  depthExceeded: 'Maximum location depth for this tenant is 3 levels (warehouse → zone → bin).',
  cancel: 'Cancel',
  createLocation: 'Create location',
  confirmDelete: 'Delete location',
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
  active: 'Active',
  lpsTableTitle: 'LPs at this location',
  openFullLpList: 'Open full LP list →',
  lpColumn: 'LP',
  productColumn: 'Product',
  qtyColumn: 'Qty',
  batchColumn: 'Batch',
  expiryColumn: 'Expiry',
  statusColumn: 'Status',
  qaColumn: 'QA',
  noLpsAtLocation: 'No LPs at this location.',
  utilization: 'Utilization',
  binOccupancyTitle: 'Bin occupancy',
  binOccupancyLegend: 'Green < 40% · Amber 40–80% · Red > 80% full',
  noBinsTitle: 'No bins in this zone',
  noBinsAdmin: 'Add bins as children of this zone to start tracking occupancy.',
  fieldCodeHelp: 'Alphanumeric + hyphen, max 20 chars, unique within warehouse',
  fieldBarcodeHelp: 'Auto-generated if blank — for location QR / Code128 printing',
  upsertSuccess: 'Location saved.',
  upsertError: 'Location save failed.',
  deleteSuccess: 'Location deleted.',
  deleteError: 'Location delete failed.',
  deleteHasChildren: 'Delete child locations first.',
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
  const warehouses = props.warehouses ?? loadedData?.warehouses ?? [];
  const selectedWarehouseId = props.selectedWarehouseId ?? searchParams?.warehouseId ?? 'all';
  const state = props.state ?? loadedData?.state ?? (locations.length === 0 ? 'empty' : 'ready');
  const canImport = props.canImport ?? loadedData?.canImport ?? false;
  const canUpdateInfra = props.canUpdateInfra ?? canImport;
  const createLocation = props.createLocation ?? postLocationImport;
  const upsertLocation = props.upsertLocation ?? persistLocation;
  const deleteLocation = props.deleteLocation ?? removeLocation;
  const importToast = searchParams?.importMessage
    ? { role: searchParams.importStatus === 'error' ? 'alert' as const : 'status' as const, message: searchParams.importMessage }
    : null;
  const upsertToast = searchParams?.upsertMessage
    ? { role: searchParams.upsertStatus === 'error' ? 'alert' as const : 'status' as const, message: searchParams.upsertMessage }
    : null;
  const activeDialog = searchParams?.modal === 'add' || searchParams?.modal === 'edit' || searchParams?.modal === 'child' ? searchParams.modal : null;
  const requestedSelectedId = typeof searchParams?.selectedLocationId === 'string' ? searchParams.selectedLocationId : null;
  const requestedParentId = typeof searchParams?.parentId === 'string' ? searchParams.parentId : null;

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
      warehouses={warehouses}
      locations={locations}
      selectedWarehouseId={selectedWarehouseId}
      selectedLocationId={requestedSelectedId}
      parentLocationId={requestedParentId}
      canImport={canImport}
      canUpdateInfra={canUpdateInfra}
      state={state}
      activeDialog={activeDialog}
      importCsvAction={importCsvAction}
      importToast={importToast}
      upsertToast={upsertToast}
      upsertLocation={upsertLocation}
      deleteLocation={deleteLocation}
    />
  );
}
