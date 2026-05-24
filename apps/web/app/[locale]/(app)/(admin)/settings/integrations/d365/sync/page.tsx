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
