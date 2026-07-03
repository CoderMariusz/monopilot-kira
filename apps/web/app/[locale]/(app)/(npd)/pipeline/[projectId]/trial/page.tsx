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

import { TrialScreen, type TrialScreenData, type TrialLabels, type PageState, type LogTrialCall, type UpdateTrialCall, type TrialActionOutcome, type BookLineTimeCall } from './_components/trial-screen';
import { logTrialBatch } from './_actions/log-trial-batch';
import { updateTrialBatch } from './_actions/update-trial-batch';
import { listProductionLines } from './_actions/list-production-lines';
import { upsertCapacityBlock } from '../../../../(modules)/planning/schedule/_actions/capacity-block-actions';
import { PLANNING_WO_WRITE_PERMISSION } from '../../../../(modules)/planning/work-orders/_actions/shared';
import { hasPermission } from '../../../../../../../lib/auth/has-permission';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { TRIAL_READ_PERMISSION, TRIAL_WRITE_PERMISSION, type TrialBatchView, type TrialResult } from './_actions/errors';
import { normalizeTimeHHMM, type TrialCapacityBookingView } from './_lib/capacity-block';
import { loadStageDeptSections } from '../../../../../../(npd)/pipeline/_actions/load-stage-dept-sections';
import {
  getCloseSectionLabel,
  getStageDeptSectionLabels,
} from '../../../../../../(npd)/pipeline/_lib/get-stage-dept-section-labels';
import { StageDeptSections } from '../../../../../../(npd)/pipeline/_components/StageDeptSections';

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
  colActions: 'Actions',
  resultPass: 'Pass',
  resultFail: 'Fail',
  resultPending: 'In progress',
  editTrial: 'Edit',
  modalTitle: 'Log new trial',
  editModalTitle: 'Edit trial',
  fieldTrialNo: 'Trial #',
  fieldDate: 'Trial date',
  fieldBatch: 'Batch size (kg)',
  fieldYield: 'Yield %',
  fieldTechnologist: 'Technologist',
  fieldResult: 'Result',
  fieldNotes: 'Notes',
  technologistNone: 'Unassigned',
  save: 'Save trial',
  saveEdit: 'Save changes',
  saving: 'Saving…',
  cancel: 'Cancel',
  saveError: 'Could not save the trial. Try again.',
  duplicateError: 'A trial with this number already exists for this project.',
  colLineTime: 'Line time',
  lineTimeNotBooked: 'Not booked',
  bookLineTime: 'Book line time',
  rebookLineTime: 'Re-book',
  bookLineTimeModalTitle: 'Book line time',
  rebookLineTimeModalTitle: 'Re-book line time',
  fieldLine: 'Production line',
  linePlaceholder: 'Select a line…',
  noLines: 'No production lines configured.',
  fieldBlockDate: 'Date',
  fieldStartTime: 'Start time',
  fieldEndTime: 'End time',
  bookLineTimeSaving: 'Saving…',
  bookLineTimeError: 'Could not book line time. Try again.',
  bookLineTimeErrorInvalidInput: 'Check the line, date, and time fields.',
  bookLineTimeErrorInvalidRange: 'End time must be after start time.',
  bookLineTimeErrorForbidden: 'You do not have permission to book line time.',
  bookLineTimeErrorInvalidLine: 'The selected line is not available.',
  bookLineTimeErrorTrialNotFound: 'This trial could not be found.',
  bookLineTimeErrorPersistence: 'Could not save the booking. Try again.',
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

type CapacityBookingRow = {
  id: string;
  trial_id: string;
  line_id: string;
  line_code: string;
  line_name: string;
  block_date: string;
  start_time: string;
  end_time: string;
};

async function readProductionLines(): Promise<TrialScreenData['lines']> {
  try {
    return await listProductionLines();
  } catch (error) {
    console.error('[trial] production-line read failed:', error);
    return [];
  }
}

async function readCapacityBookings(projectId: string): Promise<Record<string, TrialCapacityBookingView>> {
  try {
    return await withOrgContext(async (rawCtx): Promise<Record<string, TrialCapacityBookingView>> => {
      const ctx = rawCtx as OrgContextLike;
      const canRead = await hasPermission(ctx, TRIAL_READ_PERMISSION);
      if (!canRead) return {};

      const result = await ctx.client.query<CapacityBookingRow>(
        `select pcb.id::text as id,
                pcb.trial_id::text as trial_id,
                pcb.line_id::text as line_id,
                pl.code as line_code,
                pl.name as line_name,
                to_char(pcb.block_date, 'YYYY-MM-DD') as block_date,
                pcb.start_time::text as start_time,
                pcb.end_time::text as end_time
           from public.planning_capacity_blocks pcb
           join public.production_lines pl
             on pl.org_id = pcb.org_id
            and pl.id = pcb.line_id
          where pcb.org_id = app.current_org_id()
            and pcb.project_id = $1::uuid`,
        [projectId],
      );

      return result.rows.reduce<Record<string, TrialCapacityBookingView>>((acc, row) => {
        acc[row.trial_id] = {
          id: row.id,
          trialId: row.trial_id,
          lineId: row.line_id,
          lineCode: row.line_code,
          lineName: row.line_name,
          blockDate: row.block_date,
          startTime: normalizeTimeHHMM(row.start_time),
          endTime: normalizeTimeHHMM(row.end_time),
        };
        return acc;
      }, {});
    });
  } catch (error) {
    console.error('[trial] capacity-booking read failed:', error);
    return {};
  }
}

async function readCanBookLineTime(): Promise<boolean> {
  try {
    return await withOrgContext(async (rawCtx) => {
      const ctx = rawCtx as OrgContextLike;
      return await hasPermission(ctx, PLANNING_WO_WRITE_PERMISSION);
    });
  } catch {
    return false;
  }
}

async function readPageData(projectId: string): Promise<LoaderResult> {
  const [lines, capacityBookings, canBookLineTime] = await Promise.all([
    readProductionLines(),
    readCapacityBookings(projectId),
    readCanBookLineTime(),
  ]);

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
          canBookLineTime,
          lines,
          capacityBookings,
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

/** Server Action adapter for editing a logged trial (updateTrialBatch owns it). */
async function updateTrialAction(call: UpdateTrialCall): Promise<TrialActionOutcome> {
  'use server';
  const result = await updateTrialBatch(call);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/** Server Action adapter for booking trial line time on the schedule board. */
async function bookLineTimeAction(call: BookLineTimeCall) {
  'use server';
  const result = await upsertCapacityBlock(call);
  return result.ok ? { ok: true as const } : { ok: false as const, error: result.error };
}

async function readStageSections(projectId: string) {
  if (!projectId) return null;
  try {
    return await loadStageDeptSections({ projectId, stage: 'trial' });
  } catch (error) {
    console.error('[trial] stage department sections read failed:', error);
    return null;
  }
}

export default async function TrialPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as TrialPageProps;
  const { locale, projectId } = props.params ? await props.params : { locale: 'en', projectId: '' };

  const labels = await buildLabels(locale);

  const injected = props.data !== undefined || props.state !== undefined;
  const loaded: LoaderResult = injected
    ? { state: props.state ?? (props.data ? 'ready' : 'empty'), data: props.data ?? null }
    : await readPageData(projectId);
  const [stageSections, closeSectionLabel, stageDeptLabels] = await Promise.all([
    readStageSections(projectId),
    getCloseSectionLabel(locale),
    getStageDeptSectionLabels(locale),
  ]);

  const stageDeptSectionsEl = stageSections ? (
    <StageDeptSections
      projectId={projectId}
      stage="trial"
      data={stageSections}
      closeSectionLabel={closeSectionLabel}
      labels={stageDeptLabels}
    />
  ) : null;

  // When empty but the caller can write, render the screen with an empty table +
  // the "Log new trial" CTA rather than the read-only empty notice.
  if (loaded.state === 'empty' && loaded.data?.canWrite) {
    return (
      <>
        <TrialScreen
          state="ready"
          data={loaded.data}
          labels={labels}
          onLogTrial={logTrialAction}
          onUpdateTrial={updateTrialAction}
          onBookLineTime={bookLineTimeAction}
        />
        {stageDeptSectionsEl}
      </>
    );
  }

  return (
    <>
      <TrialScreen
        state={loaded.state}
        data={loaded.data}
        labels={labels}
        onLogTrial={logTrialAction}
        onUpdateTrial={updateTrialAction}
        onBookLineTime={bookLineTimeAction}
      />
      {stageDeptSectionsEl}
    </>
  );
}
