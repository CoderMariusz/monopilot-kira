/**
 * 01-NPD TRIAL stage page (RSC).
 *
 * Route: /[locale]/(app)/(npd)/pipeline/[projectId]/trial
 *
 * Server Component. Reads REAL, org-scoped data via `withOrgContext` (RLS as
 * app_user with app.current_org_id()). No mocks, no hard-coded rows.
 *
 *   - public.npd_projects        → resolve the project + its FA candidate name
 *   - public.trial_batches       → trial rows (migration 233) via listTrialBatches
 *   - public.users               → technologist picker options (org-scoped)
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/other-stages.jsx:222-257 (TrialScreen)
 *   (the LEGACY banner at 222-230 is intentionally NOT rendered — all 8 stages
 *    are built for real.)
 *
 * RBAC: read = npd.trial.read, write = npd.trial.write (resolved server-side,
 * never trusted from the client). i18n via t('npd.trial.*') with built-in
 * English fallbacks so the screen renders before the keys are added to the JSON.
 *
 * The write (logTrialBatch) is owned by the trial Server Action and imported,
 * never authored here; it is wrapped in a thin 'use server' adapter to cross
 * the RSC boundary (no raw function props).
 */

import { getTranslations } from 'next-intl/server';

import { TrialScreen, type TrialScreenData, type TrialLabels, type PageState, type LogTrialCall, type TrialActionOutcome } from './_components/trial-screen';
import { logTrialBatch } from './_actions/log-trial-batch';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { TRIAL_READ_PERMISSION, TRIAL_WRITE_PERMISSION, type TrialBatchView, type TrialResult } from './_actions/errors';

export const dynamic = 'force-dynamic';

type TrialPageProps = {
  params?: Promise<{ locale: string; projectId: string }>;
  // Test-only injection seam (mirrors costing/page.tsx).
  data?: TrialScreenData | null;
  state?: PageState;
};

type QueryResult<T> = { rows: T[] };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type LoaderResult = { state: PageState; data: TrialScreenData | null };

const DEFAULT_LABELS: TrialLabels = {
  title: 'Lab & kitchen trials',
  subtitle: 'Small-batch runs to validate recipe before pilot.',
  logNewTrial: '+ Log new trial',
  colTrialNo: 'Trial #',
  colDate: 'Date',
  colBatch: 'Batch',
  colYield: 'Yield',
  colTechnologist: 'Technologist',
  colResult: 'Result',
  colNotes: 'Notes',
  resultPass: 'Pass',
  resultFail: 'Fail',
  resultPending: 'In progress',
  modalTitle: 'Log new trial',
  fieldTrialNo: 'Trial #',
  fieldDate: 'Trial date',
  fieldBatch: 'Batch size (kg)',
  fieldYield: 'Yield %',
  fieldTechnologist: 'Technologist',
  fieldResult: 'Result',
  fieldNotes: 'Notes',
  technologistNone: 'Unassigned',
  save: 'Save trial',
  saving: 'Saving…',
  cancel: 'Cancel',
  saveError: 'Could not save the trial. Try again.',
  duplicateError: 'A trial with this number already exists for this project.',
  loading: 'Loading trials…',
  empty: 'No trials logged yet',
  emptyBody: 'Log a small-batch run to validate the recipe before pilot.',
  error: 'Unable to load trial data.',
  forbidden: 'You do not have permission to view trials.',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof TrialLabels>;

function translateLabel(t: (key: string) => string, key: keyof TrialLabels): string {
  try {
    const value = t(key);
    return value === key ? DEFAULT_LABELS[key] : value;
  } catch {
    return DEFAULT_LABELS[key];
  }
}

async function buildLabels(locale: string): Promise<TrialLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.trial' });
    return LABEL_KEYS.reduce((labels, key) => {
      labels[key] = translateLabel(t, key);
      return labels;
    }, {} as TrialLabels);
  } catch {
    return { ...DEFAULT_LABELS };
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

type TrialRow = {
  id: string;
  trial_no: string;
  trial_date: string | null;
  batch_size_kg: string | null;
  yield_pct: string | null;
  technologist_user_id: string | null;
  technologist_name: string | null;
  result: TrialResult;
  notes: string | null;
};

async function readPageData(projectId: string): Promise<LoaderResult> {
  try {
    return await withOrgContext(async (rawCtx): Promise<LoaderResult> => {
      const ctx = rawCtx as OrgContextLike;

      const canRead = await hasPermission(ctx, TRIAL_READ_PERMISSION);
      if (!canRead) return { state: 'permission_denied', data: null };

      const canWrite = await hasPermission(ctx, TRIAL_WRITE_PERMISSION);

      const project = await ctx.client.query<{ product_code: string | null; product_name: string | null }>(
        `select p.product_code,
                pr.product_name
           from public.npd_projects p
           left join public.product pr
             on pr.org_id = p.org_id and pr.product_code = p.product_code
          where p.id = $1::uuid and p.org_id = app.current_org_id()
          limit 1`,
        [projectId],
      );
      if (project.rows.length === 0) return { state: 'error', data: null };
      const productName = project.rows[0]?.product_name ?? project.rows[0]?.product_code ?? 'Project';

      const trials = await ctx.client.query<TrialRow>(
        `select tb.id,
                tb.trial_no,
                to_char(tb.trial_date, 'YYYY-MM-DD') as trial_date,
                tb.batch_size_kg::text               as batch_size_kg,
                tb.yield_pct::text                   as yield_pct,
                tb.technologist_user_id::text        as technologist_user_id,
                u.display_name                       as technologist_name,
                tb.result,
                tb.notes
           from public.trial_batches tb
           left join public.users u
             on u.id = tb.technologist_user_id and u.org_id = tb.org_id
          where tb.org_id = app.current_org_id()
            and tb.project_id = $1::uuid
          order by tb.trial_date desc nulls last, tb.trial_no asc`,
        [projectId],
      );

      const technologists = await ctx.client.query<{ id: string; name: string }>(
        `select id::text as id, coalesce(display_name, email::text, id::text) as name
           from public.users
          where org_id = app.current_org_id()
          order by name asc
          limit 200`,
      );

      const batches: TrialBatchView[] = trials.rows.map((r) => ({
        id: r.id,
        trialNo: r.trial_no,
        trialDate: r.trial_date,
        batchSizeKg: r.batch_size_kg,
        yieldPct: r.yield_pct,
        technologistUserId: r.technologist_user_id,
        technologistName: r.technologist_name,
        result: r.result,
        notes: r.notes,
      }));

      if (batches.length === 0 && !canWrite) {
        return { state: 'empty', data: null };
      }

      return {
        state: batches.length === 0 ? 'empty' : 'ready',
        data: {
          projectId,
          productName,
          batches,
          technologists: technologists.rows.map((u) => ({ id: u.id, name: u.name })),
          canWrite,
        },
      };
    });
  } catch (error) {
    console.error('[trial] org-scoped read failed:', error);
    return { state: 'error', data: null };
  }
}

/** Server Action adapter passed to the client (logTrialBatch owns the action). */
async function logTrialAction(call: LogTrialCall): Promise<TrialActionOutcome> {
  'use server';
  const result = await logTrialBatch(call);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export default async function TrialPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as TrialPageProps;
  const { locale, projectId } = props.params ? await props.params : { locale: 'en', projectId: '' };

  const labels = await buildLabels(locale);

  const injected = props.data !== undefined || props.state !== undefined;
  const loaded: LoaderResult = injected
    ? { state: props.state ?? (props.data ? 'ready' : 'empty'), data: props.data ?? null }
    : await readPageData(projectId);

  // When empty but the caller can write, render the screen with an empty table +
  // the "Log new trial" CTA rather than the read-only empty notice.
  if (loaded.state === 'empty' && loaded.data?.canWrite) {
    return <TrialScreen state="ready" data={loaded.data} labels={labels} onLogTrial={logTrialAction} />;
  }

  return <TrialScreen state={loaded.state} data={loaded.data} labels={labels} onLogTrial={logTrialAction} />;
}
