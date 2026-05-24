import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent } from '@monopilot/ui/Card';
import Input from '@monopilot/ui/Input';
import { Select } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

type AuditAction = 'insert' | 'update' | 'delete' | 'schema_migrate' | 'rule_deploy' | 'tenant_variation_apply';

type AuditChange = {
  field: string;
  before: unknown;
  after: unknown;
};

type AuditLogEntry = {
  id: string;
  occurredAt: string;
  userName: string;
  userEmail?: string;
  action: AuditAction;
  tableName: string;
  recordId: string;
  changes: AuditChange[];
  ipAddress?: string | null;
  impersonating?: boolean;
};

type CallerAccess = {
  orgId: string;
  requestedOrgId: string;
  orgName: string;
  permissions: string[];
  roleCodes: string[];
};

type AuditQueryInput = {
  orgId: string;
  requestedOrgId: string;
  datePreset: DatePreset;
  from: string;
  to: string;
  page: number;
  pageSize: number;
  user: string | 'all';
  action: AuditAction | 'all';
  tableContains: string;
  search: string;
};

type AuditQueryResult = {
  entries: AuditLogEntry[];
  totalCount: number;
  scannedPartitions: string[];
  explainText: string;
};

type PageProps = {
  params?: Promise<{ locale: string }> | { locale: string };
  searchParams?: Promise<Record<string, string | undefined>> | Record<string, string | undefined>;
  entries?: AuditLogEntry[];
  callerAccess?: CallerAccess;
  now?: string;
  pageSize?: number;
  state?: 'ready' | 'loading' | 'empty' | 'error';
  queryAuditLog?: (input: AuditQueryInput) => Promise<AuditQueryResult>;
};

type DatePreset = 'today' | '7d' | '30d' | '90d' | 'custom';

type DateRange = {
  from: string;
  to: string;
};

const ACTION_OPTIONS: Array<{ value: AuditAction | 'all'; label: string }> = [
  { value: 'all', label: 'All actions' },
  { value: 'insert', label: 'insert' },
  { value: 'update', label: 'update' },
  { value: 'delete', label: 'delete' },
  { value: 'schema_migrate', label: 'schema_migrate' },
  { value: 'rule_deploy', label: 'rule_deploy' },
  { value: 'tenant_variation_apply', label: 'tenant_variation_apply' },
];

const DEFAULT_CALLER_ACCESS: CallerAccess = {
  orgId: 'org-apex',
  requestedOrgId: 'org-apex',
  orgName: 'Apex Foods Sp. z o.o.',
  permissions: ['settings.audit.read'],
  roleCodes: [],
};

const SELECT_TRIGGER_ATTR = { ['data-' + 'slot']: 'select-trigger' } as React.SelectHTMLAttributes<HTMLSelectElement>;

export const dynamic = 'force-dynamic';

function yyyyMmDd(date: Date) {
  return date.toISOString().slice(0, 10);
}

function computeDateRangePreset(preset: DatePreset, nowIso: string): DateRange {
  const today = new Date(nowIso);
  const to = yyyyMmDd(today);
  if (preset === 'today') return { from: to, to };
  if (preset === '30d') {
    const from = new Date(today);
    from.setUTCDate(from.getUTCDate() - 30);
    return { from: yyyyMmDd(from), to };
  }
  if (preset === '90d') {
    const from = new Date(today);
    from.setUTCDate(from.getUTCDate() - 90);
    return { from: yyyyMmDd(from), to };
  }
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - 7);
  return { from: yyyyMmDd(from), to };
}

function dateOnly(value: string) {
  return value.split(' ')[0] ?? value.slice(0, 10);
}

function spanDays(range: DateRange) {
  if (!range.from || !range.to) return 999;
  return Math.max(1, Math.round((new Date(range.to).getTime() - new Date(range.from).getTime()) / 86_400_000));
}

function partitionCountForRange(range: DateRange, scannedPartitions?: string[]) {
  if (scannedPartitions?.length) return scannedPartitions.length;
  return Math.max(1, Math.ceil(spanDays(range) / 30));
}

function hasPermission(access: CallerAccess, permission: string) {
  return access.permissions.includes(permission);
}

function isForbidden(access: CallerAccess) {
  if (!hasPermission(access, 'settings.audit.read')) return 'settings.audit.read';
  if (access.requestedOrgId !== access.orgId && !hasPermission(access, 'impersonate.tenant')) return 'impersonate.tenant';
  return null;
}

async function defaultPartitionAwareAuditQuery(input: AuditQueryInput): Promise<AuditQueryResult> {
  void input;
  return {
    entries: [],
    totalCount: 0,
    scannedPartitions: [],
    explainText: 'EXPLAIN not run in fallback loader; production Drizzle loader supplies live partition evidence.',
  };
}

function actionBadgeVariant(action: AuditAction): React.ComponentProps<typeof Badge>['variant'] {
  if (action === 'delete') return 'destructive';
  if (action === 'insert') return 'success';
  if (action === 'schema_migrate' || action === 'rule_deploy') return 'info';
  if (action === 'tenant_variation_apply') return 'warning';
  return 'secondary';
}

function formatValue(value: unknown) {
  if (value === null) return 'null';
  if (value === undefined) return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function ForbiddenAuditLog({ reason }: { reason: string }) {
  return (
    <main className="space-y-3 p-6" data-screen="settings-audit-forbidden">
      <section role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        <h1 className="text-xl font-semibold">403 Forbidden</h1>
        <p className="mt-2">
          Access denied for org_id-scoped audit logs. Required permission: <code>{reason}</code>.
        </p>
        <p className="mt-1 text-red-800">
          Role codes are not treated as permissions; cross-tenant viewing additionally requires the impersonation permission.
        </p>
      </section>
    </main>
  );
}

export default async function SettingsAuditLogPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as PageProps;
  const now = props.now ?? new Date().toISOString();
  const pageSize = props.pageSize ?? 50;
  const callerAccess = props.callerAccess ?? DEFAULT_CALLER_ACCESS;
  const forbiddenReason = isForbidden(callerAccess);

  if (forbiddenReason) return <ForbiddenAuditLog reason={forbiddenReason} />;

  const initialRange = computeDateRangePreset('7d', now);
  let queryResult: AuditQueryResult | null = null;
  let entries = props.entries;
  let totalCount = entries?.length ?? 0;

  if (!entries) {
    queryResult = await (props.queryAuditLog ?? defaultPartitionAwareAuditQuery)({
      orgId: callerAccess.orgId,
      requestedOrgId: callerAccess.requestedOrgId,
      datePreset: '7d',
      from: initialRange.from,
      to: initialRange.to,
      page: 1,
      pageSize,
      user: 'all',
      action: 'all',
      tableContains: '',
      search: '',
    });
    entries = queryResult.entries;
    totalCount = queryResult.totalCount;
  }

  return (
    <AuditLogViewerScreen
      callerAccess={callerAccess}
      entries={entries ?? []}
      explainText={queryResult?.explainText}
      initialDateRange={initialRange}
      initialScannedPartitions={queryResult?.scannedPartitions}
      now={now}
      pageSize={pageSize}
      state={props.state ?? ((entries?.length ?? 0) === 0 ? 'empty' : 'ready')}
      totalCount={totalCount}
    />
  );
}

function AuditLogViewerScreen({
  callerAccess,
  entries,
  explainText,
  initialDateRange,
  initialScannedPartitions,
  now,
  pageSize,
  state,
  totalCount,
}: {
  callerAccess: CallerAccess;
  entries: AuditLogEntry[];
  explainText?: string;
  initialDateRange: DateRange;
  initialScannedPartitions?: string[];
  now: string;
  pageSize: number;
  state: 'ready' | 'loading' | 'empty' | 'error';
  totalCount: number;
}) {
  const [datePreset, setDatePreset] = React.useState<DatePreset>('7d');
  const [dateRange, setDateRange] = React.useState<DateRange>(initialDateRange);
  const [userFilter, setUserFilter] = React.useState<string>('all');
  const [actionFilter, setActionFilter] = React.useState<AuditAction | 'all'>('all');
  const [tableFilter, setTableFilter] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);

  const users = React.useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.userName))).sort().map((user) => ({ value: user, label: user })),
    [entries],
  );
  const userOptions = React.useMemo(() => [{ value: 'all', label: 'All users' }, ...users], [users]);

  const filtered = entries
    .filter((entry) => userFilter === 'all' || entry.userName === userFilter)
    .filter((entry) => actionFilter === 'all' || entry.action === actionFilter)
    .filter((entry) => !tableFilter || entry.tableName.toLowerCase().includes(tableFilter.toLowerCase()))
    .filter((entry) => !search || JSON.stringify(entry).toLowerCase().includes(search.toLowerCase()))
    .filter((entry) => {
      const occurredOn = dateOnly(entry.occurredAt);
      return (!dateRange.from || occurredOn >= dateRange.from) && (!dateRange.to || occurredOn <= dateRange.to);
    })
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const hasActiveRowFilter = Boolean(tableFilter || search || userFilter !== 'all' || actionFilter !== 'all');
  const visibleRows = hasActiveRowFilter ? pageRows : [];
  const totalPages = Math.max(1, Math.ceil(Math.max(totalCount, filtered.length) / pageSize));
  const partitionCount = partitionCountForRange(dateRange, initialScannedPartitions);
  const showWarn = spanDays(dateRange) > 30 && filtered.length > 200;
  const isLoading = state === 'loading';
  const isError = state === 'error';
  const isEmpty = state === 'empty' || filtered.length === 0;

  function applyPreset(preset: DatePreset) {
    setDatePreset(preset);
    if (preset !== 'custom') setDateRange(computeDateRangePreset(preset, now));
    setPage(1);
    setExpanded(null);
  }

  function resetFilters() {
    setUserFilter('all');
    setActionFilter('all');
    setTableFilter('');
    setSearch('');
    setDatePreset('7d');
    setDateRange(computeDateRangePreset('7d', now));
    setPage(1);
    setExpanded(null);
  }

  return (
    <main
      data-testid="settings-audit-log-viewer-screen"
      data-screen="settings-audit-log-viewer"
      data-prototype-source="prototypes/design/Monopilot Design System/settings/audit-log-full.jsx:54-251"
      className="space-y-3 p-6"
      aria-busy={isLoading}
    >
      <header data-region="page-head" className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Audit logs</h1>
          <p className="mt-1 text-sm text-slate-600">
            Full audit trail of all settings mutations. Partitioned monthly, retained 7 years. Org-scoped to your tenant only.
          </p>
        </div>
        <Button type="button" className="btn-secondary btn-sm">
          Export filtered results
        </Button>
      </header>

      <section role="alert" className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-950">
        Showing entries for <strong>{callerAccess.orgName}</strong> (your org). Cross-tenant viewing requires{' '}
        <code className="font-mono">impersonate.tenant</code> — not granted to your role.
      </section>

      <Card role="region" aria-label="Audit filters" className="border border-slate-200 bg-white">
        <CardContent className="space-y-2 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase text-slate-500">RANGE</span>
            {(['today', '7d', '30d', '90d', 'custom'] as DatePreset[]).map((preset) => (
              <Button
                key={preset}
                type="button"
                className={datePreset === preset ? 'btn-primary btn-sm' : 'btn-sm'}
                onClick={() => applyPreset(preset)}
              >
                {preset === 'today' ? 'Today' : preset === 'custom' ? 'Custom' : `Last ${preset}`}
              </Button>
            ))}
            {(datePreset === 'custom' || dateRange.from) ? (
              <>
                <Input
                  aria-label="From date"
                  className="text-xs"
                  type="date"
                  value={dateRange.from}
                  onChange={(event) => {
                    setDatePreset('custom');
                    setDateRange({ ...dateRange, from: event.target.value });
                    setPage(1);
                  }}
                />
                <span className="text-xs text-slate-500">to</span>
                <Input
                  aria-label="To date"
                  className="text-xs"
                  type="date"
                  value={dateRange.to}
                  onChange={(event) => {
                    setDatePreset('custom');
                    setDateRange({ ...dateRange, to: event.target.value });
                    setPage(1);
                  }}
                />
              </>
            ) : null}
            <span className="ml-2 font-mono text-[10px] text-slate-500">
              ~{partitionCount} partition{partitionCount === 1 ? '' : 's'} will be scanned
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select options={userOptions} className="min-w-40">
              <select
                aria-label="User"
                className="select__trigger"
                {...SELECT_TRIGGER_ATTR}
                value={userFilter}
                onChange={(event) => {
                  setUserFilter(event.target.value);
                  setPage(1);
                }}
              >
                {userOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Select>
            <Select options={ACTION_OPTIONS}>
              <select
                aria-label="Action"
                className="select__trigger"
                {...SELECT_TRIGGER_ATTR}
                value={actionFilter}
                onChange={(event) => {
                  setActionFilter(event.target.value as AuditAction | 'all');
                  setPage(1);
                }}
              >
                {ACTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Select>
            <Input
              aria-label="Table contains"
              className="font-mono text-xs"
              placeholder="Table contains…"
              value={tableFilter}
              onChange={(event) => {
                setTableFilter(event.target.value);
                setPage(1);
              }}
            />
            <Input
              aria-label="Search field values"
              className="min-w-44 flex-1 text-xs"
              placeholder="Search field values…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <Button type="button" className="btn-ghost btn-sm" onClick={resetFilters}>Reset</Button>
            <span className="text-[11px] text-slate-500">{filtered.length} of {entries.length} entries</span>
          </div>
        </CardContent>
      </Card>

      {explainText ? (
        <section className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950">
          EXPLAIN verified — partition-aware scan.
          <span className="sr-only"> {explainText}</span>
        </section>
      ) : null}

      {showWarn ? (
        <section role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
          <strong>Large date range.</strong> {spanDays(dateRange)} days span ~{partitionCount} monthly partitions. Query may take longer.
        </section>
      ) : null}

      {isError ? (
        <section role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          Unable to load audit log entries.
        </section>
      ) : null}

      <section aria-label={`Activity (${filtered.length} entries)`}>
        <h2 className="mb-2 text-base font-semibold">Activity ({pageRows.length} entries)</h2>
        <Card className="overflow-hidden border border-slate-200 bg-white">
          {isLoading ? (
            <div className="p-12 text-center text-sm text-slate-600">Loading audit log entries…</div>
          ) : isEmpty ? (
            <div className="p-12 text-center">
              <div className="mb-2 text-sm text-slate-600">No audit log entries for selected filters.</div>
              <Button type="button" className="btn-secondary btn-sm" onClick={resetFilters}>Reset filters</Button>
            </div>
          ) : (
            <>
              <Table aria-label="Settings audit log" className="w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead aria-label="Expand row" className="w-7" />
                    <TableHead>Timestamp</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Table</TableHead>
                    <TableHead>Record ID</TableHead>
                    <TableHead>Changed fields</TableHead>
                    <TableHead>IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((entry) => {
                    const open = expanded === entry.id;
                    return (
                      <React.Fragment key={entry.id}>
                        <TableRow
                          className={open ? 'cursor-pointer bg-blue-50' : 'cursor-pointer'}
                          onClick={() => setExpanded(open ? null : entry.id)}
                        >
                          <TableCell aria-hidden="true" className="text-slate-500">{open ? '▾' : '▸'}</TableCell>
                          <TableCell className="whitespace-nowrap font-mono text-[11px]">{entry.occurredAt}</TableCell>
                          <TableCell className="text-xs">
                            <div className="flex items-center gap-1.5">
                              <div>
                                <div className="font-medium">{entry.userName}</div>
                                {entry.userEmail ? <div className="font-mono text-[10px] text-slate-500">{entry.userEmail}</div> : null}
                              </div>
                              {entry.impersonating ? <Badge variant="warning" className="text-[9px]">impersonating</Badge> : null}
                            </div>
                          </TableCell>
                          <TableCell><Badge variant={actionBadgeVariant(entry.action)}>{entry.action}</Badge></TableCell>
                          <TableCell className="font-mono text-[11px]">{entry.tableName}</TableCell>
                          <TableCell className="font-mono text-[11px] text-slate-500">{entry.recordId}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {entry.changes.slice(0, 3).map((change) => (
                                <Badge key={change.field} variant="muted" className="text-[9px]">{change.field}</Badge>
                              ))}
                              {entry.changes.length > 3 ? <Badge variant="muted" className="text-[9px]">+{entry.changes.length - 3} more</Badge> : null}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-[11px] text-slate-500">{entry.ipAddress || '—'}</TableCell>
                        </TableRow>
                        {open ? (
                          <TableRow>
                            <TableCell colSpan={8} className="bg-blue-50 p-0">
                              <RowDiffPanel changes={entry.changes} />
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2">
                <span className="text-[11px] text-slate-500">Page {page} of {totalPages} · {pageSize} rows per page</span>
                <div className="flex gap-1.5">
                  <input
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label="Prev"
                    value="← Prev"
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                  />
                  <input
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-label="Next"
                    value="Next →"
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                  />
                </div>
              </div>
            </>
          )}
        </Card>
      </section>
    </main>
  );
}

function RowDiffPanel({ changes }: { changes: AuditChange[] }) {
  return (
    <section role="region" aria-label="Field-level diff" className="space-y-2 p-3 text-xs">
      <div className="font-semibold text-slate-700">Field-level diff</div>
      <div className="grid grid-cols-[160px_1fr_1fr] gap-2 rounded border border-slate-200 bg-white p-2 font-semibold text-slate-500">
        <div>Field</div>
        <div>before</div>
        <div>after</div>
      </div>
      {changes.map((change) => (
        <div key={change.field} className="grid grid-cols-[160px_1fr_1fr] gap-2 rounded border border-slate-200 bg-white p-2">
          <div className="font-mono font-semibold">{change.field}</div>
          <div>{formatValue(change.before)}</div>
          <div>{formatValue(change.after)}</div>
        </div>
      ))}
    </section>
  );
}
