import { getTranslations } from 'next-intl/server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

export const dynamic = 'force-dynamic';

const AUDIT_READ_PERMISSION = 'settings.audit.read';

type TenantMigrationStatus = 'scheduled' | 'canary' | 'progressive' | 'completed' | 'rolled_back' | 'force_scheduled';
type TenantMigrationType = 'schema_upgrade' | 'settings_rollout' | 'rules_migration' | string;

type TenantMigrationRow = {
  id: string;
  startedAt: string;
  status: TenantMigrationStatus;
  type: TenantMigrationType;
  initiatedByUser: string;
  snapshotBefore: unknown;
  snapshotAfter: unknown;
};

type CallerAccess = {
  permissions: string[];
  roleCodes: string[];
};

type PageSearchParams = Record<string, string | string[] | undefined>;

type TenantMigrationHistoryProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<PageSearchParams>;
  migrations?: TenantMigrationRow[];
  callerAccess?: CallerAccess;
  now?: string;
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'forbidden';
};

type QueryClient = { query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount?: number }> };

type PermissionCheckRow = { ok: boolean };

type TenantMigrationDbRow = {
  id: string;
  component: string;
  current_version: string;
  target_version: string;
  status: string;
  canary_pct: string | number | null;
  snapshot_before: unknown;
  snapshot_after: unknown;
  snapshot_before_present: boolean;
  snapshot_after_present: boolean;
  last_run_at: string | Date | null;
  scheduled_by_name: string | null;
  scheduled_by_email: string | null;
  created_at: string | Date | null;
};

type ColumnNameRow = { column_name: string };

type Labels = { -readonly [K in keyof typeof DEFAULT_LABELS]: string };

const DEFAULT_LABELS = {
  title: 'Migration History',
  subtitle: 'Read-only tenant_migrations audit list for L2 upgrade history. Snapshots show raw before/after JSON only.',
  exportDisabled: 'Export filtered results',
  orgNotice: 'Showing tenant_migrations rows scoped to your organization. Cross-tenant viewing is not available on this screen.',
  statusFilter: 'Status filter',
  dateRangeFilter: 'Date range filter',
  allStatuses: 'All statuses',
  allDates: 'All dates',
  last7Days: 'Last 7 days',
  last30Days: 'Last 30 days',
  last90Days: 'Last 90 days',
  rowCount: 'entries',
  historyTableLabel: 'Tenant migration history',
  startedAt: 'Started At',
  status: 'Status',
  type: 'Type',
  initiatedByUser: 'Initiated By User',
  actions: 'Actions',
  viewSnapshot: 'View snapshot',
  snapshotTitle: 'Migration snapshot',
  beforeSnapshot: 'Before snapshot JSON',
  afterSnapshot: 'After snapshot JSON',
  loading: 'Loading tenant migration history…',
  empty: 'No tenant migration history rows are available for the selected filters.',
  error: 'Unable to load tenant migration history.',
  forbiddenTitle: '403 Forbidden',
  forbiddenBody: 'Access denied. The settings.audit.read permission is required to view Migration History.',
  provenance: 'Data source: live tenant_migrations rows via withOrgContext; test props may inject deterministic rows for RTL.',
  unknownUser: 'System migration runner',
} as const;

const STATUS_OPTIONS: Array<{ value: 'all' | TenantMigrationStatus; label: string }> = [
  { value: 'all', label: DEFAULT_LABELS.allStatuses },
  { value: 'canary', label: 'canary' },
  { value: 'completed', label: 'completed' },
  { value: 'rolled_back', label: 'rolled_back' },
  { value: 'scheduled', label: 'scheduled' },
  { value: 'progressive', label: 'progressive' },
  { value: 'force_scheduled', label: 'force_scheduled' },
];

const DATE_RANGE_OPTIONS: Array<{ value: 'all' | 'last_7_days' | 'last_30_days' | 'last_90_days'; label: string; days?: number }> = [
  { value: 'all', label: DEFAULT_LABELS.allDates },
  { value: 'last_7_days', label: DEFAULT_LABELS.last7Days, days: 7 },
  { value: 'last_30_days', label: DEFAULT_LABELS.last30Days, days: 30 },
  { value: 'last_90_days', label: DEFAULT_LABELS.last90Days, days: 90 },
];

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeStatus(value: string | undefined): 'all' | TenantMigrationStatus {
  return STATUS_OPTIONS.some((option) => option.value === value) ? (value as 'all' | TenantMigrationStatus) : 'all';
}

function normalizeDateRange(value: string | undefined): 'all' | 'last_7_days' | 'last_30_days' | 'last_90_days' {
  return DATE_RANGE_OPTIONS.some((option) => option.value === value) ? (value as 'all' | 'last_7_days' | 'last_30_days' | 'last_90_days') : 'all';
}

function toIso(value: string | Date | null | undefined) {
  if (!value) return new Date(0).toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function prettyJson(value: unknown) {
  return JSON.stringify(value ?? null, null, 2);
}

function toType(row: TenantMigrationRow) {
  if (row.type) return row.type;
  return 'schema_upgrade';
}

function statusTone(status: TenantMigrationStatus) {
  if (status === 'completed') return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
  if (status === 'rolled_back') return 'bg-rose-50 text-rose-700 ring-rose-200';
  if (status === 'canary' || status === 'progressive') return 'bg-amber-50 text-amber-700 ring-amber-200';
  return 'bg-slate-100 text-slate-700 ring-slate-200';
}

function filterRows(rows: TenantMigrationRow[], status: 'all' | TenantMigrationStatus, dateRange: 'all' | 'last_7_days' | 'last_30_days' | 'last_90_days', nowIso: string) {
  const dateOption = DATE_RANGE_OPTIONS.find((option) => option.value === dateRange);
  const lowerBound = dateOption?.days ? Date.parse(nowIso) - dateOption.days * 24 * 60 * 60 * 1000 : null;
  return rows
    .filter((row) => status === 'all' || row.status === status)
    .filter((row) => {
      if (lowerBound === null) return true;
      const startedAt = Date.parse(row.startedAt);
      return Number.isFinite(startedAt) && startedAt >= lowerBound && startedAt <= Date.parse(nowIso);
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function mapDbRow(row: TenantMigrationDbRow, labels: Labels): TenantMigrationRow {
  const startedAt = toIso(row.last_run_at ?? row.created_at);
  const normalizedStatus = normalizeStatus(row.status);
  const status: TenantMigrationStatus = normalizedStatus === 'all' ? 'scheduled' : normalizedStatus;
  const fallbackBefore = {
    component: row.component,
    current_version: row.current_version,
  };
  const fallbackAfter = {
    component: row.component,
    target_version: row.target_version,
    status,
    canary_pct: row.canary_pct,
  };
  return {
    id: row.id,
    startedAt,
    status,
    type: row.component === 'schema' ? 'schema_upgrade' : row.component === 'rule_engine' ? 'rules_migration' : 'settings_rollout',
    initiatedByUser: row.scheduled_by_name ?? row.scheduled_by_email ?? labels.unknownUser,
    snapshotBefore: row.snapshot_before_present ? row.snapshot_before : fallbackBefore,
    snapshotAfter: row.snapshot_after_present ? row.snapshot_after : fallbackAfter,
  };
}

function snapshotSelectExpr(columns: Set<string>, candidates: string[]) {
  const column = candidates.find((candidate) => columns.has(candidate));
  return column ? `tm.${column}` : 'null::jsonb';
}

function labelValue(labels: Labels, key: keyof Labels, translated: string) {
  return !translated || translated === key ? labels[key] : translated;
}

async function buildLabels(locale: string): Promise<Labels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.tenant_migration_history' });
    const labels: Labels = { ...DEFAULT_LABELS };
    for (const key of Object.keys(DEFAULT_LABELS) as Array<keyof Labels>) {
      try {
        labels[key] = labelValue(labels, key, t(key));
      } catch {
        labels[key] = DEFAULT_LABELS[key];
      }
    }
    return labels;
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

async function hasAuditReadPermission(client: QueryClient, userId: string, orgId: string): Promise<boolean> {
  const { rows, rowCount } = await client.query<PermissionCheckRow>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [userId, orgId, AUDIT_READ_PERMISSION],
  );
  return (rowCount ?? rows.length) > 0;
}

async function readTenantMigrations(labels: Labels): Promise<{ state: TenantMigrationHistoryProps['state']; rows: TenantMigrationRow[] }> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as QueryClient;
      const canReadAudit = await hasAuditReadPermission(queryClient, userId, orgId);
      if (!canReadAudit) return { state: 'forbidden', rows: [] };

      const snapshotColumnResult = await queryClient.query<ColumnNameRow>(
        `select column_name
           from information_schema.columns
          where table_schema = 'public'
            and table_name = 'tenant_migrations'
            and column_name = any($1::text[])`,
        [['snapshot_before', 'before_snapshot', 'snapshot_before_json', 'snapshot_after', 'after_snapshot', 'snapshot_after_json']],
      );
      const snapshotColumns = new Set(snapshotColumnResult.rows.map((row) => row.column_name));
      const beforeSnapshotExpr = snapshotSelectExpr(snapshotColumns, ['snapshot_before', 'before_snapshot', 'snapshot_before_json']);
      const afterSnapshotExpr = snapshotSelectExpr(snapshotColumns, ['snapshot_after', 'after_snapshot', 'snapshot_after_json']);
      const beforeSnapshotPresent = beforeSnapshotExpr !== 'null::jsonb';
      const afterSnapshotPresent = afterSnapshotExpr !== 'null::jsonb';

      const result = await queryClient.query<TenantMigrationDbRow>(
        `select tm.id::text,
                tm.component,
                tm.current_version,
                tm.target_version,
                tm.status,
                tm.canary_pct,
                ${beforeSnapshotExpr} as snapshot_before,
                ${afterSnapshotExpr} as snapshot_after,
                ${beforeSnapshotPresent ? 'true' : 'false'} as snapshot_before_present,
                ${afterSnapshotPresent ? 'true' : 'false'} as snapshot_after_present,
                tm.last_run_at,
                tm.created_at,
                nullif(trim(coalesce(u.name, u.email, '')), '') as scheduled_by_name,
                u.email as scheduled_by_email
           from public.tenant_migrations tm
           left join public.users u on u.id = tm.scheduled_by and u.org_id = app.current_org_id()
          where tm.org_id = app.current_org_id()
          order by coalesce(tm.last_run_at, tm.created_at) desc nulls last,
                   tm.id desc
          limit 200`,
      );
      const rows = result.rows.map((row) => mapDbRow(row, labels));
      return { state: rows.length ? 'ready' : 'empty', rows };
    });
  } catch {
    return { state: 'error', rows: [] };
  }
}

function callerCanReadAudit(callerAccess: CallerAccess | undefined) {
  return callerAccess?.permissions.includes(AUDIT_READ_PERMISSION) === true;
}

function Forbidden({ labels }: { labels: Labels }) {
  return (
    <main className="settings-page settings-tenant-migration-history space-y-4" aria-labelledby="settings-tenant-migration-history-forbidden-title">
      <section role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-900">
        <h1 id="settings-tenant-migration-history-forbidden-title" className="text-2xl font-semibold">
          {labels.forbiddenTitle}
        </h1>
        <p>{labels.forbiddenBody}</p>
      </section>
    </main>
  );
}

function StateNotice({ state, labels }: { state: TenantMigrationHistoryProps['state']; labels: Labels }) {
  if (state === 'loading') return <section role="status" aria-live="polite" className="rounded-xl border border-slate-200 bg-white p-6">{labels.loading}</section>;
  if (state === 'error') return <section role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-900">{labels.error}</section>;
  if (state === 'empty') return <section role="status" className="rounded-xl border border-slate-200 bg-white p-6">{labels.empty}</section>;
  return null;
}

function StatusBadge({ status }: { status: TenantMigrationStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ring-1 ${statusTone(status)}`} data-status={status}>
      {status}
    </span>
  );
}

function SnapshotDialog({ row, labels }: { row: TenantMigrationRow; labels: Labels }) {
  const titleId = `tenant-migration-snapshot-${row.id}`;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      data-testid={`snapshot-dialog-${row.id}`}
    >
      <h2 id={titleId} className="text-lg font-semibold">
        {labels.snapshotTitle}: {row.id}
      </h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <details role="region" aria-label={labels.beforeSnapshot} data-collapsible="true" open className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <summary className="cursor-pointer text-sm font-semibold">{labels.beforeSnapshot}</summary>
          <pre className="mt-2 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-50">
            <code data-testid="snapshot-json-before">{prettyJson(row.snapshotBefore)}</code>
          </pre>
        </details>
        <details role="region" aria-label={labels.afterSnapshot} data-collapsible="true" open className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <summary className="cursor-pointer text-sm font-semibold">{labels.afterSnapshot}</summary>
          <pre className="mt-2 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-50">
            <code data-testid="snapshot-json-after">{prettyJson(row.snapshotAfter)}</code>
          </pre>
        </details>
      </div>
    </div>
  );
}

function MigrationTable({ rows, labels }: { rows: TenantMigrationRow[]; labels: Labels }) {
  if (rows.length === 0) {
    return <section role="status" className="rounded-xl border border-slate-200 bg-white p-6">{labels.empty}</section>;
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm" data-region="tenant-migration-history-list">
      <div className="overflow-x-auto">
        <table aria-label={labels.historyTableLabel} className="w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-3">{labels.startedAt}</th>
              <th scope="col" className="px-4 py-3">{labels.status}</th>
              <th scope="col" className="px-4 py-3">{labels.type}</th>
              <th scope="col" className="px-4 py-3">{labels.initiatedByUser}</th>
              <th scope="col" className="px-4 py-3">{labels.actions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id} className="align-top hover:bg-slate-50" data-testid="tenant-migration-row">
                <td className="px-4 py-3 font-mono text-xs text-slate-700">{row.startedAt}</td>
                <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                <td className="px-4 py-3 font-mono text-xs text-slate-700">{toType(row)}</td>
                <td className="px-4 py-3 text-slate-900">{row.initiatedByUser}</td>
                <td className="px-4 py-3">
                  <span className="sr-only">{row.id}</span>
                  <details className="settings-tenant-migration-history__snapshot-details">
                    <summary role="button" className="btn btn-ghost btn-sm inline-flex cursor-pointer rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">
                      {labels.viewSnapshot}<span className="sr-only"> for {row.id}</span>
                    </summary>
                    <SnapshotDialog row={row} labels={labels} />
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function TenantMigrationHistoryPage(propsInput: unknown) {
  const props = (propsInput ?? {}) as TenantMigrationHistoryProps;
  const { locale = 'en' } = props.params ? await props.params : { locale: 'en' };
  const query = props.searchParams ? await props.searchParams : {};
  const selectedStatus = normalizeStatus(one(query.status));
  const selectedDateRange = normalizeDateRange(one(query.date_range));
  const labels = await buildLabels(locale);
  let state = props.state ?? 'ready';
  let rows = props.migrations;

  if (props.callerAccess && !callerCanReadAudit(props.callerAccess)) {
    return <Forbidden labels={labels} />;
  }

  if (!props.callerAccess && !rows && state === 'ready') {
    const result = await readTenantMigrations(labels);
    state = result.state ?? 'ready';
    rows = result.rows;
  }

  if (state === 'forbidden') {
    return <Forbidden labels={labels} />;
  }

  const allRows = rows ?? [];
  const nowIso = props.now ?? new Date().toISOString();
  const filteredRows = state === 'ready' ? filterRows(allRows, selectedStatus, selectedDateRange, nowIso) : [];

  return (
    <main
      data-testid="settings-tenant-migration-history-screen"
      data-route="/settings/tenant/migrations"
      data-screen="tenant-migration-history"
      data-ux-source="SET-064"
      aria-labelledby="settings-tenant-migration-history-title"
      className="settings-page settings-tenant-migration-history space-y-4"
    >
      <header data-region="page-head" className="settings-page__head flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 id="settings-tenant-migration-history-title" className="text-2xl font-semibold text-slate-950">{labels.title}</h1>
          <p className="text-sm text-slate-600">{labels.subtitle}</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" disabled aria-disabled="true">
          {labels.exportDisabled}
        </button>
      </header>

      <div className="alert alert-blue rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900" role="note">
        {labels.orgNotice}
      </div>

      <section aria-label="Migration filters" data-region="tenant-migration-filters" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <form className="flex flex-wrap items-end gap-3" action={`/${locale}/settings/tenant/migrations`}>
          <label className="grid gap-1 text-sm font-medium text-slate-700" htmlFor="tenant-migration-status-filter">
            {labels.statusFilter}
            <select id="tenant-migration-status-filter" name="status" aria-label={labels.statusFilter} defaultValue={selectedStatus} className="select__trigger min-w-44 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700" htmlFor="tenant-migration-date-range-filter">
            {labels.dateRangeFilter}
            <select id="tenant-migration-date-range-filter" name="date_range" aria-label={labels.dateRangeFilter} defaultValue={selectedDateRange} className="select__trigger min-w-44 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
              {DATE_RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn-secondary btn-sm rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold">Apply filters</button>
          <span className="text-xs text-slate-500" aria-live="polite">{filteredRows.length} of {allRows.length} {labels.rowCount}</span>
        </form>
      </section>

      <div className="text-xs text-slate-500" data-testid="tenant-migration-history-provenance">{labels.provenance}</div>

      <StateNotice state={state} labels={labels} />

      {state === 'ready' ? <MigrationTable rows={filteredRows} labels={labels} /> : null}
    </main>
  );
}
