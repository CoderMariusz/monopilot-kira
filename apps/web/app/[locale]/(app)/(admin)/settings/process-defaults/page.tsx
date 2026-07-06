/**
 * NPD v2 S5a — `/settings/process-defaults` per-process production DEFAULTS page.
 *
 * Server Component: reads org-scoped per-operation defaults via the
 * `listProcessDefaults` Server Action (owned by the NPD v2 S5a backend lane —
 * `./_actions/process-defaults-actions`; imported, never re-authored — it
 * enforces the settings read permission). Mutations are delegated to
 * `upsertProcessDefaults` (same backend, enforces the settings write
 * permission). The settings.org.update permission is also resolved here so the
 * affordances render honestly enabled/disabled (the action re-checks it
 * regardless).
 *
 * Owner decision D9: these per-operation defaults (standard cost + default
 * duration + roles[role_group, headcount]) pre-fill the NPD Production tab
 * later. Role RATES are NOT set here — they live in /settings/labor-rates; this
 * screen only picks a role_group + a default headcount.
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
  listLaborRateRoleGroups,
  listProcessDefaults,
  upsertProcessDefaults as persistProcessDefaults,
} from './_actions/process-defaults-actions';
import ProcessDefaultsScreen, {
  type ProcessDefaultRow,
  type ProcessDefaultsLabels,
  type PageState,
  type UpsertProcessDefaultsInput,
  type UpsertProcessDefaultsResult,
} from './process-defaults-screen.client';

export const dynamic = 'force-dynamic';

const MANAGE_PERMISSION = 'settings.org.update';

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
  roleGroupOptions?: string[];
};

type LoaderResult = {
  state: PageState;
  rows: ProcessDefaultRow[];
  canManage: boolean;
  roleGroupOptions: string[];
};

const LABEL_KEYS: Array<keyof ProcessDefaultsLabels> = [
  'eyebrow',
  'title',
  'subtitle',
  'sectionTitle',
  'provenance',
  'rolesNote',
  'columnOperation',
  'columnStandardCost',
  'columnDuration',
  'columnRoles',
  'columnActions',
  'edit',
  'noRoles',
  'durationUnit',
  'headcountUnit',
  'dialogEditTitle',
  'fieldStandardCost',
  'fieldStandardCostHelp',
  'fieldDuration',
  'fieldDurationHelp',
  'rolesTitle',
  'rolesEmpty',
  'fieldRoleGroup',
  'fieldHeadcount',
  'addRole',
  'removeRole',
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
  // (settings.org.update). Both reads are independent so a viewer who can read
  // but not write still sees the table.
  const [result, canManage, roleGroupsResult] = await Promise.all([
    listProcessDefaults(),
    resolveCanManage(),
    listLaborRateRoleGroups(),
  ]);
  // Role-group options failing to load must not take the whole page down — the
  // select just renders empty and the action still validates server-side.
  const roleGroupOptions = roleGroupsResult.ok ? roleGroupsResult.data : [];
  if (!result.ok) {
    if (result.error === 'forbidden') {
      return { state: 'permission_denied', rows: [], canManage: false, roleGroupOptions };
    }
    return { state: 'error', rows: [], canManage, roleGroupOptions };
  }
  const rows: ProcessDefaultRow[] = result.data.map((row) => ({
    operationId: row.operationId,
    operationName: row.operationName,
    standardCost: row.standardCost,
    defaultDurationHours: row.defaultDurationHours,
    roles: row.roles.map((role) => ({
      roleGroup: role.roleGroup,
      defaultHeadcount: role.defaultHeadcount,
    })),
  }));
  return { state: rows.length === 0 ? 'empty' : 'ready', rows, canManage, roleGroupOptions };
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
    defaultDurationHours: input.defaultDurationHours,
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
        roleGroupOptions: props.roleGroupOptions ?? [],
      }
    : await loadProcessDefaultsPageData();

  return (
    <ProcessDefaultsScreen
      initialRows={loaded.rows}
      labels={labels}
      canManage={props.canManage ?? loaded.canManage}
      state={props.state ?? loaded.state}
      upsertProcessDefaults={props.upsertProcessDefaults ?? upsertProcessDefaultsAdapter}
      roleGroupOptions={props.roleGroupOptions ?? loaded.roleGroupOptions}
    />
  );
}
