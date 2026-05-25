import React from 'react';
import { getTranslations } from 'next-intl/server';

import { testD365Connection as testD365ConnectionAction } from '../../../../../../../actions/d365/test-connection';
import D365ConnectionForm, {
  type D365ConnectionActions,
  type D365ConnectionConfig,
  type D365ConnectionState,
  type D365Environment,
  type D365Labels,
} from './d365-connection-form.client';

type D365ConnectionPageProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<{ modal?: string }>;
};

type D365ConnectionPageTestOverrides = D365ConnectionActions & {
  state?: D365ConnectionState;
  config?: D365ConnectionConfig | null;
};

function label(fullKey: string, translated: string, fallback: string) {
  return translated && translated !== fullKey ? translated : fallback;
}

function readRuntimeConnectionConfig(): D365ConnectionConfig | null {
  const baseUrl = process.env.D365_BASE_URL ?? process.env.NEXT_PUBLIC_D365_BASE_URL;
  const tenantId = process.env.D365_TENANT_ID;
  const clientId = process.env.D365_CLIENT_ID;
  const pollCron = process.env.D365_POLL_CRON ?? '0 2 * * *';
  if (!baseUrl || !tenantId || !clientId) return null;

  const environmentRaw = process.env.D365_ENVIRONMENT ?? 'Production';
  const environment: D365Environment =
    environmentRaw === 'Sandbox' || environmentRaw === 'Development' ? environmentRaw : 'Production';

  return {
    baseUrl,
    environment,
    tenantId,
    clientId,
    clientSecretSet: Boolean(process.env.D365_CLIENT_SECRET_REF || process.env.D365_CLIENT_SECRET_SET),
    serviceAccountEmail: process.env.D365_SERVICE_ACCOUNT_EMAIL ?? '',
    pollCron,
    enabled: process.env.D365_ENABLED !== 'false',
    lastTest: { ok: false, at: null, message: 'not_run' },
  };
}

export async function testRuntimeD365Connection() {
  'use server';

  const config = readRuntimeConnectionConfig();
  const oauthBearer = process.env.D365_OAUTH_BEARER;
  if (!config || !oauthBearer) return { status: 'error' as const, reason: 'ERR_D365_CONNECTION_UNAVAILABLE' };

  const started = Date.now();
  const result = await testD365ConnectionAction({ baseUrl: config.baseUrl, oauthBearer });
  if (!result.ok) return { status: 'error' as const, reason: result.error };
  return { status: 'ok' as const, latencyMs: Date.now() - started, environment: config.environment };
}

export default async function D365ConnectionPage(propsInput: unknown) {
  const props = (propsInput ?? {}) as D365ConnectionPageProps & D365ConnectionPageTestOverrides;
  const {
    params,
    searchParams,
    state = 'ready',
    config = readRuntimeConnectionConfig(),
    saveD365Connection,
    rotateD365ClientSecret,
    testD365Connection,
  } = props;
  await params;
  const resolvedSearchParams = await searchParams;
  const initialTestConnectionOpen = resolvedSearchParams?.modal === 'd365Test';
  const t = await getTranslations();
  const labels: D365Labels = {
    title: label('settings.integrations.d365.connection.title', t('settings.integrations.d365.connection.title'), 'D365 connection'),
    subtitle: label(
      'settings.integrations.d365.connection.subtitle',
      t('settings.integrations.d365.connection.subtitle'),
      'Dynamics 365 Finance & Operations — endpoint, auth, polling schedule.',
    ),
    testConnection: label('settings.integrations.d365.connection.testConnection', t('settings.integrations.d365.connection.testConnection'), 'Test connection'),
    save: label('settings.integrations.d365.connection.save', t('settings.integrations.d365.connection.save'), 'Save configuration'),
    rotateSecret: label('settings.integrations.d365.connection.rotateSecret', t('settings.integrations.d365.connection.rotateSecret'), 'Rotate secret'),
    secretRotated: label('settings.integrations.d365.connection.secretRotated', t('settings.integrations.d365.connection.secretRotated'), 'D365 client secret rotated'),
    urlInvalid: label('settings.integrations.d365.connection.urlInvalid', t('settings.integrations.d365.connection.urlInvalid'), 'URL_INVALID'),
    loading: label('settings.integrations.d365.connection.loading', t('settings.integrations.d365.connection.loading'), 'Loading D365 connection…'),
    empty: label('settings.integrations.d365.connection.empty', t('settings.integrations.d365.connection.empty'), 'D365 connection is not configured.'),
    error: label('settings.integrations.d365.connection.error', t('settings.integrations.d365.connection.error'), 'Unable to load D365 connection.'),
  };

  return (
    <D365ConnectionForm
      state={state}
      config={config}
      labels={labels}
      saveD365Connection={saveD365Connection}
      rotateD365ClientSecret={rotateD365ClientSecret}
      testD365Connection={testD365Connection ?? (config ? testRuntimeD365Connection : undefined)}
      initialTestConnectionOpen={initialTestConnectionOpen}
    />
  );
}
