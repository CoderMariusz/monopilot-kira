import React from 'react';
import { getTranslations } from 'next-intl/server';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@monopilot/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

export const dynamic = 'force-dynamic';

type OperationAuditAction = 'create' | 'update' | 'delete';

type OperationAuditChange = {
  field: string;
  oldValue: unknown;
  newValue: unknown;
};

type OperationAuditEntry = {
  id: string;
  operationId: string;
  occurredAt: string;
  userName: string;
  userEmail?: string;
  action: OperationAuditAction;
  changes: OperationAuditChange[];
};

type CallerAccess = {
  permissions: string[];
  roleCodes?: string[];
};

type OperationHistoryQueryInput = {
  operationId: string;
  datePreset: 'all' | '7d' | '30d' | 'custom';
  from?: string;
  to?: string;
};

type PageProps = {
  params?: Promise<{ locale: string; operation_id: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
  entries?: OperationAuditEntry[];
  callerAccess?: CallerAccess;
  now?: string;
  queryOperationHistory?: (input: OperationHistoryQueryInput) => Promise<OperationAuditEntry[]>;
};

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgContext = { userId: string; orgId: string; client: QueryClient };
type WithOrgContext = <T>(action: (ctx: OrgContext) => Promise<T>) => Promise<T>;

type AuditLogRow = {
  id: string;
  occurred_at: string | Date;
  action: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  actor_email: string | null;
  actor_name: string | null;
};

type Labels = { -readonly [K in keyof typeof DEFAULT_LABELS]: string };

const DEFAULT_LABELS = {
  title: 'Manufacturing Operation History',
  breadcrumbSettings: 'Settings',
  breadcrumbOperations: 'Manufacturing operations',
  breadcrumbHistory: 'History',
  subtitle: 'Per-operation audit trail. Showing every create / update / delete event.',
  forbiddenTitle: '403 — Access denied',
  forbiddenMessage: 'You do not have permission to view manufacturing operation history.',
  searchLabel: 'Search by operation name',
  searchPlaceholder: 'Search by operation name…',
  userLabel: 'Audit user',
  allUsers: 'All users',
  date: 'Date',
  from: 'From',
  to: 'To',
  lastSevenDays: 'Last 7 days',
  reset: 'Reset',
  entriesCount: '{count} of {total} entries',
  tableLabel: 'Manufacturing operation audit history',
  auditLogEntries: 'Audit log entries',
  timestamp: 'Timestamp',
  user: 'User',
  action: 'Action',
  fieldDiff: 'Field diff',
  changedFields: 'Field diff',
  ipColumn: 'IP',
  ipUnavailable: '—',
  empty: 'No entries match the current filters.',
  error: 'Unable to load manufacturing operation audit history.',
  back: '← Back',
  viewDiff: 'View diff for {action} audit entry',
  fieldDiffForAction: 'Field diff for {action} audit entry',
  fieldDiffTitle: 'Field diff (old → new)',
  oldValue: 'Old value',
  newValue: 'New value',
  noChangedFields: 'No changed fields',
} as const;

class ForbiddenError extends Error {}

const REQUIRED_PERMISSIONS = ['manufacturing_operations.view', 'settings.audit.read'] as const;
const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof Labels>;

async function buildLabels(locale: string): Promise<Labels> {
  try {
    const t = await getTranslations('settings.manufacturing_operation_history');
    void locale;
    return LABEL_KEYS.reduce((labels, key) => {
      try {
        const translated = t(key);
        labels[key] = translated && translated !== key ? translated : DEFAULT_LABELS[key];
      } catch {
        labels[key] = DEFAULT_LABELS[key];
      }
      return labels;
    }, {} as Labels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

function formatLabel(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((message, [key, value]) => message.replaceAll(`{${key}}`, String(value)), template);
}

function hasRequiredPermissions(callerAccess: CallerAccess): boolean {
  return REQUIRED_PERMISSIONS.every((permission) => callerAccess.permissions.includes(permission));
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function buildSevenDayWindow(now: string): { from: string; to: string } {
  const end = new Date(now);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7);
  return { from: toDateOnly(start), to: toDateOnly(end) };
}

function normalizeSearchParams(raw: Record<string, string | undefined>, now: string): OperationHistoryQueryInput['datePreset'] {
  const preset = raw.datePreset ?? raw.range ?? raw.date;
  if (preset === '7d' || preset === '30d' || preset === 'custom') return preset;
  return 'all';
}

function buildQueryInput(
  operationId: string,
  searchParams: Record<string, string | undefined>,
  now: string,
): OperationHistoryQueryInput {
  const datePreset = normalizeSearchParams(searchParams, now);
  if (datePreset === '7d') return { operationId, datePreset, ...buildSevenDayWindow(now) };
  if (datePreset === '30d') {
    const end = new Date(now);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 30);
    return { operationId, datePreset, from: toDateOnly(start), to: toDateOnly(end) };
  }
  if (datePreset === 'custom') {
    return { operationId, datePreset, from: searchParams.from, to: searchParams.to };
  }
  return { operationId, datePreset: 'all' };
}

function sortTimestampDesc(entries: OperationAuditEntry[]): OperationAuditEntry[] {
  return [...entries].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

function stringifyDiffValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'bigint') return String(value);
  return JSON.stringify(value);
}

function actionFromAuditAction(action: string): OperationAuditAction {
  const normalized = action.toLowerCase();
  if (normalized.includes('delete') || normalized.includes('deactivate')) return 'delete';
  if (normalized.includes('create')) return 'create';
  return 'update';
}

function buildChanges(beforeState: Record<string, unknown> | null, afterState: Record<string, unknown> | null): OperationAuditChange[] {
  const before = beforeState ?? {};
  const after = afterState ?? {};
  const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
  return Array.from(fields)
    .filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))
    .map((field) => ({ field, oldValue: before[field] ?? null, newValue: after[field] ?? null }));
}

async function runWithOrgContext<T>(action: (ctx: OrgContext) => Promise<T>): Promise<T> {
  try {
    const packagePath = '@monopilot/db/with-org-context';
    const mod = (await import(packagePath)) as { withOrgContext?: WithOrgContext };
    if (typeof mod.withOrgContext === 'function') return mod.withOrgContext(action);
  } catch {
    // Fall back to the app wrapper when the package subpath is unavailable in this runtime.
  }
  const webWrapperPath = '../../../../../../../../lib/auth/with-org-context.js';
  const mod = (await import(webWrapperPath)) as unknown as { withOrgContext: WithOrgContext };
  return mod.withOrgContext(action);
}

async function hasPermission(ctx: OrgContext, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}

async function queryAuditLog(input: OperationHistoryQueryInput): Promise<OperationAuditEntry[]> {
  return runWithOrgContext(async (ctx) => {
    const canViewOperations = await hasPermission(ctx, 'manufacturing_operations.view');
    const canReadAudit = await hasPermission(ctx, 'settings.audit.read');
    if (!canViewOperations || !canReadAudit) throw new ForbiddenError('forbidden');

    const from = input.from ? `${input.from}T00:00:00.000Z` : null;
    const to = input.to ? `${input.to}T23:59:59.999Z` : null;
    const { rows } = await ctx.client.query<AuditLogRow>(
      `select audit_log.id::text,
              audit_log.occurred_at,
              audit_log.action,
              audit_log.before_state,
              audit_log.after_state,
              users.email as actor_email,
              users.display_name as actor_name
         from public.audit_log audit_log
         left join public.users users on users.id = audit_log.actor_user_id and users.org_id = audit_log.org_id
        where audit_log.org_id = app.current_org_id()
          and audit_log.resource_type in ('manufacturing_operation', 'manufacturing_operations')
          and audit_log.resource_id = $1
          and ($2::timestamptz is null or audit_log.occurred_at >= $2::timestamptz)
          and ($3::timestamptz is null or audit_log.occurred_at <= $3::timestamptz)
        order by audit_log.occurred_at desc
        limit 200`,
      [input.operationId, from, to],
    );

    return rows.map((row) => ({
      id: row.id,
      operationId: input.operationId,
      occurredAt: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : String(row.occurred_at),
      userName: row.actor_name ?? row.actor_email ?? 'System',
      userEmail: row.actor_email ?? undefined,
      action: actionFromAuditAction(row.action),
      changes: buildChanges(row.before_state, row.after_state),
    }));
  });
}

async function resolveEntries(
  operationId: string,
  searchParams: Record<string, string | undefined>,
  props: PageProps,
): Promise<{ entries: OperationAuditEntry[]; status: 'ok' | 'forbidden' | 'error'; queryInput: OperationHistoryQueryInput }> {
  const now = props.now ?? new Date().toISOString();
  const queryInput = buildQueryInput(operationId, searchParams, now);

  if (props.entries) return { entries: props.entries, status: 'ok', queryInput };

  try {
    const loader = props.queryOperationHistory ?? queryAuditLog;
    const loaded = await loader(queryInput);
    return { entries: loaded, status: 'ok', queryInput };
  } catch (error) {
    if (error instanceof ForbiddenError) return { entries: [], status: 'forbidden', queryInput };
    return { entries: [], status: 'error', queryInput };
  }
}

function PermissionDenied({ labels }: { labels: Labels }) {
  return (
    <main aria-labelledby="operation-history-forbidden-title" style={{ padding: 24 }}>
      <Card role="alert" style={{ border: '1px solid var(--red-300, #fca5a5)', background: 'var(--red-050, #fef2f2)' }}>
        <CardHeader>
          <CardTitle id="operation-history-forbidden-title">{labels.forbiddenTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {labels.forbiddenMessage}{' '}
          <code>manufacturing_operations.view</code> / <code>settings.audit.read</code>
        </CardContent>
      </Card>
    </main>
  );
}

function Toolbar({
  count,
  total,
  labels,
  users,
}: {
  count: number;
  total: number;
  labels: Labels;
  users: string[];
}) {
  return (
    <Card style={{ marginBottom: 12 }}>
      <CardContent style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 14px' }}>
        <form method="get" style={{ alignItems: 'center', display: 'contents' }}>
          <input className="form-input" name="operation_name" aria-label={labels.searchLabel} placeholder={labels.searchPlaceholder} style={{ fontSize: 12, width: 240 }} />
          <select className="form-input" name="user" aria-label={labels.userLabel} defaultValue="all" style={{ fontSize: 12, width: 'auto' }}>
            <option value="all">{labels.allUsers}</option>
            {users.map((user) => (
              <option key={user} value={user}>{user}</option>
            ))}
          </select>
          <span style={{ color: 'var(--muted)', fontSize: 11 }}>{labels.date}</span>
          <label style={{ color: 'var(--muted)', fontSize: 11 }}>
            {labels.from}
            <input className="form-input" name="from" type="date" style={{ fontSize: 12, marginLeft: 4, width: 'auto' }} />
          </label>
          <label style={{ color: 'var(--muted)', fontSize: 11 }}>
            {labels.to}
            <input className="form-input" name="to" type="date" style={{ fontSize: 12, marginLeft: 4, width: 'auto' }} />
          </label>
          <input type="hidden" name="datePreset" value="custom" />
          <Button className="btn-primary btn-sm" type="submit">{labels.date}</Button>
        </form>
        <form method="get" style={{ display: 'inline-flex' }}>
          <Button className="btn-secondary btn-sm" type="submit" name="datePreset" value="7d" aria-label={labels.lastSevenDays}>
            {labels.lastSevenDays}
          </Button>
        </form>
        <form method="get" style={{ display: 'inline-flex' }}>
          <Button className="btn-secondary btn-sm" type="submit">{labels.reset}</Button>
        </form>
        <span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 'auto' }}>
          {formatLabel(labels.entriesCount, { count, total })}
        </span>
      </CardContent>
    </Card>
  );
}

function ActionBadge({ action }: { action: OperationAuditAction }) {
  const variant = action === 'create' ? 'success' : action === 'delete' ? 'danger' : 'info';
  return <Badge variant={variant}>{action}</Badge>;
}

function FieldDiffPanel({ entry, labels }: { entry: OperationAuditEntry; labels: Labels }) {
  return (
    <section
      data-diff-panel="true"
      aria-label={formatLabel(labels.fieldDiffForAction, { action: entry.action })}
      role="region"
      style={{ background: 'var(--gray-100, #f3f4f6)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, marginTop: 8, padding: '10px 16px' }}
    >
      <div style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 600, letterSpacing: '.06em', marginBottom: 6, textTransform: 'uppercase' }}>
        {labels.fieldDiffTitle}
      </div>
      <div style={{ background: '#fff', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8 }}>
        {entry.changes.length === 0 ? (
          <div style={{ color: 'var(--muted)', padding: '8px 10px' }}>{labels.noChangedFields}</div>
        ) : entry.changes.map((change) => (
          <div
            key={change.field}
            style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(140px, 1fr) minmax(120px, 1fr) 24px minmax(120px, 1fr)', padding: '8px 10px' }}
          >
            <strong>{change.field}</strong>
            <code aria-label={`${change.field} ${labels.oldValue}`} data-testid={`diff-${change.field}-old`}>{stringifyDiffValue(change.oldValue)}</code>
            <span aria-hidden="true">→</span>
            <code aria-label={`${change.field} ${labels.newValue}`} data-testid={`diff-${change.field}-new`}>{stringifyDiffValue(change.newValue)}</code>
          </div>
        ))}
      </div>
    </section>
  );
}

function HistoryTable({ entries, labels }: { entries: OperationAuditEntry[]; labels: Labels }) {
  return (
    <>
      <style>{`details:not([open]) [data-diff-panel="true"] { display: none; } details[open] summary span { transform: rotate(90deg); }`}</style>
      <Table aria-label={labels.tableLabel} style={{ width: '100%' }}>
      <TableHeader>
        <TableRow>
          <TableHead style={{ width: 48 }} />
          <TableHead>{labels.timestamp}</TableHead>
          <TableHead>{labels.user}</TableHead>
          <TableHead>{labels.action}</TableHead>
          <TableHead>{labels.changedFields}</TableHead>
          <TableHead>{labels.ipColumn}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id} data-audit-id={entry.id}>
            <TableCell>
              <details>
                <summary role="button" aria-label={formatLabel(labels.viewDiff, { action: entry.action })} style={{ cursor: 'pointer', listStyle: 'none' }}>
                  <span aria-hidden="true" style={{ color: 'var(--muted)', display: 'inline-block' }}>▸</span>
                </summary>
                <FieldDiffPanel entry={entry} labels={labels} />
              </details>
            </TableCell>
            <TableCell style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}>{entry.occurredAt}</TableCell>
            <TableCell style={{ fontSize: 12 }}>
              <div style={{ fontWeight: 500 }}>{entry.userName}</div>
              {entry.userEmail ? <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)', fontSize: 10 }}>{entry.userEmail}</div> : null}
            </TableCell>
            <TableCell>
              <ActionBadge action={entry.action} />
            </TableCell>
            <TableCell>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {entry.changes.slice(0, 4).map((change) => (
                  <Badge key={change.field} variant="muted" style={{ fontSize: 9 }}>
                    {change.field}
                  </Badge>
                ))}
                {entry.changes.length > 4 ? (
                  <Badge variant="muted" style={{ fontSize: 9 }}>+{entry.changes.length - 4}</Badge>
                ) : null}
              </div>
            </TableCell>
            <TableCell style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}>
              {labels.ipUnavailable}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      </Table>
    </>
  );
}

export default async function ManufacturingOperationHistoryPage(props: PageProps) {
  const params = await props.params;
  const searchParams = (await props.searchParams) ?? {};
  const operationId = params?.operation_id ?? 'unknown-operation';
  const locale = params?.locale ?? 'en';
  const labels = await buildLabels(locale);

  if (props.callerAccess && !hasRequiredPermissions(props.callerAccess)) return <PermissionDenied labels={labels} />;

  const resolved = await resolveEntries(operationId, searchParams, props);
  if (resolved.status === 'forbidden') return <PermissionDenied labels={labels} />;

  const userFilter = searchParams.user ?? 'all';
  const operationNameSearch = (searchParams.operation_name ?? '').trim().toLowerCase();
  const sortedEntries = sortTimestampDesc(resolved.entries)
    .filter((entry) => entry.operationId === operationId)
    .filter((entry) => userFilter === 'all' || entry.userName === userFilter || entry.userEmail === userFilter)
    .filter((entry) => !operationNameSearch || operationId.toLowerCase().includes(operationNameSearch));
  const users = Array.from(new Set(resolved.entries.filter((entry) => entry.operationId === operationId).map((entry) => entry.userName))).sort();

  return (
    <main data-testid="manufacturing-operation-history-screen" data-operation-id={operationId} style={{ padding: 24 }}>
      <div style={{ alignItems: 'flex-start', display: 'flex', gap: 12, justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>
            {labels.breadcrumbSettings} / {labels.breadcrumbOperations} / {labels.breadcrumbHistory}: {operationId}
          </div>
          <h1 style={{ margin: '4px 0' }}>{labels.title}</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
            {labels.subtitle}
            <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, marginLeft: 8 }}>{operationId}</span>
          </p>
        </div>
        <Button type="button">{labels.back}</Button>
      </div>

      <Toolbar count={sortedEntries.length} total={resolved.entries.length} labels={labels} users={users} />

      <Card>
        <CardHeader>
          <CardTitle>{labels.auditLogEntries}</CardTitle>
        </CardHeader>
        <CardContent>
          {resolved.status === 'error' ? (
            <div role="alert">{labels.error}</div>
          ) : sortedEntries.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 13, padding: 24, textAlign: 'center' }}>{labels.empty}</div>
          ) : (
            <HistoryTable entries={sortedEntries} labels={labels} />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
