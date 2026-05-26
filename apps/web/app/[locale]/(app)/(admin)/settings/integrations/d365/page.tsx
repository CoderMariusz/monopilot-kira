import React from 'react';
import { getTranslations } from 'next-intl/server';

import { testD365Connection as testD365ConnectionAction } from '../../../../../../../actions/d365/test-connection';
import D365TestConnectionModal from '../../../../../../../components/settings/modals/d365-test-connection-modal';
import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader } from '@monopilot/ui/Card';
import Input from '@monopilot/ui/Input';
import { Select, SelectTrigger, SelectValue } from '@monopilot/ui/Select';
import { Switch } from '@monopilot/ui/Switch';
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

const prototypeSource = 'prototypes/design/Monopilot Design System/settings/admin-screens.jsx:27-103';

function GuardedRoot({ children }: { children: React.ReactNode }) {
  return (
    <main
      data-testid="settings-d365-connection-screen"
      data-screen="d365_connection_screen"
      data-route="/settings/integrations/d365"
      data-prototype-source={prototypeSource}
      className="space-y-4 p-6"
    >
      {children}
    </main>
  );
}

function GuardedSection({ title, children }: { title: string; children: any }) {
  return (
    <Card data-testid="settings-d365-connection-section" className="sg-section bg-white">
      <CardHeader className="border-b px-4 py-3">
        <h2 className="text-base font-semibold">{title}</h2>
      </CardHeader>
      <CardContent className="px-4 py-0">{children}</CardContent>
    </Card>
  );
}

function GuardedField({
  field,
  label: fieldLabel,
  hint,
  htmlFor,
  children,
}: {
  field: string;
  label: string;
  hint?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div data-field={field} className="grid gap-2 border-t border-slate-100 py-4 md:grid-cols-[210px_minmax(0,1fr)]">
      <div>
        <label htmlFor={htmlFor} className="text-sm font-medium text-slate-950">
          {fieldLabel}
        </label>
        {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

function MissingPrerequisitesConnectionScreen({
  labels,
  missingPrerequisites,
}: {
  labels: D365Labels;
  missingPrerequisites: string;
}) {
  return (
    <GuardedRoot>
      <header data-region="page-head" className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{labels.title}</h1>
          <p className="text-sm text-slate-600">{labels.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <D365TestConnectionModal
            environmentUrl=""
            testConnection={testRuntimeD365Connection}
            triggerLabel={labels.testConnection}
          />
          <Button type="submit" form="d365-connection-form" className="btn-primary" disabled>
            {labels.save}
          </Button>
        </div>
      </header>

      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <strong>LEGACY-D365.</strong> This integration will be retired when Monopilot replaces D365. Referenced by{' '}
        <span className="font-mono">integration.d365.so_trigger.enabled</span> (gates Planning SCREEN-13 + D365 Queue).
      </div>

      <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
        {missingPrerequisites}
      </div>

      <form id="d365-connection-form" className="space-y-4" aria-disabled="true">
        <GuardedSection title="Endpoint">
          <GuardedField field="baseUrl" label="Base URL" htmlFor="d365-base-url" hint="e.g. https://apex.operations.dynamics.com">
            <Input id="d365-base-url" type="url" aria-label="Base URL" data-slot="input" value="" disabled style={{ width: '100%', maxWidth: 420 }} />
          </GuardedField>
          <GuardedField field="environment" label="Environment" htmlFor="d365-environment">
            <Select value="" disabled>
              <SelectTrigger aria-label="Environment">
                <SelectValue placeholder="Environment" />
              </SelectTrigger>
            </Select>
          </GuardedField>
        </GuardedSection>

        <GuardedSection title="Authentication (Azure AD)">
          <GuardedField field="tenantId" label="Tenant ID" htmlFor="d365-tenant-id" hint="UUID format, from Azure portal.">
            <Input id="d365-tenant-id" data-slot="input" value="" disabled className="font-mono" style={{ width: 360 }} />
          </GuardedField>
          <GuardedField field="clientId" label="Client ID" htmlFor="d365-client-id" hint="Azure App Registration client ID.">
            <Input id="d365-client-id" data-slot="input" value="" disabled className="font-mono" style={{ width: 360 }} />
          </GuardedField>
          <GuardedField field="clientSecret" label="Client Secret" htmlFor="d365-client-secret" hint="Never shown after save. Use 'Rotate' to update.">
            <div className="flex items-center gap-2">
              <Input id="d365-client-secret" data-slot="input" type="password" readOnly value="" disabled style={{ width: 200 }} />
              <Button type="button" className="btn-secondary btn-sm" disabled>
                {labels.rotateSecret}
              </Button>
            </div>
          </GuardedField>
          <GuardedField field="serviceAccountEmail" label="Service account email" htmlFor="d365-service-account-email" hint="Fallback basic-auth identity.">
            <Input id="d365-service-account-email" type="email" data-slot="input" value="" disabled style={{ width: 320 }} />
          </GuardedField>
        </GuardedSection>

        <GuardedSection title="Polling & sync">
          <GuardedField field="pollCron" label="Pull cron schedule" htmlFor="d365-poll-cron" hint="Standard 5-field cron. Example: '0 2 * * *' = daily 02:00.">
            <Input id="d365-poll-cron" data-slot="input" value="" disabled className="font-mono" style={{ width: 200 }} />
          </GuardedField>
          <GuardedField field="enabled" label="Integration enabled" htmlFor="d365-enabled" hint="Mirrors `integration.d365.enabled` flag. Pre-flight runs on toggle.">
            <Switch id="d365-enabled" aria-label="Integration enabled" checked={false} disabled />
          </GuardedField>
        </GuardedSection>

        <GuardedSection title="Last test">
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            ✗ Failed — run 'Test connection' to retry.
          </div>
        </GuardedSection>
      </form>
    </GuardedRoot>
  );
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
  const missingPrerequisites = label(
    'settings.integrations.d365.connection.missingPrerequisites',
    t('settings.integrations.d365.connection.missingPrerequisites'),
    'D365 connection prerequisites are missing. Configure the endpoint, Azure AD tenant, client ID, and secret reference before saving or enabling sync.',
  );

  if (state === 'ready' && !config) {
    return <MissingPrerequisitesConnectionScreen labels={labels} missingPrerequisites={missingPrerequisites} />;
  }

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
