/**
 * E1 — `/warehouse/print-history` Print-history page.
 *
 * Server Component: resolves the settings.org.update permission server-side (the
 * SAME permission the print Server Actions enforce) and reads the org-scoped print
 * jobs via the real `listPrintJobs` Server Action (owned by the E1 backend lane —
 * settings/infra/printers/_actions/printers.ts — imported, never re-authored).
 * Reprints are delegated to the real `reprintFromHistory` Server Action. Tests
 * inject jobs / canManage / state and a reprint stub to exercise the four UI states
 * without a live DB.
 *
 * i18n resolved server-side from the staged printers bundle (`history` namespace,
 * en + pl real, EN fallback) — see ./print-history-labels.ts. No inline JSX
 * strings; no raw UUIDs (entity shown via lp_code / entity_display).
 *
 * UI states: loading (Suspense skeleton) / empty / error / data + permission-denied.
 *
 * See _meta/atomic-tasks/UI-PROTOTYPE-PARITY-POLICY.md.
 */
import React from 'react';

import { withOrgContext } from '../../../../../../lib/auth/with-org-context';
import {
  listPrintJobs,
  reprintFromHistory as persistReprint,
  type PrintJobListRow,
  type PrintJobRow as ActionPrintJobRow,
} from '../../../(admin)/settings/infra/printers/_actions/printers';
import PrintHistoryScreen, {
  type PageState,
  type PrintHistoryLabels,
  type PrintJobRow,
} from './print-history-screen.client';
import { getPrintHistoryTranslator } from './print-history-labels';

export const dynamic = 'force-dynamic';

const MANAGE_PERMISSION = 'settings.org.update';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type PrintHistoryPageProps = {
  params?: Promise<{ locale: string }>;
  jobs?: PrintJobRow[];
  canManage?: boolean;
  state?: PageState;
  reprintFromHistory?: (jobId: string) => Promise<PrintJobRow> | PrintJobRow;
};

type LoaderResult = { state: PageState; jobs: PrintJobRow[]; canManage: boolean };

const LABEL_KEYS: Array<keyof PrintHistoryLabels> = [
  'title',
  'subtitle',
  'filterLabel',
  'filterAll',
  'filterQueued',
  'filterSent',
  'filterFailed',
  'columnEntity',
  'columnStatus',
  'columnCopies',
  'columnPrinter',
  'columnCreated',
  'columnResult',
  'columnActions',
  'statusQueued',
  'statusSent',
  'statusFailed',
  'download',
  'noPrinter',
  'reprint',
  'reprintPending',
  'reprintSuccess',
  'reprintFailed',
  'loading',
  'empty',
  'error',
  'forbidden',
  'insufficientPermission',
];

function buildLabels(locale: string): PrintHistoryLabels {
  const t = getPrintHistoryTranslator(locale);
  return LABEL_KEYS.reduce((labels, key) => {
    labels[key] = t(`history.${key}`);
    return labels;
  }, {} as PrintHistoryLabels);
}

function toScreenRow(row: PrintJobListRow): PrintJobRow {
  return {
    id: row.id,
    status: row.status,
    entity_type: row.entity_type,
    entity_display: row.entity_display,
    lp_code: row.lp_code,
    copies: row.copies,
    printer_name: row.printer_name,
    result_url: row.result_url,
    created_at: row.created_at,
  };
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

async function loadPrintHistory(): Promise<LoaderResult> {
  try {
    const canManage = await withOrgContext(async (rawCtx) => hasPermission(rawCtx as OrgContextLike, MANAGE_PERMISSION));
    if (!canManage) return { state: 'permission_denied', jobs: [], canManage: false };

    const rows = await listPrintJobs();
    const jobs = rows.map(toScreenRow);
    return { state: jobs.length === 0 ? 'empty' : 'ready', jobs, canManage: true };
  } catch (error) {
    console.error(
      '[warehouse/print-history] load_failed',
      error instanceof Error ? { message: error.message } : { message: String(error) },
    );
    return { state: 'error', jobs: [], canManage: false };
  }
}

/**
 * Adapter — the screen prop's row shape mirrors the action's display row, so the
 * real `reprintFromHistory` result (a raw PrintJobRow, no display joins) is mapped
 * to a screen row with the printer name / lp_code left null; the page refresh on
 * navigation rehydrates the full join. Optimistic insert is honest about what the
 * single-row return exposes.
 */
async function defaultReprint(jobId: string): Promise<PrintJobRow> {
  'use server';
  const created: ActionPrintJobRow = await persistReprint(jobId);
  return {
    id: created.id,
    status: created.status,
    entity_type: created.entity_type,
    entity_display: (created.payload?.entity_display as string | undefined) ?? created.entity_type,
    lp_code: (created.payload?.lp_code as string | undefined) ?? null,
    copies: created.copies,
    printer_name: null,
    result_url: created.result_url,
    created_at: created.created_at,
  };
}

export default async function PrintHistoryPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as PrintHistoryPageProps;
  const { locale } = props.params ? await props.params : { locale: 'en' };
  const labels = buildLabels(locale);

  const hasInjected = Array.isArray(props.jobs) || props.state != null;
  const loaded: LoaderResult = hasInjected
    ? {
        state: props.state ?? ((props.jobs?.length ?? 0) === 0 ? 'empty' : 'ready'),
        jobs: props.jobs ?? [],
        canManage: props.canManage ?? false,
      }
    : await loadPrintHistory();

  return (
    <PrintHistoryScreen
      initialJobs={loaded.jobs}
      labels={labels}
      canManage={props.canManage ?? loaded.canManage}
      state={props.state ?? loaded.state}
      reprintFromHistory={props.reprintFromHistory ?? defaultReprint}
    />
  );
}
