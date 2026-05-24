import React from 'react';
import { getTranslations } from 'next-intl/server';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader } from '@monopilot/ui/Card';
import Modal from '@monopilot/ui/Modal';
import { Select, SelectTrigger } from '@monopilot/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@monopilot/ui/Table';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

export const dynamic = 'force-dynamic';

const READ_PERMISSION = 'settings.email.read';
const PROTOTYPE_SOURCE = 'prototypes/design/Monopilot Design System/settings/admin-screens.jsx:152-217';

type EmailDeliveryStatus = 'queued' | 'sent' | 'failed' | 'dlq';
type RetryStatus = 'not_retried' | 'retry_scheduled' | 'retry_exhausted' | 'dlq';
type PageState = 'ready' | 'loading' | 'empty' | 'error';

type EmailDeliveryLogRow = {
  id: string;
  created_at: string;
  status: EmailDeliveryStatus;
  retry_status: RetryStatus;
  trigger_code: string;
  recipient_email: string;
  provider_message_id?: string;
  payload: Record<string, unknown>;
};

type Caller = {
  roleCode?: string;
  permissions: string[];
};

type EmailDeliveryLogPageProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  state?: PageState;
  caller?: Caller;
  deliveryLogs?: EmailDeliveryLogRow[];
  initialFilters?: { status?: EmailDeliveryStatus | 'all'; trigger_code?: string | 'all' };
  openPayloadId?: string;
};

type QueryClient = { query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }> };
type PermissionRow = { ok: boolean };
type EmailDeliveryLogDbRow = {
  id: string | number;
  created_at: string | Date | null;
  status: string | null;
  retry_status: string | null;
  trigger_code: string | null;
  recipient_email: string | null;
  provider_message_id: string | null;
  payload: unknown;
};

type RuntimeLoadResult =
  | { access: 'allowed'; state: PageState; logs: EmailDeliveryLogRow[] }
  | { access: 'denied'; state: 'forbidden'; logs: [] };

type Labels = {
  title: string;
  subtitle: string;
  lastRuns: string;
  filters: string;
  status: string;
  triggerCode: string;
  recipient: string;
  createdAt: string;
  retryStatus: string;
  providerMessageId: string;
  payload: string;
  allStatuses: string;
  allTriggers: string;
  viewPayload: string;
  permissionDeniedTitle: string;
  permissionDeniedBody: string;
  rowsCount: string;
  loading: string;
  empty: string;
  error: string;
};

const DEFAULT_LABELS: Labels = {
  title: 'Email delivery log',
  subtitle: 'Last email outbox runs with sent, failed, and retry status.',
  lastRuns: 'Last email outbox runs',
  filters: 'Filters',
  status: 'Status',
  triggerCode: 'Trigger code',
  recipient: 'Recipient',
  createdAt: 'Created at',
  retryStatus: 'Retry status',
  providerMessageId: 'Provider message ID',
  payload: 'Payload',
  allStatuses: 'All statuses',
  allTriggers: 'All triggers',
  viewPayload: 'View payload',
  permissionDeniedTitle: '403 — Settings email access required',
  permissionDeniedBody: 'You need settings.email.read to view email delivery logs.',
  rowsCount: '{count} email delivery runs',
  loading: 'Loading email delivery log…',
  empty: 'No email delivery runs found.',
  error: 'Unable to load email delivery log.',
};

const LABEL_KEYS = Object.keys(DEFAULT_LABELS) as Array<keyof Labels>;

function formatMessage(template: string, values: Record<string, string | number> = {}) {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
}

async function buildLabels(locale: string): Promise<Labels> {
  try {
    const t = await getTranslations({ locale, namespace: 'settings.emailDeliveryLog' });
    return LABEL_KEYS.reduce((labels, key) => {
      try {
        labels[key] = t(key);
      } catch {
        labels[key] = DEFAULT_LABELS[key];
      }
      return labels;
    }, {} as Labels);
  } catch {
    return { ...DEFAULT_LABELS };
  }
}

function hasReadPermission(caller: Caller | undefined) {
  return caller?.permissions.includes(READ_PERMISSION) === true;
}

function maskRecipient(email: string) {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  return `${local.slice(0, 3)}@${domain}`;
}

function dateTimeLabel(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toISOString();
}

function statusTone(status: EmailDeliveryStatus) {
  if (status === 'sent') return 'success';
  if (status === 'failed') return 'danger';
  return 'warning';
}

function sortLogs(logs: EmailDeliveryLogRow[]) {
  return [...logs].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

function uniqueTriggers(logs: EmailDeliveryLogRow[]) {
  return Array.from(new Set(logs.map((log) => log.trigger_code))).sort((a, b) => a.localeCompare(b));
}

function asEmailDeliveryStatus(value: string | null): EmailDeliveryStatus {
  return value === 'queued' || value === 'sent' || value === 'failed' || value === 'dlq' ? value : 'failed';
}

function firstSearchValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeStatusFilter(value: string | undefined): EmailDeliveryStatus | 'all' {
  return value === 'queued' || value === 'sent' || value === 'failed' || value === 'dlq' ? value : 'all';
}

function asRetryStatus(value: string | null): RetryStatus {
  return value === 'not_retried' || value === 'retry_scheduled' || value === 'retry_exhausted' || value === 'dlq'
    ? value
    : 'not_retried';
}

function toIsoString(value: string | Date | null) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.trim()) return dateTimeLabel(value);
  return new Date(0).toISOString();
}

function mapDbRow(row: EmailDeliveryLogDbRow): EmailDeliveryLogRow | null {
  if (!row.trigger_code || !row.recipient_email) return null;
  return {
    id: String(row.id),
    created_at: toIsoString(row.created_at),
    status: asEmailDeliveryStatus(row.status),
    retry_status: asRetryStatus(row.retry_status),
    trigger_code: row.trigger_code,
    recipient_email: row.recipient_email,
    provider_message_id: row.provider_message_id ?? undefined,
    payload: row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? (row.payload as Record<string, unknown>) : {},
  };
}

async function loadRuntimeLogs(): Promise<RuntimeLoadResult> {
  try {
    return await withOrgContext(async ({ client, userId, orgId }) => {
      const queryClient = client as QueryClient;
      const permission = await queryClient.query<PermissionRow>(
        `select true as ok
           from public.user_roles ur
           join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
           join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
          where ur.user_id = $1::uuid
            and ur.org_id = $2::uuid
          limit 1`,
        [userId, orgId, READ_PERMISSION],
      );
      if (permission.rows.length === 0) return { access: 'denied', state: 'forbidden', logs: [] };

      const result = await queryClient.query<EmailDeliveryLogDbRow>(
        `select id,
                created_at,
                status,
                retry_status,
                trigger_code,
                recipient_email,
                provider_message_id,
                payload
           from public.email_delivery_log
          where org_id = app.current_org_id()
          order by created_at desc
          limit 100`,
      );
      const logs = result.rows.map(mapDbRow).filter((row): row is EmailDeliveryLogRow => row !== null);
      return { access: 'allowed', state: logs.length ? 'ready' : 'empty', logs };
    });
  } catch {
    return { access: 'allowed', state: 'error', logs: [] };
  }
}

function PermissionDenied({ labels }: { labels: Labels }) {
  return (
    <main
      data-testid="settings-email-delivery-log-screen"
      data-route="/settings/notifications/email-log"
      data-screen="email_delivery_log_screen"
      data-prototype-source={PROTOTYPE_SOURCE}
      className="mx-auto max-w-5xl space-y-6 p-6"
    >
      <section role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-900">
        <h1 className="text-2xl font-semibold">{labels.permissionDeniedTitle}</h1>
        <p className="mt-2 text-sm">{labels.permissionDeniedBody}</p>
      </section>
    </main>
  );
}

function StateMessage({ labels, state }: { labels: Labels; state: PageState }) {
  const message = state === 'loading' ? labels.loading : state === 'error' ? labels.error : labels.empty;
  return (
    <Card role="status" className="rounded-xl border bg-white shadow-sm">
      <CardContent className="p-6 text-sm text-slate-600">{message}</CardContent>
    </Card>
  );
}

function EmailDeliveryLogScreen({
  labels,
  logs,
  state,
  initialFilters,
  openPayloadId,
}: {
  labels: Labels;
  logs: EmailDeliveryLogRow[];
  state: PageState;
  initialFilters: { status: EmailDeliveryStatus | 'all'; trigger_code: string | 'all' };
  openPayloadId?: string;
}) {
  const sortedLogs = sortLogs(logs).slice(0, 100);
  const statusFilter = initialFilters.status;
  const triggerFilter = initialFilters.trigger_code;

  const filteredLogs = sortedLogs.filter((log) => {
    return (statusFilter === 'all' || log.status === statusFilter) && (triggerFilter === 'all' || log.trigger_code === triggerFilter);
  });
  const openPayload = sortedLogs.find((log) => log.id === openPayloadId) ?? null;

  return (
    <main
      data-testid="settings-email-delivery-log-screen"
      data-route="/settings/notifications/email-log"
      data-screen="email_delivery_log_screen"
      data-prototype-source={PROTOTYPE_SOURCE}
      className="mx-auto max-w-7xl space-y-6 p-6"
    >
      <header data-region="page-head" className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{labels.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{labels.subtitle}</p>
        </div>
        <p className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
          {formatMessage(labels.rowsCount, { count: filteredLogs.length })}
        </p>
      </header>

      <section className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
        SET-093 is read-only; retry and resend actions remain owned by the outbox/DLQ worker.
      </section>

      <section aria-label={labels.filters} className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1 text-xs font-medium text-slate-600">
          <span>{labels.status}</span>
          <Select
            defaultValue={statusFilter}
            options={[
              { value: 'all', label: labels.allStatuses },
              { value: 'queued', label: 'queued' },
              { value: 'sent', label: 'sent' },
              { value: 'failed', label: 'failed' },
              { value: 'dlq', label: 'dlq' },
            ]}
            className="min-w-[180px]"
          >
            <SelectTrigger aria-label={labels.status} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
              <span>{statusFilter === 'all' ? labels.allStatuses : `${labels.status}: ${statusFilter}`}</span>
            </SelectTrigger>
          </Select>
        </div>
        <div className="grid gap-1 text-xs font-medium text-slate-600">
          <span>{labels.triggerCode}</span>
          <Select
            defaultValue={triggerFilter}
            options={[{ value: 'all', label: labels.allTriggers }, ...uniqueTriggers(sortedLogs).map((trigger) => ({ value: trigger, label: trigger }))]}
            className="min-w-[220px]"
          >
            <SelectTrigger aria-label={labels.triggerCode} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
              <span>{triggerFilter === 'all' ? labels.allTriggers : `${labels.triggerCode}: ${triggerFilter}`}</span>
            </SelectTrigger>
          </Select>
        </div>
      </section>

      {state !== 'ready' || sortedLogs.length === 0 ? (
        <StateMessage labels={labels} state={state === 'ready' ? 'empty' : state} />
      ) : (
        <Card role="region" aria-label={labels.lastRuns} className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <CardHeader className="border-b px-6 py-4">
            <h2 className="text-lg font-semibold">Delivery runs</h2>
          </CardHeader>
          <CardContent className="p-0">
            <Table aria-label={labels.lastRuns}>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">{labels.createdAt}</TableHead>
                  <TableHead scope="col">{labels.status}</TableHead>
                  <TableHead scope="col">{labels.triggerCode}</TableHead>
                  <TableHead scope="col">{labels.recipient}</TableHead>
                  <TableHead scope="col">{labels.retryStatus}</TableHead>
                  <TableHead scope="col">{labels.providerMessageId}</TableHead>
                  <TableHead scope="col">{labels.payload}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.map((log) => (
                  <TableRow key={log.id} data-testid={`settings-email-delivery-log-row-${log.id}`} data-log-id={log.id}>
                    <TableCell className="font-mono text-xs text-slate-600">{dateTimeLabel(log.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant={statusTone(log.status)}>{log.status}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{log.trigger_code}</TableCell>
                    <TableCell className="font-mono text-xs">{maskRecipient(log.recipient_email)}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">{log.retry_status === 'dlq' ? 'dead letter' : log.retry_status}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">{log.provider_message_id ?? '—'}</TableCell>
                    <TableCell>
                      <form method="get">
                        <input type="hidden" name="status" value={statusFilter} />
                        <input type="hidden" name="trigger_code" value={triggerFilter} />
                        <input type="hidden" name="payload" value={log.id} />
                        <Button type="submit" className="btn-sm">
                          {labels.viewPayload}
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {openPayload ? (
        <Modal open onOpenChange={() => undefined} size="lg" modalId="settings-email-delivery-payload">
          <Modal.Header title={`${labels.payload} — ${openPayload.trigger_code}`} />
          <Modal.Body>
            <p className="mt-3 font-mono text-sm">{openPayload.recipient_email}</p>
            <pre className="mt-4 max-h-96 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-50">
              {JSON.stringify(openPayload.payload, null, 2)}
            </pre>
          </Modal.Body>
        </Modal>
      ) : null}
    </main>
  );
}

export default async function EmailDeliveryLogPage(props: EmailDeliveryLogPageProps) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const locale = params?.locale ?? 'en';
  const labels = await buildLabels(locale);
  const runtime = props.deliveryLogs || props.caller ? null : await loadRuntimeLogs();
  const state = props.state ?? (runtime?.access === 'allowed' ? runtime.state : undefined) ?? 'empty';
  const logs = props.deliveryLogs ?? (runtime?.access === 'allowed' ? runtime.logs : undefined) ?? [];
  const status = props.initialFilters?.status ?? normalizeStatusFilter(firstSearchValue(searchParams?.status));
  const triggerCode = props.initialFilters?.trigger_code ?? firstSearchValue(searchParams?.trigger_code) ?? 'all';
  const openPayloadId = props.openPayloadId ?? firstSearchValue(searchParams?.payload) ?? firstSearchValue(searchParams?.payload_id);

  if (runtime?.access === 'denied' || (props.caller && !hasReadPermission(props.caller))) {
    return <PermissionDenied labels={labels} />;
  }

  return (
    <EmailDeliveryLogScreen
      labels={labels}
      logs={logs}
      state={state}
      initialFilters={{
        status,
        trigger_code: triggerCode,
      }}
      openPayloadId={openPayloadId}
    />
  );
}
