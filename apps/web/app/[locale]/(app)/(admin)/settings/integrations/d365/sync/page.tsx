import React from 'react';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@monopilot/ui/Card';
import Input from '@monopilot/ui/Input';
import { Switch } from '@monopilot/ui/Switch';

type CallerRole = 'owner' | 'admin' | 'planner' | 'viewer';

type D365SyncConfig = {
  pull_cron: string;
  batch_size: number;
  max_attempts: number;
  retry_backoff_minutes: number;
  push_queue_enabled: boolean;
  dlq_href: string;
  last_applied_at: string | null;
  applied_by_user: string | null;
};

type UpdateD365SyncConfigInput = Pick<
  D365SyncConfig,
  'pull_cron' | 'batch_size' | 'max_attempts' | 'retry_backoff_minutes' | 'push_queue_enabled'
>;

type D365SyncPageProps = {
  params?: Promise<{ locale: string }>;
  callerRole?: CallerRole;
  config?: D365SyncConfig | null;
  updateD365SyncConfig?: (input: UpdateD365SyncConfigInput) => Promise<{ ok: true } | { ok: false; message: string }>;
};

type D365SyncLabels = {
  title: string;
  subtitle: string;
  save: string;
  saved: string;
  forbiddenTitle: string;
};

const prototypeSource = 'prototypes/design/Monopilot Design System/settings/admin-screens.jsx:27-107';

const fallbackConfig: D365SyncConfig = {
  pull_cron: '0 2 * * *',
  batch_size: 50,
  max_attempts: 3,
  retry_backoff_minutes: 15,
  push_queue_enabled: true,
  dlq_href: '/en/settings/integrations/d365/dead-letter',
  last_applied_at: null,
  applied_by_user: null,
};

const cronField = z.string().refine(isValidFiveFieldCron, {
  message: 'Invalid cron expression. Use a valid cron-parser style 5-field expression.',
});

const syncConfigSchema = z.object({
  pull_cron: cronField,
  batch_size: z.number().int().min(1).max(1000),
  max_attempts: z.number().int().min(1).max(20),
  retry_backoff_minutes: z.number().int().min(1).max(1440),
  push_queue_enabled: z.boolean(),
});

function isValidFiveFieldCron(value: string) {
  const fields = value.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const ranges: Array<[number, number]> = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 7],
  ];
  return fields.every((field, index) => isCronField(field, ranges[index]![0], ranges[index]![1]));
}

function isCronField(field: string, min: number, max: number) {
  if (!field) return false;
  return field.split(',').every((part) => isCronPart(part, min, max));
}

function isCronPart(part: string, min: number, max: number) {
  const [base, step, extra] = part.split('/');
  if (extra !== undefined) return false;
  if (step !== undefined && !/^[1-9]\d*$/.test(step)) return false;
  if (base === '*') return true;

  const range = base.split('-');
  if (range.length === 1) return isCronNumber(range[0]!, min, max);
  if (range.length === 2) {
    const [start, end] = range;
    if (!isCronNumber(start!, min, max) || !isCronNumber(end!, min, max)) return false;
    return Number(start) <= Number(end);
  }
  return false;
}

function isCronNumber(value: string, min: number, max: number) {
  if (!/^\d+$/.test(value)) return false;
  const parsed = Number(value);
  return parsed >= min && parsed <= max;
}

function nextRunPreview(cron: string, locale: string) {
  if (!isValidFiveFieldCron(cron)) return 'Next run unavailable until the cron is valid.';

  const [minuteField, hourField] = cron.trim().split(/\s+/);
  const now = new Date();
  const next = new Date(now);
  const minute = firstCronValue(minuteField!, 0, 59) ?? 0;
  const hour = hourField === '*' || hourField?.startsWith('*/') ? now.getUTCHours() : firstCronValue(hourField!, 0, 23);

  next.setUTCSeconds(0, 0);
  next.setUTCMinutes(minute);
  if (hour !== null && hour !== undefined) next.setUTCHours(hour);
  if (next <= now) {
    if (hourField === '*' || hourField?.startsWith('*/')) next.setUTCHours(next.getUTCHours() + 1);
    else next.setUTCDate(next.getUTCDate() + 1);
  }

  return `Next run ${new Intl.DateTimeFormat(locale || 'en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(next)} UTC`;
}

function firstCronValue(field: string, min: number, max: number) {
  if (field === '*' || field.startsWith('*/')) return min;
  const candidate = field.split(',')[0]?.split('-')[0];
  if (!candidate || !isCronNumber(candidate, min, max)) return null;
  return Number(candidate);
}

function label(fullKey: string, translated: string, fallback: string) {
  return translated && translated !== fullKey ? translated : fallback;
}

function formatAppliedAt(value: string | null, locale: string) {
  if (!value) return 'Not applied yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale || 'en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
}

function Field({
  label: fieldLabel,
  hint,
  field,
  children,
  error,
}: {
  label: string;
  hint?: string;
  field: string;
  children: React.ReactNode;
  error?: string | null;
}) {
  return (
    <div data-field={field} className="grid gap-2 border-t border-slate-100 py-4 md:grid-cols-[210px_minmax(0,1fr)]">
      <div>
        <div className="text-sm font-medium text-slate-950">{fieldLabel}</div>
        {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      </div>
      <div>
        {children}
        {error ? (
          <div role="alert" className="mt-1 text-xs font-medium text-red-600">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: any }) {
  return (
    <Card data-testid="settings-d365-sync-section" className="sg-section bg-white">
      <CardHeader className="border-b px-4 py-3">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <div className="card__content px-4 py-0">{children}</div>
    </Card>
  );
}

function Forbidden({ labels }: { labels: D365SyncLabels }) {
  return (
    <main data-testid="settings-d365-sync-screen" data-route="/settings/integrations/d365/sync" className="space-y-4 p-6">
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-4">
          <h1 className="text-xl font-semibold text-red-950">{labels.forbiddenTitle}</h1>
          <p className="mt-2 text-sm text-red-900">This configuration is restricted to the account holder role.</p>
        </CardContent>
      </Card>
    </main>
  );
}

function D365SyncConfigForm({
  config,
  labels,
  locale,
  updateD365SyncConfig,
}: {
  config: D365SyncConfig;
  labels: D365SyncLabels;
  locale: string;
  updateD365SyncConfig?: D365SyncPageProps['updateD365SyncConfig'];
}) {
  const [pullCron, setPullCron] = React.useState(config.pull_cron);
  const [batchSize, setBatchSize] = React.useState(String(config.batch_size));
  const [maxAttempts, setMaxAttempts] = React.useState(String(config.max_attempts));
  const [retryBackoff, setRetryBackoff] = React.useState(String(config.retry_backoff_minutes));
  const [pushQueueEnabled, setPushQueueEnabled] = React.useState(config.push_queue_enabled);
  const [status, setStatus] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const payload = {
    pull_cron: pullCron,
    batch_size: Number(batchSize),
    max_attempts: Number(maxAttempts),
    retry_backoff_minutes: Number(retryBackoff),
    push_queue_enabled: pushQueueEnabled,
  };
  const parsed = syncConfigSchema.safeParse(payload);
  const cronError = pullCron.trim() && !cronField.safeParse(pullCron).success
    ? 'Invalid cron expression. Use a valid cron-parser style 5-field expression.'
    : null;
  const canSubmit = parsed.success && !pending;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setActionError(null);
    const next = syncConfigSchema.safeParse(payload);
    if (!next.success) return;
    setPending(true);
    try {
      const result = await updateD365SyncConfig?.(next.data);
      if (!result || result.ok) setStatus(labels.saved);
      else setActionError(result.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <main
      data-testid="settings-d365-sync-screen"
      data-screen="d365_sync_config_screen"
      data-route="/settings/integrations/d365/sync"
      data-prototype-source={prototypeSource}
      className="space-y-4 p-6"
    >
      <header data-region="page-head" className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{labels.title}</h1>
          <p className="text-sm text-slate-600">{labels.subtitle}</p>
        </div>
        <Button type="submit" form="d365-sync-config-form" disabled={!canSubmit} className="btn-primary">
          {pending ? 'Saving…' : labels.save}
        </Button>
      </header>

      <div data-testid="d365-sync-applied-strip" className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
        <strong>Last applied</strong>{' '}
        <span className="font-mono">{formatAppliedAt(config.last_applied_at, locale)}</span>
        {' · '}
        <span>Applied by {config.applied_by_user ?? 'not recorded'}</span>
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <strong>LEGACY-D365.</strong> Sync is retained for transition operations; no credentials are stored on this SET-082 screen.
      </div>

      <form id="d365-sync-config-form" onSubmit={onSubmit} className="space-y-4">
        <Section title="Polling & sync">
          <Field
            field="pull_cron"
            label="Pull schedule (cron)"
            hint="Standard 5-field cron. Example: '0 * * * *' = hourly."
            error={cronError}
          >
            <label className="sr-only" htmlFor="d365-pull-cron">
              Pull schedule cron
            </label>
            <Input
              id="d365-pull-cron"
              aria-label="Pull schedule cron"
              className="font-mono"
              value={pullCron}
              onChange={(event) => setPullCron(event.currentTarget.value)}
              onBlur={() => setPullCron((value) => value.trim().replace(/\s+/g, ' '))}
              style={{ width: 220 }}
            />
            <p className="mt-2 text-xs text-slate-600" aria-live="polite">
              {nextRunPreview(pullCron, locale)}
            </p>
          </Field>
          <Field field="batch_size" label="Batch size" hint="Records pulled or pushed per worker batch.">
            <Input
              id="d365-batch-size"
              aria-label="Batch size"
              type="number"
              min={1}
              max={1000}
              value={batchSize}
              onChange={(event) => setBatchSize(event.currentTarget.value)}
              style={{ width: 120 }}
            />
          </Field>
          <Field field="push_queue_enabled" label="Push queue" hint="Enqueues outbound MES changes for D365 export-only sync.">
            <div className="flex items-center gap-3">
              <Switch aria-label="Push queue" checked={pushQueueEnabled} onCheckedChange={setPushQueueEnabled} />
              <Badge variant={pushQueueEnabled ? 'success' : 'muted'}>{pushQueueEnabled ? 'Enabled' : 'Disabled'}</Badge>
            </div>
          </Field>
        </Section>

        <Section title="Retry policy">
          <Field field="max_attempts" label="Max attempts" hint="Worker retries before moving the item to the dead-letter queue.">
            <Input
              id="d365-max-attempts"
              aria-label="Max attempts"
              type="number"
              min={1}
              max={20}
              value={maxAttempts}
              onChange={(event) => setMaxAttempts(event.currentTarget.value)}
              style={{ width: 120 }}
            />
          </Field>
          <Field field="retry_backoff_minutes" label="Retry backoff" hint="Minutes between retry attempts.">
            <Input
              id="d365-retry-backoff"
              aria-label="Retry backoff"
              type="number"
              min={1}
              max={1440}
              value={retryBackoff}
              onChange={(event) => setRetryBackoff(event.currentTarget.value)}
              style={{ width: 120 }}
            />
          </Field>
        </Section>

        <Section title="Dead-letter queue">
          <div className="py-4 text-sm text-slate-700">
            Items that exceed the retry policy are visible in the worker-owned DLQ tooling.{' '}
            <a className="font-medium text-blue-700 underline" href={config.dlq_href}>
              Dead-letter queue
            </a>
          </div>
        </Section>
      </form>

      {status ? (
        <p role="status" aria-live="polite" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {status}
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {actionError}
        </p>
      ) : null}
    </main>
  );
}

export default async function D365SyncPage({
  params,
  callerRole = 'viewer',
  config = fallbackConfig,
  updateD365SyncConfig,
}: D365SyncPageProps) {
  const resolvedParams = await params;
  const locale = resolvedParams?.locale ?? 'en';
  const t = await getTranslations();
  const labels: D365SyncLabels = {
    title: label('settings.integrations.d365.sync.title', t('settings.integrations.d365.sync.title'), 'D365 sync config'),
    subtitle: label(
      'settings.integrations.d365.sync.subtitle',
      t('settings.integrations.d365.sync.subtitle'),
      'Pull schedule, push queue, retry policy, and dead-letter queue access.',
    ),
    save: label('settings.integrations.d365.sync.save', t('settings.integrations.d365.sync.save'), 'Save sync config'),
    saved: label('settings.integrations.d365.sync.saved', t('settings.integrations.d365.sync.saved'), 'D365 sync config saved'),
    forbiddenTitle: label(
      'settings.integrations.d365.sync.forbiddenTitle',
      t('settings.integrations.d365.sync.forbiddenTitle'),
      '403 — Owner access required',
    ),
  };

  if (callerRole !== 'owner') return <Forbidden labels={labels} />;
  return (
    <D365SyncConfigForm
      config={config ?? fallbackConfig}
      labels={labels}
      locale={locale}
      updateD365SyncConfig={updateD365SyncConfig}
    />
  );
}
