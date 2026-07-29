'use client';

import React from 'react';
import { z } from 'zod';

import { Badge } from '@monopilot/ui/Badge';
import { Button } from '@monopilot/ui/Button';
import { Card, CardHeader, CardTitle } from '@monopilot/ui/Card';
import Input from '@monopilot/ui/Input';
import { Switch } from '@monopilot/ui/Switch';

export type D365SyncConfig = {
  pull_cron: string;
  batch_size: number;
  max_attempts: number;
  retry_backoff_minutes: number;
  push_queue_enabled: boolean;
  dlq_href: string;
  last_applied_at: string | null;
  applied_by_user: string | null;
};

export type UpdateD365SyncConfigInput = Pick<
  D365SyncConfig,
  'pull_cron' | 'batch_size' | 'max_attempts' | 'retry_backoff_minutes' | 'push_queue_enabled'
>;

export type D365SyncLabels = {
  title: string;
  subtitle: string;
  save: string;
  saved: string;
  forbiddenTitle: string;
  sections: {
    polling: string;
    retry: string;
    dlq: string;
  };
  fields: {
    pullCron: string;
    batchSize: string;
    pushQueue: string;
    maxAttempts: string;
    retryBackoff: string;
  };
  hints: {
    pullCron: string;
    batchSize: string;
    pushQueue: string;
    maxAttempts: string;
    retryBackoff: string;
  };
  status: {
    saving: string;
    lastApplied: string;
    appliedBy: string;
    notRecorded: string;
    notAppliedYet: string;
    enabled: string;
    disabled: string;
    legacyNotice: string;
    exportOnlyNotice: string;
    invalidCron: string;
    nextRunUnavailable: string;
    nextRun: string;
    dlqDescription: string;
    dlqLink: string;
    forbiddenBody: string;
  };
};

const prototypeSource = 'prototypes/design/Monopilot Design System/settings/admin-screens.jsx:27-107';

/** Visible export-queue fields only — legacy `pull_cron` is preserved on save but not validated here. */
const visibleSyncConfigSchema = z.object({
  batch_size: z.number().int().min(1).max(1000),
  max_attempts: z.number().int().min(1).max(20),
  retry_backoff_minutes: z.number().int().min(1).max(1440),
  push_queue_enabled: z.boolean(),
});

function formatAppliedAt(value: string | null, locale: string, labels: D365SyncLabels) {
  if (!value) return labels.status.notAppliedYet;
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
    <div data-field={field} className="grid gap-2 border-t border-border py-4 md:grid-cols-[210px_minmax(0,1fr)]">
      <div>
        <div className="text-sm font-medium">{fieldLabel}</div>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div>
        {children}
        {error ? (
          <div role="alert" className="ff-error mt-1">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card data-testid="settings-d365-sync-section" className="sg-section bg-white">
      <CardHeader className="border-b px-4 py-3">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <div className="card__content px-4 py-0">{children}</div>
    </Card>
  );
}

export function D365SyncConfigForm({
  config,
  labels,
  locale,
  updateD365SyncConfig,
}: {
  config: D365SyncConfig;
  labels: D365SyncLabels;
  locale: string;
  updateD365SyncConfig?: (input: UpdateD365SyncConfigInput) => Promise<{ ok: true } | { ok: false; message: string }>;
}) {
  const [batchSize, setBatchSize] = React.useState(String(config.batch_size));
  const [maxAttempts, setMaxAttempts] = React.useState(String(config.max_attempts));
  const [retryBackoff, setRetryBackoff] = React.useState(String(config.retry_backoff_minutes));
  const [pushQueueEnabled, setPushQueueEnabled] = React.useState(config.push_queue_enabled);
  const [status, setStatus] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const visiblePayload = {
    batch_size: Number(batchSize),
    max_attempts: Number(maxAttempts),
    retry_backoff_minutes: Number(retryBackoff),
    push_queue_enabled: pushQueueEnabled,
  };
  const parsed = visibleSyncConfigSchema.safeParse(visiblePayload);
  const canSubmit = parsed.success && !pending;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setActionError(null);
    const next = visibleSyncConfigSchema.safeParse(visiblePayload);
    if (!next.success) return;
    const savePayload: UpdateD365SyncConfigInput = {
      ...next.data,
      pull_cron: config.pull_cron,
    };
    setPending(true);
    try {
      const result = await updateD365SyncConfig?.(savePayload);
      if (!result || result.ok) setStatus(labels.saved);
      else if (result.ok === false) setActionError(result.message);
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
          <p className="text-sm text-muted-foreground">{labels.subtitle}</p>
        </div>
        <Button type="submit" form="d365-sync-config-form" disabled={!canSubmit} className="btn-primary">
          {pending ? labels.status.saving : labels.save}
        </Button>
      </header>

      <div data-testid="d365-sync-applied-strip" className="alert alert-blue">
        <strong>{labels.status.lastApplied}</strong>{' '}
        <span className="font-mono">{formatAppliedAt(config.last_applied_at, locale, labels)}</span>
        {' · '}
        <span>{labels.status.appliedBy.replace('{user}', config.applied_by_user ?? labels.status.notRecorded)}</span>
      </div>

      <div className="alert alert-amber" role="note">
        {labels.status.legacyNotice}
      </div>

      <div className="alert alert-blue" role="note" data-testid="d365-sync-export-only-notice">
        {labels.status.exportOnlyNotice}
      </div>

      <form id="d365-sync-config-form" onSubmit={onSubmit} className="space-y-4">
        <Section title={labels.sections.polling}>
          <Field field="batch_size" label={labels.fields.batchSize} hint={labels.hints.batchSize}>
            <Input
              id="d365-batch-size"
              aria-label={labels.fields.batchSize}
              type="number"
              min={1}
              max={1000}
              value={batchSize}
              onChange={(event) => setBatchSize(event.currentTarget.value)}
              className="form-input"
              style={{ width: 120 }}
            />
          </Field>
          <Field field="push_queue_enabled" label={labels.fields.pushQueue} hint={labels.hints.pushQueue}>
            <div className="flex items-center gap-3">
              <Switch aria-label={labels.fields.pushQueue} checked={pushQueueEnabled} onCheckedChange={setPushQueueEnabled} />
              <Badge variant={pushQueueEnabled ? 'success' : 'muted'}>{pushQueueEnabled ? labels.status.enabled : labels.status.disabled}</Badge>
            </div>
          </Field>
        </Section>

        <Section title={labels.sections.retry}>
          <Field field="max_attempts" label={labels.fields.maxAttempts} hint={labels.hints.maxAttempts}>
            <Input
              id="d365-max-attempts"
              aria-label={labels.fields.maxAttempts}
              type="number"
              min={1}
              max={20}
              value={maxAttempts}
              onChange={(event) => setMaxAttempts(event.currentTarget.value)}
              className="form-input"
              style={{ width: 120 }}
            />
          </Field>
          <Field field="retry_backoff_minutes" label={labels.fields.retryBackoff} hint={labels.hints.retryBackoff}>
            <Input
              id="d365-retry-backoff"
              aria-label={labels.fields.retryBackoff}
              type="number"
              min={1}
              max={1440}
              value={retryBackoff}
              onChange={(event) => setRetryBackoff(event.currentTarget.value)}
              className="form-input"
              style={{ width: 120 }}
            />
          </Field>
        </Section>

        <Section title={labels.sections.dlq}>
          <div className="py-4 text-sm text-muted-foreground">
            {labels.status.dlqDescription}{' '}
            <a className="font-medium text-[var(--blue-700)] underline" href={config.dlq_href}>
              {labels.status.dlqLink}
            </a>
          </div>
        </Section>
      </form>

      {status ? (
        <p role="status" aria-live="polite" className="alert alert-green">
          {status}
        </p>
      ) : null}
      {actionError ? (
        <p role="alert" className="alert alert-red">
          {actionError}
        </p>
      ) : null}
    </main>
  );
}

export default D365SyncConfigForm;
