'use client';

import React from 'react';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent } from '@monopilot/ui/Card';
import Input from '@monopilot/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

export type AuditAction = 'insert' | 'update' | 'delete' | 'schema_migrate' | 'rule_deploy' | 'tenant_variation_apply';

export type AuditChange = {
  field: string;
  before: unknown;
  after: unknown;
};

export type AuditLogEntry = {
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

export type DatePreset = 'today' | '7d' | '30d' | '90d' | 'custom';

export type DateRange = {
  from: string;
  to: string;
};

export type CallerAccess = {
  orgId: string;
  requestedOrgId: string;
  orgName: string;
  permissions: string[];
  roleCodes: string[];
};

export type AuditQueryInput = {
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

export type AuditQueryResult = {
  entries: AuditLogEntry[];
  totalCount: number;
  scannedPartitions: string[];
  explainText: string;
};

const ACTION_OPTIONS: Array<{ value: AuditAction | 'all'; label: string }> = [
  { value: 'all', label: 'all' },
  { value: 'insert', label: 'insert' },
  { value: 'update', label: 'update' },
  { value: 'delete', label: 'delete' },
  { value: 'schema_migrate', label: 'schema_migrate' },
  { value: 'rule_deploy', label: 'rule_deploy' },
  { value: 'tenant_variation_apply', label: 'tenant_variation_apply' },
];

export type AuditLabels = {
  title: string;
  summary: string;
  exportFiltered: string;
  orgNoticePrefix: string;
  orgNoticeSuffix: string;
  range: string;
  filtersRegion: string;
  presets: Record<DatePreset, string>;
  fromDate: string;
  toDate: string;
  to: string;
  partitionWillBeScanned: string;
  partitionsWillBeScanned: string;
  allUsers: string;
  allActions: string;
  user: string;
  action: string;
  tableContains: string;
  searchFieldValues: string;
  reset: string;
  entriesCount: string;
  explainVerified: string;
  largeDateRange: string;
  largeDateRangeBody: string;
  loadError: string;
  loading: string;
  activity: string;
  empty: string;
  resetFilters: string;
  tableLabel: string;
  expandRow: string;
  headers: {
    timestamp: string;
    user: string;
    action: string;
    table: string;
    recordId: string;
    changedFields: string;
    ip: string;
  };
  impersonating: string;
  more: string;
  pageStatus: string;
  prev: string;
  next: string;
  forbiddenTitle: string;
  forbiddenMessage: string;
  forbiddenRoleCodes: string;
  diffTitle: string;
  field: string;
  before: string;
  after: string;
};

function interpolate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template);
}

function formatLabel(template: string, values: Record<string, string | number>) {
  return interpolate(template, values);
}


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

export function AuditLogViewerScreen({
  callerAccess,
  entries,
  explainText,
  initialDateRange,
  initialScannedPartitions,
  labels,
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
  labels: AuditLabels;
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
  const userOptions = React.useMemo(() => [{ value: 'all', label: labels.allUsers }, ...users], [labels.allUsers, users]);

  const actionOptions = React.useMemo(() => ACTION_OPTIONS.map((option) => (option.value === 'all' ? { ...option, label: labels.allActions } : option)), [labels.allActions]);

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
  const visibleRows = pageRows;
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

  const [orgNoticeBeforePermission, orgNoticeAfterPermission = ''] = labels.orgNoticeSuffix.split('impersonate.tenant');

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
          <h1 className="text-2xl font-semibold tracking-tight">{labels.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {labels.summary}
          </p>
        </div>
        <Button type="button" className="btn-secondary btn-sm">
          {labels.exportFiltered}
        </Button>
      </header>

      <section role="alert" className="alert alert-blue text-xs">
        {labels.orgNoticePrefix} <strong>{callerAccess.orgName}</strong> {orgNoticeBeforePermission}
        <code className="font-mono">impersonate.tenant</code>{orgNoticeAfterPermission}
      </section>

      <Card role="region" aria-label={labels.filtersRegion} className="border border-slate-200 bg-white">
        <CardContent className="space-y-2 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase text-slate-500">{labels.range}</span>
            {(['today', '7d', '30d', '90d', 'custom'] as DatePreset[]).map((preset) => (
              <Button
                key={preset}
                type="button"
                className={datePreset === preset ? 'btn-primary btn-sm' : 'btn-sm'}
                onClick={() => applyPreset(preset)}
              >
                {labels.presets[preset]}
              </Button>
            ))}
            {(datePreset === 'custom' || dateRange.from) ? (
              <>
                <Input
                  aria-label={labels.fromDate}
                  className="form-input text-xs"
                  type="date"
                  value={dateRange.from}
                  onChange={(event) => {
                    setDatePreset('custom');
                    setDateRange({ ...dateRange, from: event.target.value });
                    setPage(1);
                  }}
                />
                <span className="text-xs text-muted-foreground">{labels.to}</span>
                <Input
                  aria-label={labels.toDate}
                  className="form-input text-xs"
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
              ~{partitionCount} {partitionCount === 1 ? labels.partitionWillBeScanned : labels.partitionsWillBeScanned}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label={labels.user}
              className="min-w-40"
              options={userOptions}
              value={userFilter}
              onValueChange={(value) => {
                setUserFilter(value);
                setPage(1);
              }}
            >
              <SelectTrigger aria-label={labels.user}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {userOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              aria-label={labels.action}
              options={actionOptions}
              value={actionFilter}
              onValueChange={(value) => {
                setActionFilter(value as AuditAction | 'all');
                setPage(1);
              }}
            >
              <SelectTrigger aria-label={labels.action}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {actionOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              aria-label={labels.tableContains}
              className="form-input font-mono text-xs"
              placeholder={`${labels.tableContains}…`}
              value={tableFilter}
              onChange={(event) => {
                setTableFilter(event.target.value);
                setPage(1);
              }}
            />
            <Input
              aria-label={labels.searchFieldValues}
              className="form-input min-w-44 flex-1 text-xs"
              placeholder={`${labels.searchFieldValues}…`}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <Button type="button" className="btn-ghost btn-sm" onClick={resetFilters}>{labels.reset}</Button>
            <span className="text-[11px] text-slate-500">{formatLabel(labels.entriesCount, { filtered: filtered.length, total: entries.length })}</span>
          </div>
        </CardContent>
      </Card>

      {explainText ? (
        <section className="alert alert-green text-xs">
          {labels.explainVerified}
          <span className="sr-only"> {explainText}</span>
        </section>
      ) : null}

      {showWarn ? (
        <section role="alert" className="alert alert-amber text-xs">
          <strong>{labels.largeDateRange}</strong> {formatLabel(labels.largeDateRangeBody, { days: spanDays(dateRange), partitions: partitionCount })}
        </section>
      ) : null}

      {isError ? (
        <section role="alert" className="alert alert-red">
          {labels.loadError}
        </section>
      ) : null}

      <section aria-label={formatLabel(labels.activity, { count: filtered.length })}>
        <h2 className="mb-2 text-base font-semibold">{formatLabel(labels.activity, { count: pageRows.length })}</h2>
        <Card className="overflow-hidden border border-slate-200 bg-white">
          {isLoading ? (
            <div className="p-12 text-center text-sm text-muted-foreground">{labels.loading}</div>
          ) : isEmpty ? (
            <div className="empty-state">
              <div className="empty-state-icon" aria-hidden="true">📜</div>
              <div className="empty-state-title">{labels.empty}</div>
              <div className="empty-state-action">
                <Button type="button" className="btn-secondary btn-sm" onClick={resetFilters}>{labels.resetFilters}</Button>
              </div>
            </div>
          ) : (
            <>
              <Table aria-label={labels.tableLabel} className="w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead aria-label={labels.expandRow} className="w-7" />
                    <TableHead>{labels.headers.timestamp}</TableHead>
                    <TableHead>{labels.headers.user}</TableHead>
                    <TableHead>{labels.headers.action}</TableHead>
                    <TableHead>{labels.headers.table}</TableHead>
                    <TableHead>{labels.headers.recordId}</TableHead>
                    <TableHead>{labels.headers.changedFields}</TableHead>
                    <TableHead>{labels.headers.ip}</TableHead>
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
                              {entry.impersonating ? <Badge variant="warning" className="text-[9px]">{labels.impersonating}</Badge> : null}
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
                              {entry.changes.length > 3 ? <Badge variant="muted" className="text-[9px]">{formatLabel(labels.more, { count: entry.changes.length - 3 })}</Badge> : null}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-[11px] text-slate-500">{entry.ipAddress || '—'}</TableCell>
                        </TableRow>
                        {open ? (
                          <TableRow>
                            <TableCell colSpan={8} className="bg-blue-50 p-0">
                              <RowDiffPanel changes={entry.changes} labels={labels} />
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2">
                <span className="text-[11px] text-slate-500">{formatLabel(labels.pageStatus, { page, totalPages, pageSize })}</span>
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    className="btn-ghost btn-sm"
                    aria-label={labels.prev}
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                  >
                    {labels.prev}
                  </Button>
                  <Button
                    type="button"
                    className="btn-ghost btn-sm"
                    aria-label={labels.next}
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                  >
                    {labels.next}
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </section>
    </main>
  );
}

function RowDiffPanel({ changes, labels }: { changes: AuditChange[]; labels: AuditLabels }) {
  return (
    <section role="region" aria-label={labels.diffTitle} className="space-y-2 p-3 text-xs">
      <div className="font-semibold text-slate-700">{labels.diffTitle}</div>
      <div className="grid grid-cols-[160px_1fr_1fr] gap-2 rounded border border-slate-200 bg-white p-2 font-semibold text-slate-500">
        <div>{labels.field}</div>
        <div>{labels.before}</div>
        <div>{labels.after}</div>
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
