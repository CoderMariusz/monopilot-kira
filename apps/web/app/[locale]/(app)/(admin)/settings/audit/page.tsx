import React from 'react';

import { getTranslations } from 'next-intl/server';

import {
  AuditLogViewerScreen,
  type AuditLabels,
  type AuditLogEntry,
  type AuditQueryInput,
  type AuditQueryResult,
  type DatePreset,
  type DateRange,
} from './page.client';

type CallerAccess = {
  orgId: string;
  requestedOrgId: string;
  orgName: string;
  permissions: string[];
  roleCodes: string[];
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

const AUDIT_LABEL_FALLBACK: AuditLabels = {
  title: 'Audit logs',
  summary: 'Full audit trail of all settings mutations. Partitioned monthly, retained 7 years. Org-scoped to your tenant only.',
  exportFiltered: 'Export filtered results',
  orgNoticePrefix: 'Showing entries for',
  orgNoticeSuffix: '(your org). Cross-tenant viewing requires impersonate.tenant — not granted to your role.',
  range: 'RANGE',
  filtersRegion: 'Audit filters',
  presets: {
    today: 'Today',
    '7d': 'Last 7d',
    '30d': 'Last 30d',
    '90d': 'Last 90d',
    custom: 'Custom',
  },
  fromDate: 'From date',
  toDate: 'To date',
  to: 'to',
  partitionWillBeScanned: 'partition will be scanned',
  partitionsWillBeScanned: 'partitions will be scanned',
  allUsers: 'All users',
  allActions: 'All actions',
  user: 'User',
  action: 'Action',
  tableContains: 'Table contains',
  searchFieldValues: 'Search field values',
  reset: 'Reset',
  entriesCount: '{filtered} of {total} entries',
  explainVerified: 'EXPLAIN verified — partition-aware scan.',
  largeDateRange: 'Large date range.',
  largeDateRangeBody: '{days} days span ~{partitions} monthly partitions. Query may take longer.',
  loadError: 'Unable to load audit log entries.',
  loading: 'Loading audit log entries…',
  activity: 'Activity ({count} entries)',
  empty: 'No audit log entries for selected filters.',
  resetFilters: 'Reset filters',
  tableLabel: 'Settings audit log',
  expandRow: 'Expand row',
  headers: {
    timestamp: 'Timestamp',
    user: 'User',
    action: 'Action',
    table: 'Table',
    recordId: 'Record ID',
    changedFields: 'Changed fields',
    ip: 'IP',
  },
  impersonating: 'impersonating',
  more: '+{count} more',
  pageStatus: 'Page {page} of {totalPages} · {pageSize} rows per page',
  prev: '← Prev',
  next: 'Next →',
  forbiddenTitle: '403 Forbidden',
  forbiddenMessage: 'Access denied for org_id-scoped audit logs. Required permission: {reason}.',
  forbiddenRoleCodes: 'Role codes are not treated as permissions; cross-tenant viewing additionally requires the impersonation permission.',
  diffTitle: 'Field-level diff',
  field: 'Field',
  before: 'before',
  after: 'after',
};

const AUDIT_LABEL_KEYS = {
  title: 'title',
  summary: 'summary',
  exportFiltered: 'export_filtered',
  orgNoticePrefix: 'org_notice_prefix',
  orgNoticeSuffix: 'org_notice_suffix',
  range: 'range',
  filtersRegion: 'filters_region',
  fromDate: 'from_date',
  toDate: 'to_date',
  to: 'to',
  partitionWillBeScanned: 'partition_will_be_scanned',
  partitionsWillBeScanned: 'partitions_will_be_scanned',
  allUsers: 'all_users',
  allActions: 'all_actions',
  user: 'user',
  action: 'action',
  tableContains: 'table_contains',
  searchFieldValues: 'search_field_values',
  reset: 'reset',
  entriesCount: 'entries_count',
  explainVerified: 'explain_verified',
  largeDateRange: 'large_date_range',
  largeDateRangeBody: 'large_date_range_body',
  loadError: 'load_error',
  loading: 'loading',
  activity: 'activity',
  empty: 'empty',
  resetFilters: 'reset_filters',
  tableLabel: 'table_label',
  expandRow: 'expand_row',
  impersonating: 'impersonating',
  more: 'more',
  pageStatus: 'page_status',
  prev: 'prev',
  next: 'next',
  forbiddenTitle: 'forbidden_title',
  forbiddenMessage: 'forbidden_message',
  forbiddenRoleCodes: 'forbidden_role_codes',
  diffTitle: 'diff_title',
  field: 'field',
  before: 'before',
  after: 'after',
} satisfies Partial<Record<keyof AuditLabels, string>>;

const AUDIT_HEADER_KEYS = {
  timestamp: 'header_timestamp',
  user: 'header_user',
  action: 'header_action',
  table: 'header_table',
  recordId: 'header_record_id',
  changedFields: 'header_changed_fields',
  ip: 'header_ip',
} satisfies Record<keyof AuditLabels['headers'], string>;

const AUDIT_PRESET_KEYS = {
  today: 'preset_today',
  '7d': 'preset_7d',
  '30d': 'preset_30d',
  '90d': 'preset_90d',
  custom: 'preset_custom',
} satisfies Record<DatePreset, string>;

function interpolate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), template);
}

function formatLabel(template: string, values: Record<string, string | number>) {
  return interpolate(template, values);
}

async function buildLabels(locale: string): Promise<AuditLabels> {
  const t = await getTranslations({ locale, namespace: 'settings.audit_log_viewer' });
  const translate = t as unknown as (key: string) => string;
  const read = <K extends keyof typeof AUDIT_LABEL_KEYS>(key: K): string => {
    const messageKey = AUDIT_LABEL_KEYS[key];
    const fallback = AUDIT_LABEL_FALLBACK[key];
    try {
      const translated = translate(messageKey);
      return translated === messageKey ? String(fallback) : translated;
    } catch {
      return String(fallback);
    }
  };
  const readPreset = (preset: DatePreset) => {
    const messageKey = AUDIT_PRESET_KEYS[preset];
    try {
      const translated = translate(messageKey);
      return translated === messageKey ? AUDIT_LABEL_FALLBACK.presets[preset] : translated;
    } catch {
      return AUDIT_LABEL_FALLBACK.presets[preset];
    }
  };
  const readHeader = (key: keyof AuditLabels['headers']) => {
    const messageKey = AUDIT_HEADER_KEYS[key];
    try {
      const translated = translate(messageKey);
      return translated === messageKey ? AUDIT_LABEL_FALLBACK.headers[key] : translated;
    } catch {
      return AUDIT_LABEL_FALLBACK.headers[key];
    }
  };
  return {
    ...AUDIT_LABEL_FALLBACK,
    title: read('title'),
    summary: read('summary'),
    exportFiltered: read('exportFiltered'),
    orgNoticePrefix: read('orgNoticePrefix'),
    orgNoticeSuffix: read('orgNoticeSuffix'),
    range: read('range'),
    filtersRegion: read('filtersRegion'),
    presets: {
      today: readPreset('today'),
      '7d': readPreset('7d'),
      '30d': readPreset('30d'),
      '90d': readPreset('90d'),
      custom: readPreset('custom'),
    },
    fromDate: read('fromDate'),
    toDate: read('toDate'),
    to: read('to'),
    partitionWillBeScanned: read('partitionWillBeScanned'),
    partitionsWillBeScanned: read('partitionsWillBeScanned'),
    allUsers: read('allUsers'),
    allActions: read('allActions'),
    user: read('user'),
    action: read('action'),
    tableContains: read('tableContains'),
    searchFieldValues: read('searchFieldValues'),
    reset: read('reset'),
    entriesCount: read('entriesCount'),
    explainVerified: read('explainVerified'),
    largeDateRange: read('largeDateRange'),
    largeDateRangeBody: read('largeDateRangeBody'),
    loadError: read('loadError'),
    loading: read('loading'),
    activity: read('activity'),
    empty: read('empty'),
    resetFilters: read('resetFilters'),
    tableLabel: read('tableLabel'),
    expandRow: read('expandRow'),
    headers: {
      timestamp: readHeader('timestamp'),
      user: readHeader('user'),
      action: readHeader('action'),
      table: readHeader('table'),
      recordId: readHeader('recordId'),
      changedFields: readHeader('changedFields'),
      ip: readHeader('ip'),
    },
    impersonating: read('impersonating'),
    more: read('more'),
    pageStatus: read('pageStatus'),
    prev: read('prev'),
    next: read('next'),
    forbiddenTitle: read('forbiddenTitle'),
    forbiddenMessage: read('forbiddenMessage'),
    forbiddenRoleCodes: read('forbiddenRoleCodes'),
    diffTitle: read('diffTitle'),
    field: read('field'),
    before: read('before'),
    after: read('after'),
  };
}

const DEFAULT_CALLER_ACCESS: CallerAccess = {
  orgId: 'org-context-unavailable',
  requestedOrgId: 'org-context-unavailable',
  orgName: 'Organization unavailable',
  permissions: [],
  roleCodes: [],
};

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

function ForbiddenAuditLog({ labels, reason }: { labels: AuditLabels; reason: string }) {
  const [beforeReason, afterReason = ''] = labels.forbiddenMessage.split('{reason}');
  return (
    <main className="space-y-3 p-6" data-screen="settings-audit-forbidden">
      <section role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        <h1 className="text-xl font-semibold">{labels.forbiddenTitle}</h1>
        <p className="mt-2">
          {beforeReason}<code>{reason}</code>{afterReason}
        </p>
        <p className="mt-1 text-red-800">{labels.forbiddenRoleCodes}</p>
      </section>
    </main>
  );
}

export default async function SettingsAuditLogPage(propsInput: unknown = {}) {
  const props = (propsInput ?? {}) as PageProps;
  const params = await props.params;
  const locale = params?.locale ?? 'en';
  const labels = await buildLabels(locale);
  const now = props.now ?? new Date().toISOString();
  const pageSize = props.pageSize ?? 50;
  const callerAccess = props.callerAccess ?? DEFAULT_CALLER_ACCESS;
  const forbiddenReason = isForbidden(callerAccess);

  if (forbiddenReason) return <ForbiddenAuditLog labels={labels} reason={forbiddenReason} />;

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
      labels={labels}
      now={now}
      pageSize={pageSize}
      state={props.state ?? ((entries?.length ?? 0) === 0 ? 'empty' : 'ready')}
      totalCount={totalCount}
    />
  );
}
