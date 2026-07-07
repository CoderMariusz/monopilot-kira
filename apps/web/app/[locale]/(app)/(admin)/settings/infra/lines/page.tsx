import React from 'react';
import { getTranslations } from 'next-intl/server';

import { upsertLine as persistLine, type UpsertLineResult } from '../../../../../../../actions/infra/line';
import { hasPermission } from '../../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import LinesScreen, {
  type ActivateLineInput,
  type ActivateLineResult,
  type CreateLineInput,
  type DeactivateLineInput,
  type DeactivateLineResult,
  type LinesLabels,
  type LinesPageState,
  type LineStatus,
  type LocationOption,
  type ProductionLine,
  type SiteOption,
  type WarehouseOption,
} from './lines-screen.client';

export const dynamic = 'force-dynamic';

const READ_PERMISSION = 'settings.infra.read';
const UPDATE_PERMISSION = 'settings.infra.update';

const DEFAULT_LABELS: LinesLabels = {
  title: 'Production lines',
  subtitle: 'Manage production lines.',
  sectionTitle: 'Production lines',
  sectionSubtitle: 'Live production line rows.',
  columnSelect: 'Select',
  columnLine: 'Line',
  columnDefaultLocation: 'Default location',
  columnStatus: 'Status',
  columnActions: 'Actions',
  editLine: 'Edit',
  warehouseFilter: 'Warehouse',
  allWarehouses: 'All warehouses',
  statusFilter: 'Status',
  statusAll: 'All statuses',
  statusActive: 'Active',
  statusDraft: 'Draft',
  statusInactive: 'Inactive',
  bulkActivate: 'Bulk Activate',
  bulkActivatePending: 'Activating…',
  bulkDeactivate: 'Bulk Deactivate',
  bulkDeactivatePending: 'Deactivating…',
  addLine: 'Add line',
  dialogAddTitle: 'Add production line',
  dialogEditTitle: 'Edit production line',
  fieldCode: 'Code',
  fieldName: 'Name',
  fieldSite: 'Site',
  fieldStatus: 'Status',
  createLine: 'Create line',
  createLinePending: 'Creating…',
  updateLine: 'Save changes',
  updateLinePending: 'Saving…',
  cancel: 'Cancel',
  createLineSuccess: 'Production line created.',
  updateLineSuccess: 'Production line updated.',
  createLineFailed: 'Production line could not be created.',
  insufficientPermission: 'Insufficient permissions: settings.infra.update is required to activate production lines.',
  selectLine: 'Select {name}',
  loading: 'Loading production lines…',
  empty: 'No production lines are available for this workspace.',
  error: 'Unable to load production lines. Try again after the backend is available.',
  forbidden: 'You do not have permission to view production line infrastructure settings.',
  provenance: 'Data source: withOrgContext-scoped production_lines query; prototype mock rows are not used in production.',
  unavailable: '—',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof LinesLabels>;
const LABEL_NAMESPACE = 'settings.infra.lines';

function isMissingTranslation(key: keyof LinesLabels, value: string) {
  return value === key || value === `${LABEL_NAMESPACE}.${key}`;
}

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = { query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> };
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type LineRow = {
  line_id: string;
  line_code: string;
  line_name: string;
  line_status: LineStatus | string;
  site_id: string | null;
  default_location_id: string | null;
  location_path: string | null;
  location_name: string | null;
  warehouse_id: string | null;
  warehouse_name: string | null;
};

type SiteOptionRow = {
  id: string;
  site_code: string;
  name: string;
  is_default: boolean;
};

type WarehouseOptionRow = {
  id: string;
  name: string;
};

type LocationOptionRow = {
  id: string;
  code: string;
  name: string;
  warehouse_id: string | null;
  path: string | null;
};

type PermissionDeniedActivationResult = {
  ok: false;
  code: 'PERMISSION_DENIED';
  lineId: string;
  message: string;
};

type LinesPageProps = {
  params?: Promise<{ locale: string }>;
  lines?: ProductionLine[];
  sites?: SiteOption[];
  warehouses?: WarehouseOption[];
  locations?: LocationOption[];
  canUpdateInfra?: boolean;
  activateLine?: (input: ActivateLineInput) => Promise<ActivateLineResult> | ActivateLineResult;
  deactivateLine?: (input: DeactivateLineInput) => Promise<DeactivateLineResult> | DeactivateLineResult;
  createLine?: (input: CreateLineInput) => Promise<UpsertLineResult> | UpsertLineResult;
  state?: LinesPageState;
};

async function buildLabels(locale: string): Promise<LinesLabels> {
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
    }, {} as LinesLabels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

function normalizeStatus(value: string): LineStatus {
  if (value === 'active' || value === 'inactive' || value === 'draft') return value;
  return 'draft';
}

function toProductionLines(rows: LineRow[]): ProductionLine[] {
  return rows.map((row) => ({
    id: row.line_id,
    code: row.line_code,
    name: row.line_name,
    status: normalizeStatus(row.line_status),
    siteId: row.site_id,
    defaultLocationId: row.default_location_id,
    defaultLocationBreadcrumb: row.location_path ?? row.location_name,
    warehouseId: row.warehouse_id,
    warehouseName: row.warehouse_name,
  }));
}

async function loadLocationOptions(context: OrgContextLike): Promise<LocationOption[]> {
  try {
    const { rows } = await context.client.query<LocationOptionRow>(
      `select id::text, code, name, warehouse_id::text, path
         from public.locations
        where org_id = app.current_org_id()
        order by lower(code), lower(name), id`,
    );
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      warehouseId: row.warehouse_id,
      path: row.path,
    }));
  } catch (error) {
    console.error('[settings/infra/lines] locations_load_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return [];
  }
}

type LinesRuntime = {
  state: LinesPageState;
  lines: ProductionLine[];
  sites: SiteOption[];
  warehouses: WarehouseOption[];
  locations: LocationOption[];
  canUpdateInfra: boolean;
};

async function loadLines(): Promise<LinesRuntime> {
  try {
    return await withOrgContext(async (ctx): Promise<LinesRuntime> => {
      const context = ctx as OrgContextLike;
      const [canRead, canUpdateInfra] = await Promise.all([
        hasPermission(context, READ_PERMISSION),
        hasPermission(context, UPDATE_PERMISSION),
      ]);
      if (!canRead) return { state: 'permission_denied', lines: [], sites: [], warehouses: [], locations: [], canUpdateInfra: false };

      const [linesResult, sitesResult, warehousesResult] = await Promise.all([
        context.client.query<LineRow>(
          `select pl.id as line_id,
                  pl.code as line_code,
                  pl.name as line_name,
                  pl.status as line_status,
                  pl.site_id::text as site_id,
                  pl.default_location_id,
                  l.path as location_path,
                  l.name as location_name,
                  pl.warehouse_id as warehouse_id,
                  case
                    when pl.warehouse_id is not null then plw.name
                    else lw.name
                  end as warehouse_name
             from public.production_lines pl
             left join public.locations l
               on l.id = pl.default_location_id
              and l.org_id = app.current_org_id()
             left join public.warehouses plw
               on plw.id = pl.warehouse_id
              and plw.org_id = app.current_org_id()
             left join public.warehouses lw
               on lw.id = l.warehouse_id
              and lw.org_id = app.current_org_id()
            where pl.org_id = app.current_org_id()
            order by lower(pl.name), lower(pl.code)`,
        ),
        context.client.query<SiteOptionRow>(
          `select id::text, site_code, name, is_default
             from public.sites
            where org_id = app.current_org_id()
              and is_active = true
            order by is_default desc, lower(name), lower(site_code)`,
        ),
        context.client.query<WarehouseOptionRow>(
          `select id, name
             from public.warehouses
            where org_id = app.current_org_id()
            order by lower(name), id`,
        ),
      ]);
      const locations = await loadLocationOptions(context);
      const lines = toProductionLines(linesResult.rows);
      return {
        state: lines.length === 0 ? 'empty' : 'ready',
        lines,
        sites: sitesResult.rows.map((row) => ({ id: row.id, code: row.site_code, name: row.name, isDefault: row.is_default })),
        warehouses: warehousesResult.rows.map((row) => ({ id: row.id, name: row.name })),
        locations,
        canUpdateInfra,
      };
    });
  } catch (error) {
    console.error('[settings/infra/lines] load_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return { state: 'error', lines: [], sites: [], warehouses: [], locations: [], canUpdateInfra: false };
  }
}

/**
 * Activates a single production line (status → 'active'). The former V-SET-62
 * "at least one machine" precondition was deleted (Wave 1 consolidation) — a
 * line can now be activated with no further requirements. RBAC is re-verified
 * server-side on every call (`settings.infra.update`).
 */
export async function activateProductionLine(input: ActivateLineInput): Promise<ActivateLineResult | PermissionDeniedActivationResult> {
  'use server';

  try {
    return await withOrgContext(async (ctx): Promise<ActivateLineResult | PermissionDeniedActivationResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasPermission(context, UPDATE_PERMISSION))) {
        return {
          ok: false,
          code: 'PERMISSION_DENIED',
          lineId: input.lineId,
          message: DEFAULT_LABELS.insufficientPermission,
        };
      }

      const { rowCount } = await context.client.query(
        `update public.production_lines
            set status = 'active'
          where org_id = app.current_org_id()
            and id = $1::uuid`,
        [input.lineId],
      );
      if (!rowCount) {
        return {
          ok: false,
          code: 'ACTIVATION_FAILED',
          lineId: input.lineId,
          message: 'Unable to activate production line. Try again after the backend is available.',
        };
      }

      return { ok: true, data: { lineId: input.lineId, status: 'active' } };
    });
  } catch {
    console.error('[activateProductionLine] activation_failed', { lineId: input.lineId });
    return {
      ok: false,
      code: 'ACTIVATION_FAILED',
      lineId: input.lineId,
      message: 'Unable to activate production line. Try again after the backend is available.',
    };
  }
}

/**
 * Deactivates a single production line (status → 'inactive'). Mirrors
 * {@link activateProductionLine} (a line can always be deactivated). RBAC is
 * re-verified server-side on every call (`settings.infra.update`) and the bulk
 * handler in the client invokes it once per selected row, mirroring the
 * bulk-activate flow.
 */
export async function deactivateProductionLine(input: DeactivateLineInput): Promise<DeactivateLineResult> {
  'use server';

  try {
    return await withOrgContext(async (ctx): Promise<DeactivateLineResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasPermission(context, UPDATE_PERMISSION))) {
        return {
          ok: false,
          code: 'PERMISSION_DENIED',
          lineId: input.lineId,
          message: DEFAULT_LABELS.insufficientPermission,
        };
      }

      await context.client.query(
        `update public.production_lines
            set status = 'inactive'
          where org_id = app.current_org_id()
            and id = $1::uuid`,
        [input.lineId],
      );

      return { ok: true, data: { lineId: input.lineId, status: 'inactive' } };
    });
  } catch {
    console.error('[deactivateProductionLine] deactivation_failed', { lineId: input.lineId });
    return {
      ok: false,
      code: 'DEACTIVATION_FAILED',
      lineId: input.lineId,
      message: 'Unable to deactivate production line. Try again after the backend is available.',
    };
  }
}

export default async function LinesPage(propsInput: unknown = {}) {
  const props = propsInput as LinesPageProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const labels = await buildLabels(locale);
  const suppliedLines = Array.isArray(props.lines) ? props.lines : null;
  const runtime = suppliedLines
    ? {
        state: props.state ?? (suppliedLines.length === 0 ? 'empty' : 'ready'),
        lines: suppliedLines,
        sites: props.sites ?? [],
        warehouses: props.warehouses ?? [],
        locations: props.locations ?? [],
        canUpdateInfra: props.canUpdateInfra ?? false,
      }
    : await loadLines();

  // Must pass the `'use server'` action reference directly. Wrapping it in a
  // plain arrow closure makes it an ordinary function, which Next.js refuses to
  // serialize across the RSC boundary ("Functions cannot be passed directly to
  // Client Components") → uncaught 500 / error boundary.
  const activateLineForClient = (props.activateLine ?? activateProductionLine) as (
    input: ActivateLineInput,
  ) => Promise<ActivateLineResult>;
  const deactivateLineForClient = (props.deactivateLine ?? deactivateProductionLine) as (
    input: DeactivateLineInput,
  ) => Promise<DeactivateLineResult>;

  return React.createElement(LinesScreen, {
    labels,
    lines: runtime.lines,
    sites: runtime.sites,
    warehouses: runtime.warehouses,
    locations: runtime.locations,
    canUpdateInfra: runtime.canUpdateInfra,
    activateLine: activateLineForClient,
    deactivateLine: deactivateLineForClient,
    createLine: props.createLine ?? persistLine,
    state: runtime.state,
  });
}
