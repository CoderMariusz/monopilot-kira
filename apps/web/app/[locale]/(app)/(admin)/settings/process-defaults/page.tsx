/**
 * W2-T1 — `/settings/process-defaults`: the unified Settings "Processes" page.
 *
 * Server Component: reads org-scoped per-operation process definitions via the
 * `listProcessDefaults` Server Action (`./_actions/process-defaults-actions`;
 * imported, never re-authored — it enforces the settings read permission) plus
 * the labor-rate role groups WITH effective rates (`listLaborRateRoleGroupRates`)
 * that drive the dropdown AND the live Σ(headcount × rate) crew-cost display.
 * Mutations are delegated to `upsertProcessDefaults` (enforces the settings
 * write permission; recomputes derived cost server-side unless overridden and
 * auto-numbers the prefix per ManufacturingOperations.process_suffix). The
 * npd.schema.edit permission is resolved here so the affordances render
 * honestly enabled/disabled (the action re-checks it regardless).
 *
 * NOTE (W2-T2): this route renames to `/settings/processes` once the legacy
 * reference-A screen there is retired; the settings nav already points its
 * single "Processes" entry here.
 *
 * i18n resolved server-side from next-intl (settings.processDefaults.*, real
 * en+pl, ro/uk mirror EN). No inline JSX strings; no raw UUIDs.
 *
 * UI states: loading (state prop) / empty / error / data + permission-denied.
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import React from 'react';
import { getTranslations } from 'next-intl/server';

import { hasPermission } from '../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  listLaborRateRoleGroupRates,
  listProcessDefaults,
  upsertProcessDefaults as persistProcessDefaults,
} from './_actions/process-defaults-actions';
import ProcessDefaultsScreen, {
  type ProcessDefaultRow,
  type ProcessDefaultsLabels,
  type PageState,
  type RoleGroupRate,
  type UpsertProcessDefaultsInput,
  type UpsertProcessDefaultsResult,
} from './process-defaults-screen.client';

export const dynamic = 'force-dynamic';

const MANAGE_PERMISSION = 'npd.schema.edit';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type ProcessDefaultsPageProps = {
  params?: Promise<{ locale: string }>;
  rows?: ProcessDefaultRow[];
  canManage?: boolean;
  state?: PageState;
  upsertProcessDefaults?: (input: UpsertProcessDefaultsInput) => Promise<UpsertProcessDefaultsResult>;
  roleGroupRates?: RoleGroupRate[];
};

type LoaderResult = {
  state: PageState;
  rows: ProcessDefaultRow[];
  canManage: boolean;
  roleGroupRates: RoleGroupRate[];
};

const LABEL_KEYS: Array<keyof ProcessDefaultsLabels> = [
  'eyebrow',
  'title',
  'subtitle',
  'sectionTitle',
  'provenance',
  'rolesNote',
  'columnPrefix',
  'columnOperation',
  'columnStandardCost',
  'columnSetupCost',
  'columnThroughput',
  'columnYield',
  'columnDuration',
  'columnRoles',
  'columnActions',
  'edit',
  'noRoles',
  'durationUnit',
  'headcountUnit',
  'overriddenBadge',
  'dialogEditTitle',
  'fieldPrefix',
  'fieldPrefixHelp',
  'fieldStandardCost',
  'fieldStandardCostHelp',
  'overrideCost',
  'computedCost',
  'fieldDuration',
  'fieldDurationHelp',
  'fieldSetupCost',
  'fieldSetupCostHelp',
  'fieldThroughput',
  'fieldThroughputUom',
  'fieldThroughputHelp',
  'fieldYield',
  'fieldYieldHelp',
  'rolesTitle',
  'rolesEmpty',
  'fieldRoleGroup',
  'fieldHeadcount',
  'addRole',
  'removeRole',
  'productRatesTitle',
  'productRatesNote',
  'productRatesEmpty',
  'productRatesProduct',
  'save',
  'savePending',
  'cancel',
  'saveSuccess',
  'saveFailed',
  'invalidInput',
  'insufficientPermission',
  'loading',
  'empty',
  'error',
  'forbidden',
];

async function buildLabels(): Promise<ProcessDefaultsLabels> {
  const t = await getTranslations('settings.processDefaults');
  return LABEL_KEYS.reduce((labels, key) => {
    labels[key] = t(key);
    return labels;
  }, {} as ProcessDefaultsLabels);
}

async function resolveCanManage(): Promise<boolean> {
  try {
    return await withOrgContext(async (rawCtx) => hasPermission(rawCtx as OrgContextLike, MANAGE_PERMISSION));
  } catch {
    return false;
  }
}

async function loadProcessDefaultsPageData(): Promise<LoaderResult> {
  // listProcessDefaults enforces the settings read permission (forbidden ⇒
  // permission-denied); canManage gates the per-operation Edit affordance
  // (npd.schema.edit). Both reads are independent so a viewer who can read
  // but not write still sees the table.
  const [result, canManage, roleGroupRatesResult] = await Promise.all([
    listProcessDefaults(),
    resolveCanManage(),
    listLaborRateRoleGroupRates(),
  ]);
  // Role-group rates failing to load must not take the whole page down — the
  // select just renders empty (computed cost shows 0) and the action still
  // validates + recomputes server-side.
  const roleGroupRates = roleGroupRatesResult.ok ? roleGroupRatesResult.data : [];
  if (!result.ok) {
    if (result.error === 'forbidden') {
      return { state: 'permission_denied', rows: [], canManage: false, roleGroupRates };
    }
    return { state: 'error', rows: [], canManage, roleGroupRates };
  }
  const rows: ProcessDefaultRow[] = result.data;
  return { state: rows.length === 0 ? 'empty' : 'ready', rows, canManage, roleGroupRates };
}

/**
 * Server Action adapter: narrows the screen's edit input to the backend
 * `upsertProcessDefaults` shape. The action re-validates RBAC + the inputs, so
 * this is a thin import-only seam.
 */
async function upsertProcessDefaultsAdapter(
  input: UpsertProcessDefaultsInput,
): Promise<UpsertProcessDefaultsResult> {
  'use server';
  return persistProcessDefaults({
    operationId: input.operationId,
    standardCost: input.standardCost,
    costOverridden: input.costOverridden,
    defaultDurationHours: input.defaultDurationHours,
    setupCost: input.setupCost,
    throughputPerHour: input.throughputPerHour,
    throughputUom: input.throughputUom,
    yieldPct: input.yieldPct,
    prefix: input.prefix,
    roles: input.roles.map((role) => ({
      roleGroup: role.roleGroup,
      defaultHeadcount: role.defaultHeadcount,
    })),
  });
}

export default async function ProcessDefaultsPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as ProcessDefaultsPageProps;
  const labels = await buildLabels();

  const hasInjected = Array.isArray(props.rows) || props.state != null;
  const loaded: LoaderResult = hasInjected
    ? {
        state: props.state ?? ((props.rows?.length ?? 0) === 0 ? 'empty' : 'ready'),
        rows: props.rows ?? [],
        canManage: props.canManage ?? false,
        roleGroupRates: props.roleGroupRates ?? [],
      }
    : await loadProcessDefaultsPageData();

  return (
    <ProcessDefaultsScreen
      initialRows={loaded.rows}
      labels={labels}
      canManage={props.canManage ?? loaded.canManage}
      state={props.state ?? loaded.state}
      upsertProcessDefaults={props.upsertProcessDefaults ?? upsertProcessDefaultsAdapter}
      roleGroupRates={props.roleGroupRates ?? loaded.roleGroupRates}
    />
  );
}
