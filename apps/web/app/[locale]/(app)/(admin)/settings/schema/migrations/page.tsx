import { getTranslations } from 'next-intl/server';

import { Button } from '@monopilot/ui/Button';
import { Card, CardContent } from '@monopilot/ui/Card';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { MigrationsQueue } from './migrations-queue.client';
import type { SchemaMigrationRow as ClientMigrationRow } from './migrations-queue.client';

export const dynamic = 'force-dynamic';

type MigrationStatus = 'pending' | 'approved' | 'running' | 'completed' | 'failed' | 'rolled_back';
type MigrationAction = 'promote_l2_to_l1' | 'add' | 'edit' | 'deprecate' | string;

type SchemaMigrationRow = ClientMigrationRow & {
  action: MigrationAction;
};

type PageSearchParams = Record<string, string | string[] | undefined>;
type SchemaMigrationsQueueProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<PageSearchParams>;
  migrations?: SchemaMigrationRow[];
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'forbidden';
};

type QueryClient = { query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> };
type MigrationDbRow = {
  id: string;
  table_code: string;
  column_code: string | null;
  action: string;
  migration_script: string | null;
  approved_by_name: string | null;
  status: string;
  result_notes: string | null;
  requested_at: string | Date | null;
  approved_at: string | Date | null;
  executed_at: string | Date | null;
};

type QueueLabels = Record<string, string>;

const ROW_STATUSES: MigrationStatus[] = ['approved', 'running', 'completed', 'failed', 'rolled_back'];

const DEFAULT_LABELS = {
  title: 'Schema Migrations Queue',
  subtitle: 'Track L1 promotion requests from submission to completion. Reviewed and executed by MonoPilot superadmin.',
  exportCsv: 'Export queue CSV',
  statusFilter: 'Status filter',
  migrationRequests: 'Migration requests',
  migrationTableLabel: 'Schema migrations queue',
  migrationId: 'Migration ID',
  tableColumn: 'Table / Column',
  action: 'Action',
  requestedBy: 'Requested By',
  requestedAt: 'Requested At',
  approvedBy: 'Approved By',
  status: 'Status',
  actions: 'Actions',
  expand: 'Expand row',
  collapse: 'Collapse ↑',
  diff: 'Diff',
  showAll: 'Show all',
  viewMigrationScript: 'View migration script',
  cancel: 'Cancel',
  detail: 'Migration script detail',
  resultNotes: 'Result notes',
  statusTimeline: 'Status timeline',
  noMigrationRequests: 'No migration requests.',
  noFilteredMigrationRequests: 'No migration requests for the selected filter.',
  loading: 'Loading schema migrations queue…',
  error: 'Unable to load schema migrations queue.',
  forbidden: 'Permission denied for schema migrations queue.',
  countSummary: '{shown} of {total} migrations',
  filter_all: 'All',
  filter_pending: 'Pending',
  filter_approved: 'Approved',
  filter_running: 'Running',
  filter_completed: 'Completed',
  filter_failed: 'Failed',
  filter_rolled_back: 'Rolled back',
  provenance:
    'Live rows are read from public.schema_migrations; requester names fall back to Schema admin until requester metadata is available.',
  requestedByFallback: 'Schema admin',
  systemFallback: 'Schema migration runner',
  none: '—',
} as const;

function normalizeRowStatus(value: string): MigrationStatus {
  if ((ROW_STATUSES as string[]).includes(value)) return value as MigrationStatus;
  return 'pending';
}

function toIsoDate(value: string | Date | null | undefined) {
  if (!value) return new Date(0).toISOString();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}

function labelValue(labels: QueueLabels, key: keyof QueueLabels, translated: string) {
  return !translated || translated === key ? labels[key] : translated;
}

async function buildLabels(locale: string): Promise<QueueLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.schema_migrations_queue' });
    const labels: QueueLabels = { ...DEFAULT_LABELS };
    const fallbackLabels: QueueLabels = DEFAULT_LABELS;
    for (const key of Object.keys(DEFAULT_LABELS)) {
      try {
        labels[key] = labelValue(labels, key, t(key));
      } catch {
        labels[key] = fallbackLabels[key];
      }
    }
    return labels;
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

function buildTimeline(row: MigrationDbRow, labels: QueueLabels): SchemaMigrationRow['timeline'] {
  const status = normalizeRowStatus(row.status);
  const timeline: SchemaMigrationRow['timeline'] = [
    { status: 'pending', at: toIsoDate(row.requested_at), actor: labels.requestedByFallback },
  ];

  if (row.approved_at && (status === 'approved' || status === 'running' || status === 'completed' || status === 'failed' || status === 'rolled_back')) {
    timeline.push({ status: 'approved', at: toIsoDate(row.approved_at), actor: row.approved_by_name ?? 'MonoPilot Ops' });
  }

  if (row.executed_at && status !== 'pending' && status !== 'approved') {
    timeline.push({ status, at: toIsoDate(row.executed_at), actor: row.approved_by_name ?? labels.systemFallback });
  }

  return timeline;
}

function mapDbRow(row: MigrationDbRow, labels: QueueLabels): SchemaMigrationRow {
  const status = normalizeRowStatus(row.status);
  return {
    migrationId: row.id,
    tableCode: row.table_code,
    columnCode: row.column_code,
    action: row.action,
    requestedByName: labels.requestedByFallback,
    requestedAt: toIsoDate(row.requested_at),
    approvedByName: row.approved_by_name,
    status,
    migrationScript: row.migration_script ?? '-- No migration script recorded for this request.',
    resultNotes: row.result_notes,
    timeline: buildTimeline(row, labels),
  };
}

async function readSchemaMigrations(labels: QueueLabels): Promise<{ state: SchemaMigrationsQueueProps['state']; migrations: SchemaMigrationRow[] }> {
  try {
    return await withOrgContext(async ({ client }) => {
      const queryClient = client as QueryClient;
      const result = await queryClient.query<MigrationDbRow>(
        `select sm.id::text,
                sm.table_code,
                sm.column_code,
                sm.action,
                sm.migration_script,
                sm.status,
                sm.result_notes,
                sm.created_at as requested_at,
                sm.approved_at,
                sm.executed_at,
                nullif(trim(coalesce(u.name, u.email, '')), '') as approved_by_name
           from public.schema_migrations sm
           left join public.users u on u.id = sm.approved_by and u.org_id = app.current_org_id()
          where sm.org_id = app.current_org_id()
            and sm.action <> 'runner_apply'
          order by sm.created_at desc nulls last,
                   sm.applied_at desc nulls last,
                   sm.id desc
          limit 100`,
      );
      const migrations = result.rows.map((row) => mapDbRow(row, labels));
      return { state: migrations.length ? 'ready' : 'empty', migrations };
    });
  } catch {
    return { state: 'error', migrations: [] };
  }
}

export default async function SchemaMigrationsQueuePage(propsInput: unknown) {
  const props = (propsInput ?? {}) as SchemaMigrationsQueueProps;
  const { locale = 'en' } = props.params ? await props.params : { locale: 'en' };
  const labels = await buildLabels(locale);
  let state = props.state ?? 'ready';
  let migrations = props.migrations;

  if (!migrations && state === 'ready') {
    const result = await readSchemaMigrations(labels);
    state = result.state ?? 'ready';
    migrations = result.migrations;
  }

  const rows = migrations ?? [];

  return (
    <main
      data-testid="settings-schema-migrations-queue-screen"
      data-route="/settings/schema/migrations"
      data-screen="schema-migrations-queue"
      data-ux-source="SET-033"
      aria-labelledby="settings-schema-migrations-title"
      className="settings-page settings-schema-migrations-queue space-y-4"
    >
      <header data-region="page-head" className="settings-page__head">
        <div>
          <h1 id="settings-schema-migrations-title">{labels.title}</h1>
          <p>{labels.subtitle}</p>
        </div>
        <Button type="button" className="btn-secondary btn-sm" disabled aria-disabled="true">
          {labels.exportCsv}
        </Button>
      </header>

      <div className="alert alert-blue rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900" role="note">
        {labels.provenance}
      </div>

      {state === 'loading' ? (
        <Card aria-busy="true" data-testid="schema-migrations-queue-loading">
          <CardContent role="status">{labels.loading}</CardContent>
        </Card>
      ) : null}

      {state === 'error' ? (
        <Card>
          <CardContent role="alert">{labels.error}</CardContent>
        </Card>
      ) : null}

      {state === 'forbidden' ? (
        <Card>
          <CardContent role="alert">{labels.forbidden}</CardContent>
        </Card>
      ) : null}

      {state === 'empty' || (state === 'ready' && rows.length === 0) ? (
        <Card>
          <CardContent role="status">{labels.noMigrationRequests}</CardContent>
        </Card>
      ) : null}

      {state === 'ready' && rows.length > 0 ? (
        <MigrationsQueue locale={locale} rows={rows} labels={labels} />
      ) : null}
    </main>
  );
}
