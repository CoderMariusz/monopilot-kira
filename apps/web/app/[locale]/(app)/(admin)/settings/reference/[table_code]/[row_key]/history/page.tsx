import React from 'react';
import { getTranslations } from 'next-intl/server';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { withOrgContext } from '../../../../../../../../../lib/auth/with-org-context';

export const dynamic = 'force-dynamic';

const AUDIT_READ_PERMISSION = 'settings.audit.read';

type ReferenceAuditAction = 'insert' | 'update' | 'delete' | string;

type ReferenceAuditEntry = {
  id: string;
  tableCode: string;
  rowKey: string;
  createdAt: string;
  actorName: string;
  actorEmail?: string;
  action: ReferenceAuditAction;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
};

type CallerAccess = {
  permissions: string[];
  roleCodes: string[];
};

type PageParams = { locale: string; table_code: string; row_key: string };
type PageSearchParams = Record<string, string | string[] | undefined>;

type ReferenceHistoryPageProps = {
  params?: Promise<PageParams>;
  searchParams?: Promise<PageSearchParams>;
  entries?: ReferenceAuditEntry[];
  callerAccess?: CallerAccess;
  currentSnapshot?: Record<string, unknown> | null;
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'forbidden';
};

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = { query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>> };
type PermissionCheckRow = { ok: boolean };
type AuditDbRow = {
  id: string;
  occurred_at: string | Date;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
};

type Labels = { -readonly [K in keyof typeof DEFAULT_LABELS]: string };

const DEFAULT_LABELS = {
  title: 'Reference audit trail',
  subtitle: 'Per-row audit history with side-by-side diffs between consecutive versions.',
  forbiddenTitle: '403 — Forbidden',
  forbiddenMessage: 'You do not have permission to read Settings audit history.',
  currentRowTitle: 'Current reference row',
  active: 'Active',
  inactive: 'Inactive',
  currentSnapshotJson: 'Current snapshot JSON',
  historyTable: 'Reference audit trail row history',
  createdAt: 'Created at',
  actor: 'Actor',
  action: 'Action',
  changes: 'Changes',
  viewDiff: 'View diff',
  field: 'Field',
  oldValue: 'Old value',
  newValue: 'New value',
  loading: 'Loading reference audit trail…',
  empty: 'No audit history exists for this reference row.',
  error: 'Unable to load reference audit trail.',
  provenance: 'Data source: live audit_log rows scoped by withOrgContext; test props may inject deterministic rows for RTL.',
  systemActor: 'System',
} as const;

function callerCanReadAudit(callerAccess: CallerAccess | undefined) {
  return callerAccess?.permissions.includes(AUDIT_READ_PERMISSION) === true;
}

function toIso(value: string | Date | null | undefined) {
  if (!value) return new Date(0).toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function prettyValue(value: unknown) {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function prettyJson(value: unknown) {
  return JSON.stringify(value ?? null, null, 2);
}

function valuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function changeKind(oldValue: unknown, newValue: unknown): 'added' | 'removed' | 'changed' {
  if (oldValue === undefined && newValue !== undefined) return 'added';
  if (oldValue !== undefined && newValue === undefined) return 'removed';
  return 'changed';
}

function diffFields(oldValue: Record<string, unknown> | null, newValue: Record<string, unknown> | null) {
  const oldRecord = oldValue ?? {};
  const newRecord = newValue ?? {};
  return Array.from(new Set([...Object.keys(oldRecord), ...Object.keys(newRecord)]))
    .filter((key) => !valuesEqual(oldRecord[key], newRecord[key]))
    .sort()
    .map((key) => ({ key, oldValue: oldRecord[key], newValue: newRecord[key], kind: changeKind(oldRecord[key], newRecord[key]) }));
}

function actionVariant(action: ReferenceAuditAction) {
  if (action === 'insert') return 'success';
  if (action === 'delete') return 'danger';
  return 'warning';
}

function sortAndScopeRows(rows: ReferenceAuditEntry[], tableCode: string, rowKey: string) {
  return rows
    .filter((row) => row.tableCode === tableCode && row.rowKey === rowKey)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function mapDbRow(row: AuditDbRow, tableCode: string, rowKey: string, labels: Labels): ReferenceAuditEntry {
  return {
    id: row.id,
    tableCode,
    rowKey,
    createdAt: toIso(row.occurred_at),
    actorName: row.actor_name ?? row.actor_email ?? labels.systemActor,
    actorEmail: row.actor_email ?? undefined,
    action: row.action,
    oldValue: row.before_state,
    newValue: row.after_state,
  };
}

async function buildLabels(locale: string): Promise<Labels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.reference_history' });
    const labels: Labels = { ...DEFAULT_LABELS };
    for (const key of Object.keys(DEFAULT_LABELS) as Array<keyof Labels>) {
      try {
        const translated = t(key);
        labels[key] = translated && translated !== key ? translated : DEFAULT_LABELS[key];
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

async function readReferenceHistory(tableCode: string, rowKey: string, labels: Labels) {
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as QueryClient;
      const canReadAudit = await hasAuditReadPermission(queryClient, userId, orgId);
      if (!canReadAudit) return { state: 'forbidden' as const, rows: [], snapshot: null };

      const result = await queryClient.query<AuditDbRow>(
        `select al.id::text as id,
                al.occurred_at,
                coalesce(u.name, u.email, initcap(al.actor_type)) as actor_name,
                u.email as actor_email,
                al.action,
                al.before_state,
                al.after_state
           from public.audit_log al
           left join public.users u on u.id = al.actor_user_id and u.org_id = app.current_org_id()
          where al.org_id = app.current_org_id()
            and al.resource_type = 'reference_tables'
            and (
              al.resource_id = $1
              or al.resource_id = $2
              or (al.after_state ->> 'table_code' = $3 and al.after_state ->> 'row_key' = $4)
              or (al.before_state ->> 'table_code' = $3 and al.before_state ->> 'row_key' = $4)
            )
          order by al.occurred_at desc, al.id desc
          limit 100`,
        [`${tableCode}:${rowKey}`, rowKey, tableCode, rowKey],
      );
      const rows = result.rows.map((row) => mapDbRow(row, tableCode, rowKey, labels));
      return { state: rows.length ? 'ready' as const : 'empty' as const, rows, snapshot: rows[0]?.newValue ?? null };
    });
  } catch {
    return { state: 'error' as const, rows: [], snapshot: null };
  }
}

function Forbidden({ labels }: { labels: Labels }) {
  return (
    <main className="settings-page settings-reference-history space-y-4" aria-labelledby="settings-reference-history-forbidden-title">
      <section role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-900">
        <h1 id="settings-reference-history-forbidden-title" className="text-2xl font-semibold">{labels.forbiddenTitle}</h1>
        <p>{labels.forbiddenMessage}</p>
      </section>
    </main>
  );
}

function StateNotice({ state, labels }: { state: ReferenceHistoryPageProps['state']; labels: Labels }) {
  if (state === 'loading') return <section role="status" aria-live="polite" className="rounded-xl border border-slate-200 bg-white p-6">{labels.loading}</section>;
  if (state === 'error') return <section role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-900">{labels.error}</section>;
  if (state === 'empty') return <section role="status" className="rounded-xl border border-slate-200 bg-white p-6">{labels.empty}</section>;
  return null;
}

function HeaderStrip({ tableCode, rowKey, snapshot, labels }: { tableCode: string; rowKey: string; snapshot: Record<string, unknown> | null; labels: Labels }) {
  const snapshotId = 'settings-reference-current-snapshot-json';
  const snapshotJson = prettyJson(snapshot);
  return (
    <>
      <Card role="region" aria-label={`${labels.currentRowTitle} header strip`} className="rounded-xl border border-slate-200 bg-white">
        <CardHeader className="flex flex-row items-start justify-between gap-4 p-4">
          <div>
            <CardTitle className="text-base font-semibold">{labels.currentRowTitle}</CardTitle>
            <CardDescription className="mt-1 font-mono text-xs text-slate-500">{tableCode} · {rowKey}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="success">{labels.active}</Badge>
            <Button
              type="button"
              className="btn btn-secondary btn-sm"
              aria-controls={snapshotId}
              aria-expanded="false"
              data-snapshot-json={snapshotJson}
              onClick={(event) => {
                const button = event.currentTarget;
                const expanded = button.getAttribute('aria-expanded') === 'true';
                button.setAttribute('aria-expanded', expanded ? 'false' : 'true');
                const panel = document.getElementById(snapshotId);
                panel?.toggleAttribute('hidden', expanded);
                const pre = panel?.querySelector('pre');
                if (pre) pre.textContent = expanded ? '' : button.getAttribute('data-snapshot-json') ?? 'null';
              }}
            >
              {labels.currentSnapshotJson}
            </Button>
          </div>
        </CardHeader>
      </Card>
      <section id={snapshotId} role="region" aria-label={labels.currentSnapshotJson} hidden className="rounded-lg bg-slate-950 p-4 text-slate-50">
        <pre className="mono overflow-auto text-xs leading-6" />
      </section>
    </>
  );
}

function DiffPanel({ entry, labels }: { entry: ReferenceAuditEntry; labels: Labels }) {
  const fields = diffFields(entry.oldValue, entry.newValue);
  return (
    <section
      id={`diff-panel-${entry.id}`}
      role="region"
      aria-label={`Field diff ${entry.id}`}
      hidden
      className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h2 className="mb-3 text-sm font-semibold">Field diff</h2>
      <Table aria-label={`Diff table ${entry.id}`} className="w-full text-sm">
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{labels.field}</TableHead>
            <TableHead scope="col">{labels.oldValue}</TableHead>
            <TableHead scope="col">{labels.newValue}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fields.map((field) => (
            <TableRow key={field.key} data-change-kind={field.kind}>
              <TableCell className="font-mono text-xs">{field.key}</TableCell>
              <TableCell data-testid={`diff-${field.key}-old`} data-change-kind={field.kind} className="font-mono text-xs">{prettyValue(field.oldValue)}</TableCell>
              <TableCell data-testid={`diff-${field.key}-new`} data-change-kind={field.kind} className="font-mono text-xs">{prettyValue(field.newValue)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

function HistoryTable({ rows, labels }: { rows: ReferenceAuditEntry[]; labels: Labels }) {
  return (
    <>
      <Card className="rounded-xl border border-slate-200 bg-white">
        <CardContent className="p-0">
          <Table aria-label={labels.historyTable} className="w-full text-sm">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{labels.createdAt}</TableHead>
                <TableHead scope="col">{labels.actor}</TableHead>
                <TableHead scope="col">{labels.action}</TableHead>
                <TableHead scope="col">{labels.changes}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const hasDiff = diffFields(row.oldValue, row.newValue).length > 0;
                return (
                  <TableRow key={row.id} data-audit-id={row.id}>
                    <TableCell className="font-mono text-xs text-slate-600">{toIso(row.createdAt)}</TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">{row.actorName}</div>
                      {row.actorEmail ? <div className="text-xs text-slate-500">{row.actorEmail}</div> : null}
                    </TableCell>
                    <TableCell><Badge variant={actionVariant(row.action)}>{row.action}</Badge></TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        aria-controls={`diff-panel-${row.id}`}
                        aria-expanded="false"
                        disabled={!hasDiff}
                        onClick={(event) => {
                          const button = event.currentTarget;
                          const expanded = button.getAttribute('aria-expanded') === 'true';
                          button.setAttribute('aria-expanded', expanded ? 'false' : 'true');
                          document.getElementById(`diff-panel-${row.id}`)?.toggleAttribute('hidden', expanded);
                        }}
                      >
                        {labels.viewDiff}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {rows.slice(0, 1).map((row) => <DiffPanel key={`diff-${row.id}`} entry={row} labels={labels} />)}
    </>
  );
}

export default async function ReferenceHistoryPage({ params, entries, callerAccess, currentSnapshot, state }: ReferenceHistoryPageProps) {
  const resolvedParams = await (params ?? Promise.resolve({ locale: 'en', table_code: '', row_key: '' }));
  const labels = await buildLabels(resolvedParams.locale ?? 'en');
  const tableCode = resolvedParams.table_code;
  const rowKey = resolvedParams.row_key;

  if (callerAccess && !callerCanReadAudit(callerAccess)) return <Forbidden labels={labels} />;

  const loaded = entries
    ? { state: state ?? 'ready' as const, rows: sortAndScopeRows(entries, tableCode, rowKey), snapshot: currentSnapshot ?? null }
    : await readReferenceHistory(tableCode, rowKey, labels);

  if (loaded.state === 'forbidden') return <Forbidden labels={labels} />;

  const rows = loaded.rows;
  const snapshot = currentSnapshot ?? loaded.snapshot ?? rows[0]?.newValue ?? null;
  const renderState = state ?? loaded.state;

  return (
    <main
      data-testid="settings-reference-history-screen"
      data-screen="settings-reference-history"
      data-table-code={tableCode}
      data-row-key={rowKey}
      className="settings-page settings-reference-history space-y-4 p-6"
      aria-labelledby="settings-reference-history-title"
    >
      <header data-region="page-head" className="flex flex-col gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Settings · Reference data · Audit trail</div>
        <h1 id="settings-reference-history-title" className="text-2xl font-semibold text-slate-950">{labels.title}</h1>
        <p className="max-w-3xl text-sm text-slate-600">{labels.subtitle}</p>
      </header>

      <HeaderStrip tableCode={tableCode} rowKey={rowKey} snapshot={snapshot} labels={labels} />
      <StateNotice state={renderState} labels={labels} />
      {renderState === 'ready' ? <HistoryTable rows={rows} labels={labels} /> : null}
      <p className="text-xs text-slate-500">{labels.provenance}</p>
    </main>
  );
}
