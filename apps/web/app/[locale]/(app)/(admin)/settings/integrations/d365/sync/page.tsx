import React from 'react';
import { getTranslations } from 'next-intl/server';

import { Card, CardContent } from '@monopilot/ui/Card';

import {
  D365SyncConfigForm,
  type D365SyncConfig,
  type D365SyncLabels,
  type UpdateD365SyncConfigInput,
} from './d365-sync-config-form.client';

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
          <p className="mt-2 text-sm text-red-900">This configuration is restricted to the account holder role.</p>
        </CardContent>
      </Card>
    </main>
  );
}

export default async function D365SyncPage({
  params,
  callerRole = 'viewer',
  config,
  updateD365SyncConfig,
}: D365SyncPageProps) {
  const resolvedParams = await params;
  const locale = resolvedParams?.locale ?? 'en';
  const fallbackConfig = buildFallbackConfig(locale);
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
