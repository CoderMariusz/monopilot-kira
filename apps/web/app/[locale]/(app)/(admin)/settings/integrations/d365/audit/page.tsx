import { getTranslations } from 'next-intl/server';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import D365AuditScreen, {
  type CallerRole,
  type D365AuditLabels,
  type D365SyncRun,
  type PageSearchParams,
  type PageState,
} from './d365-audit-screen.client';

export const dynamic = 'force-dynamic';

type D365AuditPageProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<PageSearchParams>;
  callerRole?: CallerRole;
  runs?: D365SyncRun[];
  runSyncNow?: () => Promise<{ ok: true } | { ok: false; message: string }>;
  state?: PageState;
};

type QueryClient = { query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> };
type ReadResult = { runs: D365SyncRun[]; callerRole: CallerRole };

const DEFAULT_LABELS: D365AuditLabels = {
  title: 'D365 sync audit',
  subtitle: 'Last sync results, raw error payloads, filters, and owner-triggered manual runs.',
  runNow: 'Run sync now',
  ownerRequired: 'Owner role required to run D365 sync now; insufficient permissions.',
  filters: 'D365 sync audit filters',
  status: 'Status',
  direction: 'Direction',
  startDate: 'Start date',
  endDate: 'End date',
  allStatuses: 'All statuses',
  allDirections: 'All directions',
  syncRuns: 'D365 sync runs',
  startedAt: 'started_at',
  finishedAt: 'finished_at',
  entityType: 'entity_type',
  rowsIn: 'rows_in',
  rowsOk: 'rows_ok',
  rowsFailed: 'rows_failed',
  errorSummary: 'error_summary',
  errors: 'Errors',
  actions: 'Actions',
  viewErrors: 'View errors',
  noErrors: 'No errors',
  close: 'Close',
  loading: 'Loading D365 sync audit…',
  empty: 'No D365 sync runs found.',
  error: 'Unable to load D365 sync audit.',
  count: '{visible} / {total} runs',
  notAvailable: '—',
  errorsTitle: 'Sync run errors — {id}',
};

const LABEL_NAMESPACE = 'settings.integrations.d365.audit';

async function buildLabels(locale: string): Promise<D365AuditLabels> {
  try {
    const t = await getTranslations({ locale });
    return (Object.keys(DEFAULT_LABELS) as Array<keyof D365AuditLabels>).reduce((labels, key) => {
      const messageKey = `${LABEL_NAMESPACE}.${key}`;
      try {
        const translated = t(messageKey, { visible: '{visible}', total: '{total}', id: '{id}' });
        labels[key] = translated && translated !== messageKey ? translated : DEFAULT_LABELS[key];
      } catch {
        labels[key] = DEFAULT_LABELS[key];
      }
      return labels;
    }, { ...DEFAULT_LABELS });
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

function normalizeDbRun(row: Record<string, unknown>): D365SyncRun {
  const errors = Array.isArray(row.errors) ? row.errors : [];
  return {
    id: String(row.id),
    started_at: String(row.started_at),
    finished_at: row.finished_at ? String(row.finished_at) : null,
    direction: row.direction === 'pull' ? 'pull' : 'push',
    status: row.status === 'ok' || row.status === 'partial' ? row.status : 'failed',
    entity_type: String(row.entity_type ?? row.source ?? 'unknown'),
    rows_in: Number(row.rows_in ?? row.records_in ?? 0),
    rows_ok: Number(row.rows_ok ?? 0),
    rows_failed: Number(row.rows_failed ?? 0),
    error_summary: row.error_summary == null ? null : String(row.error_summary),
    errors,
  };
}

async function readAuditData(): Promise<ReadResult> {
  return withOrgContext(async ({ userId, orgId, client }) => {
    const queryClient = client as QueryClient;
    const [runsResult, roleResult] = await Promise.all([
      queryClient.query<Record<string, unknown>>(
        `select id,
                started_at,
                finished_at,
                direction,
                entity_type,
                status,
                rows_in,
                rows_ok,
                rows_failed,
                error_summary,
                coalesce(errors, '[]'::jsonb) as errors
           from public.d365_sync_runs
          order by started_at desc
          limit 100`,
      ),
      queryClient.query<{ is_owner: boolean }>(
        `select exists (
            select 1
              from public.user_roles ur
              join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
             where ur.user_id = $1::uuid
               and ur.org_id = $2::uuid
               and lower(r.code) = 'owner'
          ) as is_owner`,
        [userId, orgId],
      ),
    ]);

    return {
      runs: runsResult.rows.map(normalizeDbRun),
      callerRole: roleResult.rows[0]?.is_owner ? 'owner' : 'viewer',
    };
  });
}

async function triggerD365SyncAction(): Promise<{ ok: true } | { ok: false; message: string }> {
  'use server';
  return withOrgContext(async ({ userId, orgId, client }) => {
    const queryClient = client as QueryClient;
    const roleResult = await queryClient.query<{ is_owner: boolean }>(
      `select exists (
          select 1
            from public.user_roles ur
            join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
           where ur.user_id = $1::uuid
             and ur.org_id = $2::uuid
             and lower(r.code) = 'owner'
        ) as is_owner`,
      [userId, orgId],
    );

    if (!roleResult.rows[0]?.is_owner) {
      return { ok: false, message: DEFAULT_LABELS.ownerRequired };
    }

    return { ok: false, message: 'T-030 triggerD365Sync action is not available in this worktree.' };
  });
}

export default async function D365AuditPage(propsInput: D365AuditPageProps = {}) {
  const params = propsInput.params ? await propsInput.params : { locale: 'en' };
  const labels = await buildLabels(params.locale ?? 'en');
  const injectedRuns = propsInput.runs;
  let state = propsInput.state ?? 'ready';
  let runs = injectedRuns ?? [];
  let callerRole = propsInput.callerRole ?? 'viewer';

  if (!injectedRuns && !propsInput.callerRole) {
    try {
      const result = await readAuditData();
      runs = result.runs;
      callerRole = result.callerRole;
    } catch {
      state = 'error';
    }
  }

  const searchParams = propsInput.searchParams ? await propsInput.searchParams : {};
  return (
    <D365AuditScreen
      callerRole={callerRole}
      labels={labels}
      runSyncNow={propsInput.runSyncNow ?? triggerD365SyncAction}
      runs={runs}
      state={state}
      initialSearchParams={searchParams}
    />
  );
}
