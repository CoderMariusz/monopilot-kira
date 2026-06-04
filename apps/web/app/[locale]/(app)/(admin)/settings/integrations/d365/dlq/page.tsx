import { getTranslations } from 'next-intl/server';

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { hasD365SyncPermission } from '../../../../../../../../lib/integrations/d365/rbac';
import D365DlqScreen, {
  type DlqActions,
  type DlqEntry,
  type DlqLabels,
  type PageState,
} from './d365-dlq-screen.client';
import { markDlqResolvedAction, retryDlqEntryAction, skipDlqEntryAction } from './_actions/dlq-actions';

export const dynamic = 'force-dynamic';

type QueryClient = { query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> };

type ReadResult = { entries: DlqEntry[]; canTrigger: boolean };

type D365DlqPageProps = {
  params?: Promise<{ locale: string }>;
  entries?: DlqEntry[];
  canTrigger?: boolean;
  state?: PageState;
  actions?: DlqActions;
};

const LABEL_NAMESPACE = 'settings.d365.dlq';

const DEFAULT_LABELS: DlqLabels = {
  title: 'D365 DLQ manager',
  subtitle: 'Dead-lettered D365 sync jobs. Retry re-submits to D365; mark-resolved/skip records an authorized, audited acknowledgement after a manual fix.',
  forbidden: 'Access denied. The technical.d365.sync_trigger permission is required to manage the D365 dead-letter queue.',
  thresholdBanner: 'DLQ depth is {depth} — above the alert threshold of {threshold}. Investigate the D365 connector.',
  table: 'Dead-letter queue',
  failedAt: 'Failed at',
  jobType: 'Job type',
  entity: 'Entity',
  recordKey: 'Record',
  retries: 'Retries',
  status: 'Status',
  error: 'Error',
  actions: 'Actions',
  view: 'View payload',
  retry: 'Retry',
  resolve: 'Mark resolved',
  skip: 'Skip',
  loading: 'Loading dead-letter queue…',
  empty: 'No dead-lettered D365 jobs.',
  errorState: 'Unable to load the D365 dead-letter queue.',
  count: '{count} entries',
  notAvailable: '—',
  payloadTitle: 'DLQ entry — {id}',
  errorDetail: 'Error detail',
  failedPayload: 'Failed payload',
  close: 'Close',
  confirmTitle: 'Confirm action',
  confirmRetry: 'Re-submit this dead-lettered job to D365?',
  confirmResolve: 'Mark this entry resolved? Use this only after the underlying issue was fixed in D365.',
  confirmSkip: 'Skip this entry? It will be dropped without being sent to D365.',
  cancel: 'Cancel',
  confirm: 'Confirm',
  pending: 'Working…',
  actionFailed: 'Action failed: {error}',
};

async function buildLabels(locale: string): Promise<DlqLabels> {
  try {
    const t = await getTranslations({ locale });
    return (Object.keys(DEFAULT_LABELS) as Array<keyof DlqLabels>).reduce((labels, key) => {
      const messageKey = `${LABEL_NAMESPACE}.${key}`;
      try {
        const translated = t(messageKey);
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

function normalizeEntry(row: Record<string, unknown>): DlqEntry {
  const status = row.status;
  return {
    id: String(row.id),
    job_type: String(row.job_type ?? 'unknown'),
    target_entity: String(row.target_entity ?? 'unknown'),
    direction: String(row.direction ?? 'push'),
    record_key: row.record_key == null ? null : String(row.record_key),
    d365_item_id: row.d365_item_id == null ? null : String(row.d365_item_id),
    error_message: String(row.error_message ?? ''),
    error_detail: row.error_detail ?? {},
    failed_payload: row.failed_payload ?? {},
    retry_count: Number(row.retry_count ?? 0),
    status: status === 'retried' || status === 'resolved' || status === 'skipped' ? status : 'unresolved',
    failed_at: String(row.failed_at),
  };
}

async function readDlqData(): Promise<ReadResult> {
  return withOrgContext(async ({ userId, orgId, client }) => {
    const queryClient = client as unknown as QueryClient;
    const canTrigger = await hasD365SyncPermission(queryClient as never, userId, orgId);
    const { rows } = await queryClient.query<Record<string, unknown>>(
      `select id, job_type, target_entity, direction, record_key, d365_item_id,
              error_message, error_detail, failed_payload, retry_count, status, failed_at
         from public.d365_sync_dlq
        where org_id = app.current_org_id()
        order by failed_at desc
        limit 200`,
    );
    return { entries: rows.map(normalizeEntry), canTrigger };
  });
}

export default async function D365DlqPage(propsInput: D365DlqPageProps = {}) {
  const params = propsInput.params ? await propsInput.params : { locale: 'en' };
  const labels = await buildLabels(params.locale ?? 'en');

  // Tests inject entries/canTrigger/state directly; production queries live data.
  const injected = propsInput.entries !== undefined || propsInput.canTrigger !== undefined || propsInput.state !== undefined;
  let state: PageState = propsInput.state ?? 'ready';
  let entries: DlqEntry[] = propsInput.entries ?? [];
  let canTrigger = propsInput.canTrigger ?? false;

  if (!injected) {
    try {
      const result = await readDlqData();
      entries = result.entries;
      canTrigger = result.canTrigger;
      if (!canTrigger && entries.length === 0) {
        // No permission AND no rows readable → present the permission-denied state.
        state = 'forbidden';
      }
    } catch {
      state = 'error';
    }
  }

  const actions: DlqActions = propsInput.actions ?? {
    retry: retryDlqEntryAction,
    markResolved: markDlqResolvedAction,
    skip: skipDlqEntryAction,
  };

  return (
    <D365DlqScreen
      entries={entries}
      canTrigger={canTrigger}
      labels={labels}
      state={state}
      actions={actions}
    />
  );
}
