import React from 'react';
import { getTranslations } from 'next-intl/server';

import { Card, CardContent } from '@monopilot/ui/Card';

import {
  loadD365SyncConfig,
  updateD365SyncConfig as updateD365SyncConfigAction,
} from '../../../../../../../../actions/d365/sync-config';
import {
  D365SyncConfigForm,
  type D365SyncConfig,
  type D365SyncLabels,
  type UpdateD365SyncConfigInput,
} from './d365-sync-config-form.client';

// The save round-trip reads/writes real Supabase data via withOrgContext; the
// route must never be statically cached.
export const dynamic = 'force-dynamic';

type CallerRole = 'owner' | 'admin' | 'planner' | 'viewer';

type D365SyncPageProps = {
  params?: Promise<{ locale: string }>;
  callerRole?: CallerRole;
  config?: D365SyncConfig | null;
  updateD365SyncConfig?: (input: UpdateD365SyncConfigInput) => Promise<{ ok: true } | { ok: false; message: string }>;
};

// The DLQ manager (T-058 / TEC-073) lives under the canonical
// settings/integrations/d365/dlq namespace (decision D-1). The legacy
// settings/d365-dlq path now redirects here.
function dlqHrefForLocale(locale: string) {
  return `/${locale}/settings/integrations/d365/dlq`;
}

// Defaults applied until a worker-owned D365 sync-config record exists for the
// org. No d365 sync-config table is provisioned in this stage, so the screen
// renders these honest defaults rather than implying a persisted config.
function buildFallbackConfig(locale: string): D365SyncConfig {
  return {
    pull_cron: '0 2 * * *',
    batch_size: 50,
    max_attempts: 3,
    retry_backoff_minutes: 15,
    push_queue_enabled: true,
    dlq_href: dlqHrefForLocale(locale),
    last_applied_at: null,
    applied_by_user: null,
  };
}

function label(fullKey: string, translated: string, fallback: string) {
  return translated && translated !== fullKey ? translated : fallback;
}

function Forbidden({ labels }: { labels: D365SyncLabels }) {
  return (
    <main data-testid="settings-d365-sync-screen" data-route="/settings/integrations/d365/sync" className="space-y-4 p-6">
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-4">
          <h1 className="text-xl font-semibold text-red-950">{labels.forbiddenTitle}</h1>
          <p className="mt-2 text-sm text-red-900">{labels.status.forbiddenBody}</p>
        </CardContent>
      </Card>
    </main>
  );
}

export default async function D365SyncPage(propsInput: D365SyncPageProps = {}) {
  const { params, callerRole, config, updateD365SyncConfig } = propsInput;
  const resolvedParams = await params;
  const locale = resolvedParams?.locale ?? 'en';
  const fallbackConfig = buildFallbackConfig(locale);

  // Tests inject `config` / `callerRole` / `updateD365SyncConfig` for
  // deterministic rendering. The production route injects none of these, which
  // is the signal to query real Supabase data via withOrgContext.
  const injected =
    Object.prototype.hasOwnProperty.call(propsInput, 'config') ||
    Object.prototype.hasOwnProperty.call(propsInput, 'callerRole') ||
    Object.prototype.hasOwnProperty.call(propsInput, 'updateD365SyncConfig');

  let resolvedConfig: D365SyncConfig | null | undefined = config;
  let canEdit = callerRole === 'owner';
  let saveAction = updateD365SyncConfig;

  if (!injected) {
    saveAction = updateD365SyncConfigAction;
    const loaded = await loadD365SyncConfig(locale);
    if (loaded.ok) {
      resolvedConfig = loaded.config;
      canEdit = loaded.canEdit;
    } else {
      resolvedConfig = fallbackConfig;
      canEdit = false;
    }
  }

  const t = await getTranslations('settings');
  const labels: D365SyncLabels = {
    title: label('d365.sync.title', t('d365.sync.title'), 'D365 sync config'),
    subtitle: label(
      'd365.sync.subtitle',
      t('d365.sync.subtitle'),
      'Pull schedule, push queue, retry policy, and dead-letter queue access.',
    ),
    save: label('d365.sync.save', t('d365.sync.save'), 'Save sync config'),
    saved: label('d365.sync.saved', t('d365.sync.saved'), 'D365 sync config saved'),
    forbiddenTitle: label(
      'd365.sync.forbiddenTitle',
      t('d365.sync.forbiddenTitle'),
      '403 — Owner access required',
    ),
    sections: {
      polling: label('d365.sync.sections.polling', t('d365.sync.sections.polling'), 'Polling & sync'),
      retry: label('d365.sync.sections.retry', t('d365.sync.sections.retry'), 'Retry policy'),
      dlq: label('d365.sync.sections.dlq', t('d365.sync.sections.dlq'), 'Dead-letter queue'),
    },
    fields: {
      pullCron: label('d365.sync.fields.pullCron', t('d365.sync.fields.pullCron'), 'Pull schedule cron'),
      batchSize: label('d365.sync.fields.batchSize', t('d365.sync.fields.batchSize'), 'Batch size'),
      pushQueue: label('d365.sync.fields.pushQueue', t('d365.sync.fields.pushQueue'), 'Push queue'),
      maxAttempts: label('d365.sync.fields.maxAttempts', t('d365.sync.fields.maxAttempts'), 'Max attempts'),
      retryBackoff: label('d365.sync.fields.retryBackoff', t('d365.sync.fields.retryBackoff'), 'Retry backoff'),
    },
    hints: {
      pullCron: label('d365.sync.hints.pullCron', t('d365.sync.hints.pullCron'), 'Use a valid 5-field cron expression.'),
      batchSize: label('d365.sync.hints.batchSize', t('d365.sync.hints.batchSize'), 'Records pulled or pushed per worker batch.'),
      pushQueue: label('d365.sync.hints.pushQueue', t('d365.sync.hints.pushQueue'), 'Enqueues outbound MES changes for D365 export-only sync.'),
      maxAttempts: label('d365.sync.hints.maxAttempts', t('d365.sync.hints.maxAttempts'), 'Worker retries before moving the item to the dead-letter queue.'),
      retryBackoff: label('d365.sync.hints.retryBackoff', t('d365.sync.hints.retryBackoff'), 'Minutes between retry attempts.'),
    },
    status: {
      saving: label('d365.sync.status.saving', t('d365.sync.status.saving'), 'Saving…'),
      lastApplied: label('d365.sync.status.lastApplied', t('d365.sync.status.lastApplied'), 'Last applied'),
      appliedBy: label('d365.sync.status.appliedBy', t('d365.sync.status.appliedBy'), 'Applied by {user}'),
      notRecorded: label('d365.sync.status.notRecorded', t('d365.sync.status.notRecorded'), 'not recorded'),
      notAppliedYet: label('d365.sync.status.notAppliedYet', t('d365.sync.status.notAppliedYet'), 'Not applied yet'),
      enabled: label('d365.sync.status.enabled', t('d365.sync.status.enabled'), 'Enabled'),
      disabled: label('d365.sync.status.disabled', t('d365.sync.status.disabled'), 'Disabled'),
      legacyNotice: label('d365.sync.status.legacyNotice', t('d365.sync.status.legacyNotice'), 'LEGACY-D365. Sync is retained for transition operations; no credentials are stored on this SET-082 screen.'),
      invalidCron: label('d365.sync.status.invalidCron', t('d365.sync.status.invalidCron'), 'Invalid cron expression. Use a valid cron-parser style 5-field expression.'),
      nextRunUnavailable: label('d365.sync.status.nextRunUnavailable', t('d365.sync.status.nextRunUnavailable'), 'Next run unavailable until the cron is valid.'),
      nextRun: label('d365.sync.status.nextRun', t('d365.sync.status.nextRun'), 'Next run {date} UTC'),
      dlqDescription: label('d365.sync.status.dlqDescription', t('d365.sync.status.dlqDescription'), 'Items that exceed the retry policy are visible in the worker-owned DLQ tooling.'),
      dlqLink: label('d365.sync.status.dlqLink', t('d365.sync.status.dlqLink'), 'Dead-letter queue'),
      forbiddenBody: label('d365.sync.status.forbiddenBody', t('d365.sync.status.forbiddenBody'), 'This configuration is restricted to the account holder role.'),
    },
  };

  if (!canEdit) return <Forbidden labels={labels} />;
  return (
    <D365SyncConfigForm
      config={resolvedConfig ?? fallbackConfig}
      labels={labels}
      locale={locale}
      updateD365SyncConfig={saveAction}
    />
  );
}
