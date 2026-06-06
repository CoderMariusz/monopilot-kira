import { getTranslations } from 'next-intl/server';

import {
  createWarehouse as t029CreateWarehouse,
  deactivateWarehouse as t029DeactivateWarehouse,
  updateWarehouseStorageRules as t029UpdateWarehouseStorageRules,
} from '../../../../../../../actions/infra/warehouse';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import WarehouseListScreen, {
  type BinAssignmentStrategy,
  type CreateWarehouseInput,
  type CreateWarehouseResult,
  type DeactivateWarehouseInput,
  type DeactivateWarehouseResult,
  type UpdateStorageRulesInput,
  type UpdateStorageRulesResult,
  type Warehouse,
  type WarehouseLabels,
  type WarehousePageState,
  type WarehouseStorageRules,
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
  storage_bin_assignment_strategy: string | null;
  storage_mixed_lot_bins: boolean | null;
  storage_expiry_warning_days: number | string | null;
  storage_block_expired_stock: boolean | null;
};

type CapabilityRow = { ok: boolean | string | number | null };

const STORAGE_RULE_STRATEGIES: readonly BinAssignmentStrategy[] = ['FEFO', 'FIFO', 'LIFO', 'Manual'];

const DEFAULT_STORAGE_RULES: WarehouseStorageRules = {
  binAssignmentStrategy: 'FEFO',
  mixedLotBins: false,
  expiryWarningDays: 7,
  blockExpiredStock: true,
};

function toStrategy(value: string | null): BinAssignmentStrategy {
  return value && (STORAGE_RULE_STRATEGIES as readonly string[]).includes(value)
    ? (value as BinAssignmentStrategy)
    : DEFAULT_STORAGE_RULES.binAssignmentStrategy;
}

function toStorageRules(row: WarehouseRow): WarehouseStorageRules {
  if (
    row.storage_bin_assignment_strategy === null &&
    row.storage_mixed_lot_bins === null &&
    row.storage_expiry_warning_days === null &&
    row.storage_block_expired_stock === null
  ) {
    return { ...DEFAULT_STORAGE_RULES };
  }
  const days = Number(row.storage_expiry_warning_days ?? DEFAULT_STORAGE_RULES.expiryWarningDays);
  return {
    binAssignmentStrategy: toStrategy(row.storage_bin_assignment_strategy),
    mixedLotBins: row.storage_mixed_lot_bins === true,
    expiryWarningDays: Number.isFinite(days) && days >= 0 ? days : DEFAULT_STORAGE_RULES.expiryWarningDays,
    blockExpiredStock: row.storage_block_expired_stock !== false,
  };
}

type PageProps = {
  params?: Promise<{ locale: string }>;
  warehouses?: Warehouse[];
  canUpdateInfra?: boolean;
  createWarehouse?: (input: CreateWarehouseInput) => Promise<CreateWarehouseResult>;
  deactivateWarehouse?: (input: DeactivateWarehouseInput) => Promise<DeactivateWarehouseResult>;
  updateStorageRules?: (input: UpdateStorageRulesInput) => Promise<UpdateStorageRulesResult>;
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
  storageRulesWarehousePicker: 'Warehouse',
  storageRulesWarehousePickerHint: 'Select a warehouse to view and edit its storage rules.',
  storageRulesNoWarehouse: 'Add a warehouse to configure its storage rules.',
  storageRulesSelectedHint: 'Storage rules for {name}. These apply to this warehouse only.',
  saveStorageRules: 'Save storage rules',
  saveStorageRulesPending: 'Saving…',
  storageRulesSaved: 'Storage rules saved.',
  storageRulesSaveFailed: 'Storage rules could not be saved. Try again or contact an administrator.',
  editStorageRules: 'Edit storage rules for {name}',
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
    storageRules: toStorageRules(row),
  };
}

async function canReadStorageRules(client: QueryClient): Promise<boolean> {
  const { rows } = await client.query<CapabilityRow>(
    `select (to_regclass('public.warehouse_storage_settings') is not null) as ok`,
  );
  return rows[0]?.ok === true || rows[0]?.ok === 'true' || rows[0]?.ok === 1;
}

async function queryWarehouses(client: QueryClient): Promise<WarehouseRow[]> {
  const [includeActiveWoCount, includeStorageRules] = await Promise.all([
    canReadActiveWorkOrders(client),
    canReadStorageRules(client),
  ]);

  // Per-warehouse storage rules live in public.warehouse_storage_settings (migration 245),
  // joined 1:1 on (org_id, warehouse_id). When the table is not yet present the columns
  // resolve to null so the screen falls back to defaults.
  const storageColumns = includeStorageRules
    ? `wss.bin_assignment_strategy as storage_bin_assignment_strategy,
              wss.mixed_lot_bins as storage_mixed_lot_bins,
              wss.expiry_warning_days as storage_expiry_warning_days,
              wss.block_expired_stock as storage_block_expired_stock`
    : `null::text as storage_bin_assignment_strategy,
              null::boolean as storage_mixed_lot_bins,
              null::integer as storage_expiry_warning_days,
              null::boolean as storage_block_expired_stock`;
  const storageJoin = includeStorageRules
    ? `left join public.warehouse_storage_settings wss
           on wss.org_id = app.current_org_id()
          and wss.warehouse_id = w.id`
    : '';
  const storageGroupBy = includeStorageRules
    ? ', wss.bin_assignment_strategy, wss.mixed_lot_bins, wss.expiry_warning_days, wss.block_expired_stock'
    : '';

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
              coalesce(count(distinct wo.warehouse_id) filter (where wo.status::text = any($1::text[])), 0)::integer as active_wo_count,
              ${storageColumns}
         from public.warehouses w
         left join public.locations l
           on l.org_id = app.current_org_id()
          and l.warehouse_id = w.id
         left join public.work_orders wo
           on wo.org_id = app.current_org_id()
          and wo.warehouse_id = w.id
         ${storageJoin}
        where w.org_id = app.current_org_id()
        group by w.id, w.code, w.name, w.address${storageGroupBy}
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
              0::integer as active_wo_count,
              ${storageColumns}
         from public.warehouses w
         left join public.locations l
           on l.org_id = app.current_org_id()
          and l.warehouse_id = w.id
         ${storageJoin}
        where w.org_id = app.current_org_id()
        group by w.id, w.code, w.name, w.address${storageGroupBy}
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

async function runUpdateStorageRules(input: UpdateStorageRulesInput): Promise<UpdateStorageRulesResult> {
  'use server';
  return t029UpdateWarehouseStorageRules(input) as Promise<UpdateStorageRulesResult>;
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
      updateStorageRules={props.updateStorageRules ?? runUpdateStorageRules}
      state={props.state ?? runtime.state}
    />
  );
}
