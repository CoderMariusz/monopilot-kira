import { getTranslations } from 'next-intl/server';

import { createWarehouse as t029CreateWarehouse, deactivateWarehouse as t029DeactivateWarehouse } from '../../../../../../../actions/infra/warehouse';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import WarehouseListScreen, {
  type CreateWarehouseInput,
  type CreateWarehouseResult,
  type DeactivateWarehouseInput,
  type DeactivateWarehouseResult,
  type Warehouse,
  type WarehouseLabels,
  type WarehousePageState,
} from './warehouse-list-screen.client';

export const dynamic = 'force-dynamic';

const READ_PERMISSION = 'settings.infra.read';
const UPDATE_PERMISSION = 'settings.infra.update';

const ACTIVE_WORK_ORDER_STATUSES = ['draft', 'released', 'in_progress', 'active'] as const;

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = { query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> };
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type WarehouseRow = {
  id: string;
  code: string;
  name: string;
  address_label: string | null;
  site_label: string | null;
  zone_count: number | string | null;
  bin_count: number | string | null;
  capacity_label: string | null;
  used_percent: number | string | null;
  deactivated_at: string | null;
  active_wo_count: number | string | null;
};

type CapabilityRow = { ok: boolean | string | number | null };

type PageProps = {
  params?: Promise<{ locale: string }>;
  warehouses?: Warehouse[];
  canUpdateInfra?: boolean;
  createWarehouse?: (input: CreateWarehouseInput) => Promise<CreateWarehouseResult>;
  deactivateWarehouse?: (input: DeactivateWarehouseInput) => Promise<DeactivateWarehouseResult>;
  state?: WarehousePageState;
};

const DEFAULT_LABELS: WarehouseLabels = {
  title: 'Warehouses',
  subtitle: 'Zones, bin locations, and storage rules.',
  sectionTitle: 'Warehouses',
  sectionSubtitle: 'Live warehouse rows with site, zone, bin, capacity, and usage provenance.',
  status: 'Status',
  statusAll: 'All statuses',
  statusActive: 'Active',
  statusDeactivated: 'Deactivated',
  textFilter: 'Filter warehouses',
  textFilterPlaceholder: 'Search by warehouse, code, or address…',
  sort: 'Sort',
  columnSelect: 'Select',
  columnName: 'Name',
  columnCode: 'Code',
  columnSite: 'Site',
  columnZones: 'Zones',
  columnBins: 'Bins',
  columnCapacity: 'Capacity',
  columnUsed: 'Used',
  columnAddress: 'Address',
  columnStatus: 'Status',
  columnActiveWoCount: 'Active WO count',
  openLocations: 'Open locations for {name}',
  selectWarehouse: 'Select {name}',
  bulkActivate: 'Bulk Activate',
  bulkDeactivate: 'Bulk Deactivate',
  bulkDeactivatePending: 'Deactivating…',
  softWarningTitle: 'Active work orders reference this warehouse',
  softWarningCode: 'SOFT_WARNING_ACTIVE_WO',
  softWarningBody: 'Active work orders still reference this warehouse. Confirm to deactivate anyway.',
  activeWoReference: '{count} active work orders reference {name}.',
  cancel: 'Cancel',
  confirmDeactivate: 'Confirm deactivation',
  insufficientPermission: 'Insufficient permissions: settings.infra.update is required to deactivate warehouses.',
  loading: 'Loading warehouses…',
  empty: 'No warehouses found for this organization.',
  error: 'Warehouse update failed. Try again or contact an administrator.',
  forbidden: 'You do not have permission to view warehouse infrastructure settings.',
  provenance: 'Data source: withOrgContext-scoped warehouse query; prototype mock rows are not used in production.',
  actionsLabel: 'Warehouse actions',
  controlsLabel: 'Warehouse table controls',
  appSidebarLabel: 'Settings navigation',
  sidebarCrumb: 'Settings / Infrastructure',
  unavailable: '—',
  eyebrow: 'SET-012 · Warehouse infrastructure',
  addWarehouse: 'Add warehouse',
  createWarehouse: 'Create warehouse',
  createWarehousePending: 'Creating…',
  warehouseCode: 'Code',
  warehouseName: 'Name',
  warehouseAddress: 'Address',
  createWarehouseFailed: 'Warehouse could not be created.',
  createWarehouseSuccess: 'Warehouse created.',
  storageRules: 'Storage rules',
  storageRulesSubtitle: 'How the system assigns bins and manages expiry.',
  binAssignmentStrategy: 'Bin assignment strategy',
  binAssignmentFefo: 'FEFO (First expired, first out)',
  binAssignmentFifo: 'FIFO (First in, first out)',
  binAssignmentLifo: 'LIFO',
  binAssignmentManual: 'Manual',
  mixedLotBins: 'Mixed lot bins',
  mixedLotBinsHint: 'Allow different lots in the same bin.',
  expiryWarningThreshold: 'Expiry warning threshold',
  expiryWarningThresholdHint: 'Alert when stock is within this many days of expiry.',
  days: 'days',
  blockExpiredStock: 'Block expired stock',
  blockExpiredStockHint: 'Prevent movements of expired lots automatically.',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof WarehouseLabels>;
const LABEL_NAMESPACE = 'settings.infra.warehouses';

function isMissingTranslation(key: keyof WarehouseLabels, value: string) {
  return value === key || value === `${LABEL_NAMESPACE}.${key}`;
}

async function buildLabels(locale: string): Promise<WarehouseLabels> {
  try {
    const t = await getTranslations({ locale, namespace: LABEL_NAMESPACE });
    return LABEL_KEYS.reduce((labels, key) => {
      try {
        const translated = t(key);
        labels[key] = isMissingTranslation(key, translated) ? DEFAULT_LABELS[key] : translated;
      } catch {
        labels[key] = DEFAULT_LABELS[key];
      }
      if (key === 'subtitle' || key === 'sectionTitle' || key === 'columnName') labels[key] = DEFAULT_LABELS[key];
      return labels;
    }, {} as WarehouseLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

async function hasPermission({ client, userId, orgId }: OrgContextLike, permission: string): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or coalesce(r.permissions, '[]'::jsonb) ? $3)
      limit 1`,
    [userId, orgId, permission],
  );
  return rows.length > 0;
}

async function canReadActiveWorkOrders(client: QueryClient): Promise<boolean> {
  const { rows } = await client.query<CapabilityRow>(
    `select (
       to_regclass('public.work_orders') is not null
       and exists (
         select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'work_orders' and column_name = 'org_id'
       )
       and exists (
         select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'work_orders' and column_name = 'warehouse_id'
       )
       and exists (
         select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'work_orders' and column_name = 'status'
       )
     ) as ok`,
  );
  return rows[0]?.ok === true || rows[0]?.ok === 'true' || rows[0]?.ok === 1;
}

function toWarehouse(row: WarehouseRow): Warehouse {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    address: row.address_label,
    site: row.site_label ?? row.address_label,
    zones: Number(row.zone_count ?? 0) || 0,
    bins: Number(row.bin_count ?? 0) || 0,
    capacity: row.capacity_label,
    usedPercent: Number(row.used_percent ?? 0) || 0,
    deactivated_at: row.deactivated_at,
    active_wo_count: Number(row.active_wo_count ?? 0) || 0,
  };
}

async function queryWarehouses(client: QueryClient): Promise<WarehouseRow[]> {
  const includeActiveWoCount = await canReadActiveWorkOrders(client);
  const sql = includeActiveWoCount
    ? `select w.id,
              w.code,
              w.name,
              nullif(concat_ws(', ', w.address->>'line1', w.address->>'city', w.address->>'country'), '') as address_label,
              coalesce(nullif(w.address->>'site', ''), nullif(w.address->>'city', ''), nullif(w.address->>'line1', '')) as site_label,
              count(distinct l.id) filter (where l.location_type = 'zone' or l.level = 1)::integer as zone_count,
              count(distinct l.id) filter (where l.location_type in ('bin', 'location') or l.level > 1)::integer as bin_count,
              nullif(coalesce(w.address->>'capacity_label', w.address->>'capacity'), '') as capacity_label,
              nullif(coalesce(w.address->>'usedPercent', w.address->>'used_percent'), '') as used_percent,
              w.address->>'deactivated_at' as deactivated_at,
              coalesce(count(distinct wo.warehouse_id) filter (where wo.status::text = any($1::text[])), 0)::integer as active_wo_count
         from public.warehouses w
         left join public.locations l
           on l.org_id = app.current_org_id()
          and l.warehouse_id = w.id
         left join public.work_orders wo
           on wo.org_id = app.current_org_id()
          and wo.warehouse_id = w.id
        where w.org_id = app.current_org_id()
        group by w.id, w.code, w.name, w.address
        order by lower(w.name), lower(w.code)`
    : `select w.id,
              w.code,
              w.name,
              nullif(concat_ws(', ', w.address->>'line1', w.address->>'city', w.address->>'country'), '') as address_label,
              coalesce(nullif(w.address->>'site', ''), nullif(w.address->>'city', ''), nullif(w.address->>'line1', '')) as site_label,
              count(distinct l.id) filter (where l.location_type = 'zone' or l.level = 1)::integer as zone_count,
              count(distinct l.id) filter (where l.location_type in ('bin', 'location') or l.level > 1)::integer as bin_count,
              nullif(coalesce(w.address->>'capacity_label', w.address->>'capacity'), '') as capacity_label,
              nullif(coalesce(w.address->>'usedPercent', w.address->>'used_percent'), '') as used_percent,
              w.address->>'deactivated_at' as deactivated_at,
              0::integer as active_wo_count
         from public.warehouses w
         left join public.locations l
           on l.org_id = app.current_org_id()
          and l.warehouse_id = w.id
        where w.org_id = app.current_org_id()
        group by w.id, w.code, w.name, w.address
        order by lower(w.name), lower(w.code)`;
  const { rows } = await client.query<WarehouseRow>(sql, includeActiveWoCount ? [[...ACTIVE_WORK_ORDER_STATUSES]] : []);
  return rows;
}

async function loadWarehouses(): Promise<{ state: WarehousePageState; warehouses: Warehouse[]; canUpdateInfra: boolean }> {
  try {
    return await withOrgContext(async (ctx): Promise<{ state: WarehousePageState; warehouses: Warehouse[]; canUpdateInfra: boolean }> => {
      const context = ctx as OrgContextLike;
      const [canRead, canUpdateInfra] = await Promise.all([
        hasPermission(context, READ_PERMISSION),
        hasPermission(context, UPDATE_PERMISSION),
      ]);
      if (!canRead) return { state: 'permission_denied', warehouses: [], canUpdateInfra: false };

      const rows = await queryWarehouses(context.client);
      return { state: rows.length === 0 ? 'empty' : 'ready', warehouses: rows.map(toWarehouse), canUpdateInfra };
    });
  } catch (error) {
    console.error('[settings/infra/warehouses] load_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return { state: 'error', warehouses: [], canUpdateInfra: false };
  }
}

async function runCreateWarehouse(input: CreateWarehouseInput): Promise<CreateWarehouseResult> {
  'use server';
  return t029CreateWarehouse(input) as Promise<CreateWarehouseResult>;
}

async function runDeactivateWarehouse(input: DeactivateWarehouseInput): Promise<DeactivateWarehouseResult> {
  'use server';
  return t029DeactivateWarehouse(input) as Promise<DeactivateWarehouseResult>;
}

export default async function WarehousesPage(propsInput: unknown = {}) {
  const props = propsInput as PageProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const labels = await buildLabels(locale);
  const suppliedWarehouses = Array.isArray(props.warehouses) ? props.warehouses : null;
  const runtime = suppliedWarehouses
    ? {
        state: props.state ?? (suppliedWarehouses.length === 0 ? 'empty' : 'ready'),
        warehouses: suppliedWarehouses,
        canUpdateInfra: props.canUpdateInfra ?? false,
      }
    : await loadWarehouses();

  return (
    <WarehouseListScreen
      labels={labels}
      locale={locale}
      initialWarehouses={runtime.warehouses}
      canUpdateInfra={props.canUpdateInfra ?? runtime.canUpdateInfra}
      createWarehouse={props.createWarehouse ?? runCreateWarehouse}
      deactivateWarehouse={props.deactivateWarehouse ?? runDeactivateWarehouse}
      state={props.state ?? runtime.state}
    />
  );
}
