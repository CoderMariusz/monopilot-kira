/**
 * WAVE E2B — `/settings/quality/temp-ranges` Product temperature ranges page.
 *
 * Server Component: reads the org's configured product temperature ranges via the
 * `listProductTempRanges` Server Action (owned by the E2B cold-chain backend lane
 * — quality/_actions/cold-chain-actions.ts — imported, never re-authored; it
 * enforces quality.coldchain.manage). Mutations delegate to
 * `upsertProductTempRange` (same backend). The manage permission is also resolved
 * here so the affordances render honestly enabled/disabled (the action re-checks
 * regardless). The item picker is fed by the org-scoped `searchItems` action.
 *
 * Spec-driven (no exact prototype JSX exists for cold-chain). Parity pattern:
 * settings/labor-rates (settings list + editor dialog). See
 * _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md §1.2.
 *
 * i18n resolved server-side from production next-intl (settings.tempRanges.*, real
 * en+pl, ro/uk mirror EN). No inline JSX strings; no raw UUIDs.
 *
 * UI states: loading (Suspense skeleton via force-dynamic) / empty-with-CTA /
 * error / data + permission-denied.
 */
import React from 'react';
import { getTranslations } from 'next-intl/server';

import { hasPermission } from '../../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  listProductTempRanges,
  upsertProductTempRange as persistTempRange,
} from '../../../../(modules)/quality/_actions/cold-chain-actions';
import type { UpsertProductTempRangeInput as ActionUpsertInput } from '../../../../(modules)/quality/_actions/cold-chain-types';
import { searchItems as searchItemsAction } from '../../../../../../(npd)/fa/actions/search-items';
import TempRangesScreen, {
  type TempRangeRow,
  type TempRangesLabels,
  type PageState,
  type UpsertTempRangeInput,
  type UpsertTempRangeResult,
} from './temp-ranges-screen.client';

export const dynamic = 'force-dynamic';

const MANAGE_PERMISSION = 'quality.coldchain.manage';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type TempRangesPageProps = {
  params?: Promise<{ locale: string }>;
  ranges?: TempRangeRow[];
  canManage?: boolean;
  state?: PageState;
  upsertTempRange?: (input: UpsertTempRangeInput) => Promise<UpsertTempRangeResult>;
};

type LoaderResult = {
  state: PageState;
  ranges: TempRangeRow[];
  canManage: boolean;
};

const LABEL_KEYS: Array<keyof TempRangesLabels> = [
  'eyebrow',
  'title',
  'subtitle',
  'sectionTitle',
  'provenance',
  'addRange',
  'emptyCta',
  'columnItem',
  'columnMin',
  'columnMax',
  'columnRequiresCheck',
  'requiresCheckYes',
  'requiresCheckNo',
  'dialogAddTitle',
  'fieldItem',
  'fieldItemHelp',
  'fieldMin',
  'fieldMinHelp',
  'fieldMax',
  'fieldMaxHelp',
  'fieldRequiresCheck',
  'fieldRequiresCheckHelp',
  'selectedItem',
  'noItemSelected',
  'save',
  'savePending',
  'cancel',
  'createSuccess',
  'saveFailed',
  'invalidInput',
  'minMaxOrder',
  'insufficientPermission',
  'loading',
  'empty',
  'error',
  'forbidden',
  'pickerTrigger',
  'pickerSearchLabel',
  'pickerSearchPlaceholder',
  'pickerLoading',
  'pickerEmpty',
  'pickerCancel',
  'pickerError',
];

async function buildLabels(): Promise<TempRangesLabels> {
  const t = await getTranslations('settings.tempRanges');
  return LABEL_KEYS.reduce((labels, key) => {
    labels[key] = t(key);
    return labels;
  }, {} as TempRangesLabels);
}

async function resolveCanManage(): Promise<boolean> {
  try {
    return await withOrgContext(async (rawCtx) => hasPermission(rawCtx as OrgContextLike, MANAGE_PERMISSION));
  } catch {
    return false;
  }
}

async function loadTempRangesPageData(): Promise<LoaderResult> {
  // listProductTempRanges enforces quality.coldchain.manage (forbidden ⇒
  // permission-denied). canManage gates the editor affordance. Both reads are
  // independent so a degraded permission read still renders the list.
  const [result, canManage] = await Promise.all([listProductTempRanges(), resolveCanManage()]);
  if (!result.ok) {
    if (result.error === 'forbidden') {
      return { state: 'permission_denied', ranges: [], canManage: false };
    }
    return { state: 'error', ranges: [], canManage };
  }
  const ranges: TempRangeRow[] = result.ranges.map((range) => ({
    id: range.id,
    itemId: range.itemId,
    itemCode: range.itemCode,
    itemName: range.itemName,
    minTempC: range.minTempC,
    maxTempC: range.maxTempC,
    requiresCheck: range.requiresCheck,
  }));
  return { state: ranges.length === 0 ? 'empty' : 'ready', ranges, canManage };
}

/**
 * Server Action adapter: narrows the screen's editor input to the backend
 * `upsertProductTempRange` shape. The action re-validates RBAC + inputs, so this
 * is a thin import-only seam.
 */
async function upsertTempRangeAdapter(input: UpsertTempRangeInput): Promise<UpsertTempRangeResult> {
  'use server';
  const payload: ActionUpsertInput = {
    itemId: input.itemId,
    minTempC: input.minTempC,
    maxTempC: input.maxTempC,
    requiresCheck: input.requiresCheck,
  };
  return persistTempRange(payload);
}

export default async function TempRangesPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as TempRangesPageProps;
  const labels = await buildLabels();

  const hasInjected = Array.isArray(props.ranges) || props.state != null;
  const loaded: LoaderResult = hasInjected
    ? {
        state: props.state ?? ((props.ranges?.length ?? 0) === 0 ? 'empty' : 'ready'),
        ranges: props.ranges ?? [],
        canManage: props.canManage ?? false,
      }
    : await loadTempRangesPageData();

  return (
    <TempRangesScreen
      initialRanges={loaded.ranges}
      labels={labels}
      canManage={props.canManage ?? loaded.canManage}
      state={props.state ?? loaded.state}
      upsertTempRange={props.upsertTempRange ?? upsertTempRangeAdapter}
      searchItems={searchItemsAction}
    />
  );
}
