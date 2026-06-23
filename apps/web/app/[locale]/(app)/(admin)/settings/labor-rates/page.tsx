/**
 * E4B — `/settings/labor-rates` Labor rates settings page.
 *
 * Server Component: reads org-scoped labor rates via the `listLaborRates` Server
 * Action (owned by the E4B labor backend lane — production/_actions/labor-actions.ts
 * — imported, never re-authored; it enforces settings.org.read). Mutations are
 * delegated to `upsertLaborRate` (same backend, enforces settings.org.update). The
 * settings.org.update permission is also resolved here so the affordances render
 * honestly enabled/disabled (the action re-checks it regardless).
 *
 * HISTORY MODEL: a new effective date adds a NEW rate row — historical rates are
 * preserved and never edited in place. The screen therefore offers create-only.
 *
 * i18n resolved server-side from production next-intl (settings.laborRates.*, real
 * en+pl, ro/uk mirror EN). No inline JSX strings; no raw UUIDs.
 *
 * UI states: loading (Suspense skeleton) / empty-with-CTA / error / data +
 * permission-denied.
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import React from 'react';
import { getTranslations } from 'next-intl/server';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  listLaborRates,
  upsertLaborRate as persistLaborRate,
  type UpsertLaborRateInput as ActionUpsertInput,
} from '../../../(modules)/production/_actions/labor-actions';
import LaborRatesScreen, {
  type LaborRateRow,
  type LaborRatesLabels,
  type PageState,
  type UpsertLaborRateInput,
  type UpsertLaborRateResult,
} from './labor-rates-screen.client';

export const dynamic = 'force-dynamic';

const MANAGE_PERMISSION = 'settings.org.update';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type LaborRatesPageProps = {
  params?: Promise<{ locale: string }>;
  rates?: LaborRateRow[];
  canManage?: boolean;
  state?: PageState;
  upsertLaborRate?: (input: UpsertLaborRateInput) => Promise<UpsertLaborRateResult>;
};

type LoaderResult = {
  state: PageState;
  rates: LaborRateRow[];
  canManage: boolean;
};

const LABEL_KEYS: Array<keyof LaborRatesLabels> = [
  'eyebrow',
  'title',
  'subtitle',
  'sectionTitle',
  'provenance',
  'addRate',
  'emptyCta',
  'columnRole',
  'columnRate',
  'columnCurrency',
  'columnEffectiveFrom',
  'columnStatus',
  'statusCurrent',
  'statusFuture',
  'statusSuperseded',
  'historyNote',
  'dialogAddTitle',
  'fieldRole',
  'fieldRoleHelp',
  'fieldRate',
  'fieldRateHelp',
  'fieldCurrency',
  'fieldEffectiveFrom',
  'fieldEffectiveFromHelp',
  'save',
  'savePending',
  'cancel',
  'createSuccess',
  'saveFailed',
  'invalidInput',
  'insufficientPermission',
  'loading',
  'empty',
  'error',
  'forbidden',
];

async function buildLabels(): Promise<LaborRatesLabels> {
  const t = await getTranslations('settings.laborRates');
  return LABEL_KEYS.reduce((labels, key) => {
    labels[key] = t(key);
    return labels;
  }, {} as LaborRatesLabels);
}

async function hasPermission(ctx: OrgContextLike, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or r.code = $3
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}

async function resolveCanManage(): Promise<boolean> {
  try {
    return await withOrgContext(async (rawCtx) => hasPermission(rawCtx as OrgContextLike, MANAGE_PERMISSION));
  } catch {
    return false;
  }
}

async function loadLaborRatesPageData(): Promise<LoaderResult> {
  // listLaborRates enforces settings.org.read (forbidden ⇒ permission-denied);
  // canManage gates the create affordance (settings.org.update). Both reads are
  // independent so a viewer who can read but not write still sees the list.
  const [result, canManage] = await Promise.all([listLaborRates(), resolveCanManage()]);
  if (!result.ok) {
    if (result.error === 'forbidden') {
      return { state: 'permission_denied', rates: [], canManage: false };
    }
    return { state: 'error', rates: [], canManage };
  }
  const rates: LaborRateRow[] = result.rates.map((rate) => ({
    id: rate.id,
    roleGroup: rate.roleGroup,
    ratePerHour: rate.ratePerHour,
    currency: rate.currency,
    effectiveFrom: rate.effectiveFrom,
  }));
  return { state: rates.length === 0 ? 'empty' : 'ready', rates, canManage };
}

/**
 * Server Action adapter: narrows the screen's create input to the backend
 * `upsertLaborRate` shape. The action re-validates RBAC + the inputs, so this is a
 * thin import-only seam (no id ⇒ always create a new effective-dated row).
 */
async function upsertLaborRateAdapter(input: UpsertLaborRateInput): Promise<UpsertLaborRateResult> {
  'use server';
  const payload: ActionUpsertInput = {
    roleGroup: input.roleGroup,
    ratePerHour: input.ratePerHour,
    currency: input.currency ?? null,
    effectiveFrom: input.effectiveFrom ?? null,
  };
  return persistLaborRate(payload);
}

export default async function LaborRatesPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as LaborRatesPageProps;
  const labels = await buildLabels();

  const hasInjected = Array.isArray(props.rates) || props.state != null;
  const loaded: LoaderResult = hasInjected
    ? {
        state: props.state ?? ((props.rates?.length ?? 0) === 0 ? 'empty' : 'ready'),
        rates: props.rates ?? [],
        canManage: props.canManage ?? false,
      }
    : await loadLaborRatesPageData();

  return (
    <LaborRatesScreen
      initialRates={loaded.rates}
      labels={labels}
      canManage={props.canManage ?? loaded.canManage}
      state={props.state ?? loaded.state}
      upsertLaborRate={props.upsertLaborRate ?? upsertLaborRateAdapter}
    />
  );
}
