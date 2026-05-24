import React from 'react';
import { getTranslations } from 'next-intl/server';

import MachinesListScreen from './machines-list-screen.client';
import type {
  LocationRow,
  MachineActionInput,
  MachineActionResult,
  MachineRow,
  MachinesLabels,
  PageState,
} from './machines-list-screen.client';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

export const dynamic = 'force-dynamic';

type MachinesPageProps = {
  params?: Promise<{ locale: string }>;
  machines?: MachineRow[];
  locations?: LocationRow[];
  canUpdateInfra?: boolean;
  deactivateMachine?: (input: MachineActionInput) => Promise<MachineActionResult> | MachineActionResult;
  activateMachine?: (input: MachineActionInput) => Promise<MachineActionResult> | MachineActionResult;
  state?: PageState;
};

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type LoaderResult = {
  state: PageState;
  machines: MachineRow[];
  locations: LocationRow[];
  canUpdateInfra: boolean;
};

type MachineLoaderRow = {
  id: string;
  code: string;
  name: string;
  warehouse_id: string | null;
  location_id: string | null;
  location_path: string | null;
  specs: Record<string, unknown> | null;
  computed_status: string | null;
  deactivated_at: string | null;
};

type LocationLoaderRow = {
  id: string;
  warehouse_id: string;
  path: string;
  name: string;
};

const DEFAULT_MACHINE_LABELS: MachinesLabels = {
  title: 'Machines',
  subtitle: 'Manage equipment status, location, and infrastructure availability.',
  sectionTitle: 'Machine infrastructure',
  toolbarLabel: 'Machine table controls',
  status: 'Status',
  warehouse: 'Warehouse',
  statusAll: 'All statuses',
  warehouseAll: 'All warehouses',
  statusActive: 'Active',
  statusOffline: 'Offline',
  statusMaintenance: 'Maintenance',
  locationBreadcrumb: 'Location breadcrumb',
  columnSelect: 'Select',
  columnName: 'Machine',
  columnCode: 'Code',
  columnStatus: 'Status',
  columnLocation: 'Location',
  columnDeactivated: 'Deactivated',
  bulkActivate: 'Bulk Activate',
  bulkActivatePending: 'Activating…',
  bulkDeactivate: 'Bulk Deactivate',
  bulkDeactivatePending: 'Deactivating…',
  deactivated: 'Deactivated',
  selectMachine: 'Select {name}',
  insufficientPermission:
    'Insufficient permissions: settings.infra.update is required to activate or deactivate machines.',
  loading: 'Loading machines…',
  empty: 'No machines are available for this organization.',
  error: 'Unable to load machines. Try again after the backend is available.',
  forbidden: 'You do not have permission to view machine infrastructure settings.',
  actionError: 'Machine status update failed. Try again or contact an administrator.',
  provenance: 'Data source: withOrgContext machine/location loader; status is read from machines.specs.status and breadcrumbs from locations.path.',
};

const LABEL_KEYS = Object.keys(DEFAULT_MACHINE_LABELS) as Array<keyof MachinesLabels>;
const READ_PERMISSION = 'settings.infra.read';
const UPDATE_PERMISSION = 'settings.infra.update';

function translateMachineLabel(t: (key: string) => string, key: keyof MachinesLabels) {
  try {
    const translated = t(key);
    return translated === key ? DEFAULT_MACHINE_LABELS[key] : translated;
  } catch {
    return DEFAULT_MACHINE_LABELS[key];
  }
}

async function buildLabels(locale: string): Promise<MachinesLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.infra.machines' });
    return LABEL_KEYS.reduce((labels, key) => {
      labels[key] = translateMachineLabel(t, key);
      return labels;
    }, {} as MachinesLabels);
  } catch {
    return { ...DEFAULT_MACHINE_LABELS };
  }
}

async function hasPermission(ctx: OrgContextLike, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or coalesce(r.permissions, '[]'::jsonb) ? $3)
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}

function toMachineRow(row: MachineLoaderRow): MachineRow {
  const specs = row.specs ?? {};
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    warehouseId: row.warehouse_id ?? '',
    locationId: row.location_id ?? '',
    locationPath: row.location_path ?? '',
    specs: { ...specs, status: String(specs.status ?? row.computed_status ?? 'offline') },
    deactivated_at: row.deactivated_at,
  };
}

function toLocationRow(row: LocationLoaderRow): LocationRow {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    path: row.path,
    name: row.name,
  };
}

async function readMachinesPageData(): Promise<LoaderResult> {
  try {
    return await withOrgContext(async (rawCtx): Promise<LoaderResult> => {
      const ctx = rawCtx as OrgContextLike;
      const [canRead, canUpdateInfra] = await Promise.all([
        hasPermission(ctx, READ_PERMISSION),
        hasPermission(ctx, UPDATE_PERMISSION),
      ]);

      if (!canRead) {
        return { state: 'permission_denied', machines: [], locations: [], canUpdateInfra };
      }

      const [machinesResult, locationsResult] = await Promise.all([
        ctx.client.query<MachineLoaderRow>(
          `select m.id,
                  m.code,
                  m.name,
                  l.warehouse_id,
                  m.location_id,
                  l.path as location_path,
                  m.specs,
                  coalesce(m.specs->>'status', m.status, 'offline') as computed_status,
                  m.specs->>'deactivated_at' as deactivated_at
             from public.machines m
             left join public.locations l on l.id = m.location_id and l.org_id = app.current_org_id()
            where m.org_id = app.current_org_id()
            order by m.name asc`,
        ),
        ctx.client.query<LocationLoaderRow>(
          `select id, warehouse_id, path, name
             from public.locations
            where org_id = app.current_org_id()
            order by level asc, path asc`,
        ),
      ]);

      const machines = machinesResult.rows.map(toMachineRow);
      return {
        state: machines.length === 0 ? 'empty' : 'ready',
        machines,
        locations: locationsResult.rows.map(toLocationRow),
        canUpdateInfra,
      };
    });
  } catch {
    return { state: 'error', machines: [], locations: [], canUpdateInfra: false };
  }
}

async function defaultActivateMachine(input: MachineActionInput): Promise<MachineActionResult> {
  'use server';

  try {
    return await withOrgContext(async (rawCtx): Promise<MachineActionResult> => {
      const ctx = rawCtx as OrgContextLike;
      if (!(await hasPermission(ctx, UPDATE_PERMISSION))) return { ok: false };
      const { rows } = await ctx.client.query<{ id: string }>(
        `update public.machines
            set specs = jsonb_set(coalesce(specs, '{}'::jsonb) - 'deactivated_at', '{status}', '"active"'::jsonb, true)
          where org_id = app.current_org_id()
            and id = $1::uuid
          returning id`,
        [input.machineId],
      );
      return rows[0] ? { ok: true, data: { machineId: rows[0].id, deactivated_at: null } } : { ok: false };
    });
  } catch {
    return { ok: false };
  }
}

async function defaultDeactivateMachine(input: MachineActionInput): Promise<MachineActionResult> {
  'use server';

  try {
    return await withOrgContext(async (rawCtx): Promise<MachineActionResult> => {
      const ctx = rawCtx as OrgContextLike;
      if (!(await hasPermission(ctx, UPDATE_PERMISSION))) return { ok: false };
      const { rows } = await ctx.client.query<{ id: string; deactivated_at: string }>(
        `update public.machines
            set specs = jsonb_set(
              jsonb_set(coalesce(specs, '{}'::jsonb), '{status}', '"offline"'::jsonb, true),
              '{deactivated_at}', to_jsonb(now()::text), true
            )
          where org_id = app.current_org_id()
            and id = $1::uuid
          returning id, specs->>'deactivated_at' as deactivated_at`,
        [input.machineId],
      );
      return rows[0]
        ? { ok: true, data: { machineId: rows[0].id, deactivated_at: rows[0].deactivated_at } }
        : { ok: false };
    });
  } catch {
    return { ok: false };
  }
}

export default async function MachinesPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as MachinesPageProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const labels = await buildLabels(locale);

  const hasInjectedRows = Array.isArray(props.machines) || Array.isArray(props.locations);
  const loaded = hasInjectedRows
    ? {
        state: props.state ?? ((props.machines?.length ?? 0) === 0 ? 'empty' : 'ready'),
        machines: props.machines ?? [],
        locations: props.locations ?? [],
        canUpdateInfra: props.canUpdateInfra ?? false,
      }
    : await readMachinesPageData();

  return (
    <MachinesListScreen
      initialMachines={loaded.machines}
      locations={loaded.locations}
      labels={labels}
      canUpdateInfra={props.canUpdateInfra ?? loaded.canUpdateInfra}
      state={props.state ?? loaded.state}
      activateMachine={props.activateMachine ?? defaultActivateMachine}
      deactivateMachine={props.deactivateMachine ?? defaultDeactivateMachine}
    />
  );
}
