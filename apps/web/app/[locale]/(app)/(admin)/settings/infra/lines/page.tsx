import React from 'react';
import { getTranslations } from 'next-intl/server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import LinesScreen, {
  type ActivateLineInput,
  type ActivateLineResult,
  type LinesLabels,
  type LinesPageState,
  type LineStatus,
  type ProductionLine,
} from './lines-screen.client';

export const dynamic = 'force-dynamic';

const READ_PERMISSION = 'settings.infra.read';
const UPDATE_PERMISSION = 'settings.infra.update';

const DEFAULT_LABELS: LinesLabels = {
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

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof LinesLabels>;

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = { query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> };
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type LineRow = {
  line_id: string;
  line_code: string;
  line_name: string;
  line_status: LineStatus | string;
  default_location_id: string | null;
  location_path: string | null;
  location_name: string | null;
  warehouse_id: string | null;
  warehouse_name: string | null;
  machine_id: string | null;
  machine_code: string | null;
  machine_name: string | null;
  machine_seq: number | string | null;
};

type LineActivationRow = {
  id: string;
  code: string;
  name: string;
  machine_ids: string[] | null;
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
  canUpdateInfra?: boolean;
  activateLine?: (input: ActivateLineInput) => Promise<ActivateLineResult> | ActivateLineResult;
  state?: LinesPageState;
};

async function buildLabels(locale: string): Promise<LinesLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.infra.lines' });
    return LABEL_KEYS.reduce((labels, key) => {
      try {
        const translated = t(key);
        labels[key] = translated === key ? DEFAULT_LABELS[key] : translated;
      } catch {
        labels[key] = DEFAULT_LABELS[key];
      }
      return labels;
    }, {} as LinesLabels);
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

function normalizeStatus(value: string): LineStatus {
  if (value === 'active' || value === 'inactive' || value === 'draft') return value;
  return 'draft';
}

function toProductionLines(rows: LineRow[]): ProductionLine[] {
  const byId = new Map<string, ProductionLine>();

  for (const row of rows) {
    const existing = byId.get(row.line_id);
    const line = existing ?? {
      id: row.line_id,
      code: row.line_code,
      name: row.line_name,
      status: normalizeStatus(row.line_status),
      defaultLocationId: row.default_location_id,
      defaultLocationBreadcrumb: row.location_path ?? row.location_name,
      warehouseId: row.warehouse_id,
      warehouseName: row.warehouse_name,
      machines: [],
    } satisfies ProductionLine;

    if (row.machine_id && row.machine_code && row.machine_name) {
      line.machines.push({
        id: row.machine_id,
        code: row.machine_code,
        name: row.machine_name,
        seq: Number(row.machine_seq ?? 0) || 0,
      });
    }

    byId.set(row.line_id, line);
  }

  return Array.from(byId.values()).map((line) => ({
    ...line,
    machines: line.machines.sort((left, right) => left.seq - right.seq || left.code.localeCompare(right.code)),
  }));
}

async function loadLines(): Promise<{ state: LinesPageState; lines: ProductionLine[]; canUpdateInfra: boolean }> {
  try {
    return await withOrgContext(async (ctx): Promise<{ state: LinesPageState; lines: ProductionLine[]; canUpdateInfra: boolean }> => {
      const context = ctx as OrgContextLike;
      const [canRead, canUpdateInfra] = await Promise.all([
        hasPermission(context, READ_PERMISSION),
        hasPermission(context, UPDATE_PERMISSION),
      ]);
      if (!canRead) return { state: 'permission_denied', lines: [], canUpdateInfra: false };

      const { rows } = await context.client.query<LineRow>(
        `select pl.id as line_id,
                pl.code as line_code,
                pl.name as line_name,
                pl.status as line_status,
                pl.default_location_id,
                l.path as location_path,
                l.name as location_name,
                w.id as warehouse_id,
                w.name as warehouse_name,
                m.id as machine_id,
                m.code as machine_code,
                m.name as machine_name,
                lm.sequence as machine_seq
           from public.production_lines pl
           left join public.locations l
             on l.id = pl.default_location_id
            and l.org_id = app.current_org_id()
           left join public.warehouses w
             on w.id = l.warehouse_id
            and w.org_id = app.current_org_id()
           left join public.line_machines lm
             on lm.line_id = pl.id
           left join public.machines m
             on m.id = lm.machine_id
            and m.org_id = app.current_org_id()
          where pl.org_id = app.current_org_id()
          order by lower(pl.name), lower(pl.code), lm.sequence nulls last, lower(m.code)`,
      );
      const lines = toProductionLines(rows);
      return { state: lines.length === 0 ? 'empty' : 'ready', lines, canUpdateInfra };
    });
  } catch {
    return { state: 'error', lines: [], canUpdateInfra: false };
  }
}

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

      const { rows } = await context.client.query<LineActivationRow>(
        `select pl.id,
                pl.code,
                pl.name,
                coalesce(array_agg(lm.machine_id order by lm.sequence) filter (where lm.machine_id is not null), array[]::uuid[]) as machine_ids
           from public.production_lines pl
           left join public.line_machines lm on lm.line_id = pl.id
          where pl.org_id = app.current_org_id()
            and pl.id = $1::uuid
          group by pl.id, pl.code, pl.name
          limit 1`,
        [input.lineId],
      );
      const line = rows[0];
      if (!line || !line.machine_ids || line.machine_ids.length < 1) {
        return {
          ok: false,
          code: 'NO_MACHINE',
          validation: 'V-SET-62',
          lineId: input.lineId,
          message: DEFAULT_LABELS.noMachineBody,
        };
      }

      await context.client.query(
        `update public.production_lines
            set status = 'active'
          where org_id = app.current_org_id()
            and id = $1::uuid`,
        [input.lineId],
      );

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

export default async function LinesPage(propsInput: unknown = {}) {
  const props = propsInput as LinesPageProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const labels = await buildLabels(locale);
  const suppliedLines = Array.isArray(props.lines) ? props.lines : null;
  const runtime = suppliedLines
    ? {
        state: props.state ?? (suppliedLines.length === 0 ? 'empty' : 'ready'),
        lines: suppliedLines,
        canUpdateInfra: props.canUpdateInfra ?? false,
      }
    : await loadLines();

  const activateLineForClient: (input: ActivateLineInput) => Promise<ActivateLineResult> | ActivateLineResult =
    props.activateLine ?? ((input: ActivateLineInput) => activateProductionLine(input) as Promise<ActivateLineResult>);

  return React.createElement(LinesScreen, {
    labels,
    lines: runtime.lines,
    canUpdateInfra: runtime.canUpdateInfra,
    activateLine: activateLineForClient,
    state: runtime.state,
  });
}
