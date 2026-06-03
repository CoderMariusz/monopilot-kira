"use client";

import React from 'react';
import { z } from 'zod';

import { Button } from '@monopilot/ui/Button';
import { Card, CardContent, CardHeader } from '@monopilot/ui/Card';
import Input from '@monopilot/ui/Input';
import { Select, SelectTrigger, SelectValue } from '@monopilot/ui/Select';
import { Switch } from '@monopilot/ui/Switch';
import D365TestConnectionModal, {
  type D365ConnectionResult,
} from '../../../../../../../components/settings/modals/d365-test-connection-modal';

export type D365Environment = 'Production' | 'Sandbox' | 'Development';

export type D365ConnectionConfig = {
  baseUrl: string;
  environment: D365Environment;
  tenantId: string;
  clientId: string;
  clientSecretSet: boolean;
  serviceAccountEmail: string;
  pollCron: string;
  enabled: boolean;
  lastTest: { ok: true; at: string; latencyMs: number; environment: string } | { ok: false; at: string | null; message: string };
};

export type SaveD365ConnectionInput = {
  baseUrl: string;
  environment: D365Environment;
  tenantId: string;
  clientId: string;
  serviceAccountEmail: string;
  pollCron: string;
  enabled: boolean;
};

export type D365ConnectionState = 'ready' | 'loading' | 'empty' | 'error';

export type D365ConnectionActions = {
  saveD365Connection?: (input: SaveD365ConnectionInput) => Promise<{ ok: true } | { ok: false; code: string }>;
  rotateD365ClientSecret?: () => Promise<{ ok: true } | { ok: false; code: string }>;
  testD365Connection?: () => Promise<D365ConnectionResult>;
};

export type D365Labels = {
  title: string;
  subtitle: string;
  testConnection: string;
  save: string;
  rotateSecret: string;
  secretRotated: string;
  urlInvalid: string;
  loading: string;
  empty: string;
  error: string;
  sections?: {
    endpoint?: string;
  };
  fields?: {
    baseUrl?: string;
  };
  dialog?: {
    testTitle?: string;
    close?: string;
  };
  preflight?: {
    incomplete?: string;
    missingLabel?: string;
  };
};

/**
 * Five-constant enable gate. The D365 export adapter requires all five P1
 * reference constants (PRODUCTIONSITEID, APPROVERPERSONNELNUMBER,
 * CONSUMPTIONWAREHOUSEID, PRODUCTGROUPID, COSTINGOPERATIONRESOURCEID) to be set
 * before the integration may be enabled. `missing` lists the constant keys that
 * are still unset; when non-empty the enable toggle is fail-closed.
 */
export type D365ConstantPreflight = {
  complete: boolean;
  missing: string[];
};

type D365ConnectionFormProps = D365ConnectionActions & {
  state: D365ConnectionState;
  config: D365ConnectionConfig | null;
  labels: D365Labels;
  initialTestConnectionOpen?: boolean;
  preflight?: D365ConstantPreflight;
};

const prototypeSource = 'prototypes/design/Monopilot Design System/settings/admin-screens.jsx:27-103';

const d365ConnectionSchema = z.object({
  baseUrl: z
    .string()
    .url({ message: 'URL_INVALID' })
    .refine((value) => /^https:\/\/.+\.dynamics\.com(?:\/.*)?$/i.test(value), { message: 'URL_INVALID' }),
  environment: z.enum(['Production', 'Sandbox', 'Development']),
  tenantId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'Invalid UUID format.',
  }),
  clientId: z.string().min(8, { message: 'Too short.' }),
  serviceAccountEmail: z.string(),
  pollCron: z.string().regex(/^(\S+\s+){4}\S+$/, { message: 'Cron must have 5 space-separated fields.' }),
  enabled: z.boolean(),
});

function Root({ children, busy = false }: { children: React.ReactNode; busy?: boolean }) {
  return (
    <main
      data-testid="settings-d365-connection-screen"
      data-screen="d365_connection_screen"
      data-route="/settings/integrations/d365"
      data-prototype-source={prototypeSource}
      aria-busy={busy || undefined}
      className="space-y-4 p-6"
    >
      {children}
    </main>
  );
}

function PageHeader({
  labels,
  canSave,
  onTestConnection,
}: {
  labels: D365Labels;
  canSave: boolean;
  onTestConnection?: () => void;
}) {
  return (
    <header data-region="page-head" className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{labels.title}</h1>
        <p className="text-sm text-slate-600">{labels.subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          className="btn-secondary"
          form="d365-connection-form"
          data-modal-trigger="d365Test"
          onClick={onTestConnection}
        >
          {labels.testConnection}
        </Button>
        <Button type="submit" form="d365-connection-form" className="btn-primary" disabled={!canSave}>
          {labels.save}
        </Button>
      </div>
    </header>
  );
}

function StateCard({ labels, state }: { labels: D365Labels; state: 'loading' | 'empty' | 'error' }) {
  const message = state === 'loading' ? labels.loading : state === 'empty' ? labels.empty : labels.error;
  return (
    <Root busy={state === 'loading'}>
      <PageHeader labels={labels} canSave={false} />
      <Card className={state === 'error' ? 'border-red-200 bg-red-50' : 'bg-white'}>
        <CardContent className="p-4">
          {state === 'error' ? (
            <p role="alert" className="text-sm font-medium text-red-900">
              {message}
            </p>
          ) : (
            <p className="text-sm text-slate-700">{message}</p>
          )}
        </CardContent>
      </Card>
    </Root>
  );
}

function Section({ title, children }: { title: string; children: any }) {
  return (
    <Card data-testid="settings-d365-connection-section" className="sg-section bg-white">
      <CardHeader className="border-b px-4 py-3">
        <h2 className="text-base font-semibold">{title}</h2>
      </CardHeader>
      <CardContent className="px-4 py-0">{children}</CardContent>
    </Card>
  );
}

function Field({
  field,
  label: fieldLabel,
  hint,
  htmlFor,
  children,
  error,
}: {
  field: string;
  label: string;
  hint?: string;
  htmlFor: string;
  children: React.ReactNode;
  error?: string | null;
}) {
  return (
    <div data-field={field} className="grid gap-2 border-t border-slate-100 py-4 md:grid-cols-[210px_minmax(0,1fr)]">
      <div>
        <label htmlFor={htmlFor} className="text-sm font-medium text-slate-950">
          {fieldLabel}
        </label>
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

function TestConnectionDialog({
  open,
  onOpenChange,
  testD365Connection,
  environmentUrl,
  labels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  testD365Connection?: D365ConnectionActions['testD365Connection'];
  environmentUrl: string;
  labels: D365Labels;
}) {
  if (!open) return null;

  return (
    <D365TestConnectionModal
      key="SM-08-open"
      defaultOpen
      environmentUrl={environmentUrl}
      testConnection={testD365Connection ?? (async () => ({ status: 'error', reason: 'ERR_D365_CONNECTION_UNAVAILABLE' }))}
      onOpenChange={onOpenChange}
      title={labels.dialog?.testTitle ?? 'Test D365 connection'}
      closeLabel={labels.dialog?.close ?? 'Close'}
      cancelLabel={labels.dialog?.close ?? 'Cancel'}
      triggerLabel={labels.testConnection}
    />
  );
}

function ReadyD365ConnectionForm({
  config,
  labels,
  saveD365Connection,
  rotateD365ClientSecret,
  testD365Connection,
  initialTestConnectionOpen = false,
  preflight,
}: D365ConnectionActions & {
  config: D365ConnectionConfig;
  labels: D365Labels;
  initialTestConnectionOpen?: boolean;
  preflight?: D365ConstantPreflight;
}) {
  const [baseUrl, setBaseUrl] = React.useState(config.baseUrl);
  const [environment, setEnvironment] = React.useState<D365Environment>(config.environment);
  const [tenantId, setTenantId] = React.useState(config.tenantId);
  const [clientId, setClientId] = React.useState(config.clientId);
  const [secretPlaceholder, setSecretPlaceholder] = React.useState(config.clientSecretSet ? '●●●●●●●●●●●●' : '');
  const [serviceAccountEmail, setServiceAccountEmail] = React.useState(config.serviceAccountEmail);
  const [pollCron, setPollCron] = React.useState(config.pollCron);
  const [enabled, setEnabled] = React.useState(config.enabled);
  const [dialogOpen, setDialogOpen] = React.useState(initialTestConnectionOpen);
  const [toast, setToast] = React.useState<string | null>(null);

  const payload = { baseUrl, environment, tenantId, clientId, serviceAccountEmail, pollCron, enabled };
  const urlInvalid = baseUrl.trim() && !(baseUrl.startsWith('https://') && baseUrl.toLowerCase().includes('.dynamics.com')) ? labels.urlInvalid : null;
  const tenantInvalid = tenantId.trim() && !/^[0-9a-f-]{36}$/i.test(tenantId) ? 'Invalid UUID format.' : null;
  const clientInvalid = clientId.trim() && clientId.length < 8 ? 'Too short.' : null;
  const cronInvalid = pollCron.trim() && pollCron.trim().split(/\s+/).length !== 5 ? 'Cron must have 5 space-separated fields.' : null;
  const allValid = Boolean(baseUrl.trim() && tenantId.trim() && clientId.trim() && pollCron.trim()) && !urlInvalid && !tenantInvalid && !clientInvalid && !cronInvalid;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = d365ConnectionSchema.safeParse(payload);
    if (!next.success) return;
    await saveD365Connection?.(payload);
  }

  async function onRotateSecret() {
    const result = await rotateD365ClientSecret?.();
    if (!result || result.ok) {
      setSecretPlaceholder('');
      setToast(labels.secretRotated);
    }
  }

  // Five-constant enable gate: the integration cannot be enabled until all five
  // P1 D365 reference constants are present. The pre-flight test modal still
  // opens, but the toggle itself stays fail-closed when constants are missing.
  const constantsIncomplete = Boolean(preflight && !preflight.complete);
  const preflightWarning =
    labels.preflight?.incomplete ??
    'D365 cannot be enabled until all five reference constants are configured.';

  function onEnabledChange(next: boolean) {
    if (next && constantsIncomplete) {
      setDialogOpen(true);
      return;
    }
    if (next) setDialogOpen(true);
    setEnabled(next);
  }

  return (
    <Root>
      <PageHeader labels={labels} canSave={allValid} onTestConnection={() => setDialogOpen(true)} />
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <strong>LEGACY-D365.</strong> This integration will be retired when Monopilot replaces D365. Referenced by{' '}
        <span className="font-mono">integration.d365.so_trigger.enabled</span> (gates Planning SCREEN-13 + D365 Queue).
      </div>

      <form id="d365-connection-form" onSubmit={onSubmit} className="space-y-4">
        <Section title={labels.sections?.endpoint ?? 'Endpoint'}>
          <Field field="baseUrl" label={labels.fields?.baseUrl ?? 'Base URL'} htmlFor="d365-base-url" hint="e.g. https://apex.operations.dynamics.com" error={urlInvalid}>
            <Input
              id="d365-base-url"
              type="url"
              aria-label={labels.fields?.baseUrl ?? 'Base URL'}
              data-slot="input"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.currentTarget.value)}
              style={{ width: '100%', maxWidth: 420 }}
            />
          </Field>
          <Field field="environment" label="Environment" htmlFor="d365-environment">
            <Select value={environment} onValueChange={(value) => setEnvironment(value as D365Environment)}>
              <SelectTrigger aria-label="Environment">
                <SelectValue placeholder="Environment" />
              </SelectTrigger>
            </Select>
          </Field>
        </Section>

        <Section title="Authentication (Azure AD)">
          <Field field="tenantId" label="Tenant ID" htmlFor="d365-tenant-id" hint="UUID format, from Azure portal." error={tenantInvalid}>
            <Input
              id="d365-tenant-id"
              data-slot="input"
              value={tenantId}
              onChange={(event) => setTenantId(event.currentTarget.value)}
              className="font-mono"
              style={{ width: 360 }}
            />
          </Field>
          <Field field="clientId" label="Client ID" htmlFor="d365-client-id" hint="Azure App Registration client ID." error={clientInvalid}>
            <Input
              id="d365-client-id"
              data-slot="input"
              value={clientId}
              onChange={(event) => setClientId(event.currentTarget.value)}
              className="font-mono"
              style={{ width: 360 }}
            />
          </Field>
          <Field field="clientSecret" label="Client Secret" htmlFor="d365-client-secret" hint="Never shown after save. Use 'Rotate' to update.">
            <div className="flex items-center gap-2">
              <Input
                id="d365-client-secret"
                data-slot="input"
                type="password"
                readOnly
                value={secretPlaceholder}
                onChange={() => undefined}
                style={{ width: 200 }}
              />
              <Button type="button" className="btn-secondary btn-sm" onClick={onRotateSecret}>
                {labels.rotateSecret}
              </Button>
            </div>
          </Field>
          <Field field="serviceAccountEmail" label="Service account email" htmlFor="d365-service-account-email" hint="Fallback basic-auth identity.">
            <Input
              id="d365-service-account-email"
              type="email"
              data-slot="input"
              value={serviceAccountEmail}
              onChange={(event) => setServiceAccountEmail(event.currentTarget.value)}
              style={{ width: 320 }}
            />
          </Field>
        </Section>

        <Section title="Polling & sync">
          <Field field="pollCron" label="Pull cron schedule" htmlFor="d365-poll-cron" hint="Standard 5-field cron. Example: '0 2 * * *' = daily 02:00." error={cronInvalid}>
            <Input
              id="d365-poll-cron"
              data-slot="input"
              value={pollCron}
              onChange={(event) => setPollCron(event.currentTarget.value)}
              className="font-mono"
              style={{ width: 200 }}
            />
          </Field>
          <Field
            field="enabled"
            label="Integration enabled"
            htmlFor="d365-enabled"
            hint="Mirrors `integration.d365.enabled` flag. Pre-flight runs on toggle."
            error={constantsIncomplete ? preflightWarning : null}
          >
            <Switch
              id="d365-enabled"
              aria-label="Integration enabled"
              checked={enabled}
              onCheckedChange={onEnabledChange}
              disabled={constantsIncomplete}
            />
            {constantsIncomplete && preflight ? (
              <p data-testid="d365-constant-preflight" className="mt-2 text-xs text-amber-700">
                {(labels.preflight?.missingLabel ?? 'Missing D365 constants:')} {preflight.missing.join(', ')}
              </p>
            ) : null}
          </Field>
        </Section>

        <Section title="Last test">
          {config.lastTest.ok ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              ✓ Connected at <span className="font-mono">{config.lastTest.at}</span> · Latency{' '}
              <span className="font-mono">{config.lastTest.latencyMs}ms</span> · Env{' '}
              <span className="font-mono">{config.lastTest.environment}</span>
            </div>
          ) : (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
              ✗ Failed — run 'Test connection' to retry.
            </div>
          )}
        </Section>
      </form>

      <TestConnectionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        testD365Connection={testD365Connection}
        environmentUrl={baseUrl}
        labels={labels}
      />
      {toast ? (
        <p role="status" aria-live="polite" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {toast}
        </p>
      ) : null}
    </Root>
  );
}

export default function D365ConnectionForm({
  state,
  config,
  labels,
  saveD365Connection,
  rotateD365ClientSecret,
  testD365Connection,
  initialTestConnectionOpen,
  preflight,
}: D365ConnectionFormProps) {
  if (state === 'error') return <StateCard labels={labels} state="error" />;
  if (state === 'loading') return <StateCard labels={labels} state="loading" />;
  if (state === 'empty' || !config) return <StateCard labels={labels} state="empty" />;

  return (
    <ReadyD365ConnectionForm
      config={config}
      labels={labels}
      saveD365Connection={saveD365Connection}
      rotateD365ClientSecret={rotateD365ClientSecret}
      testD365Connection={testD365Connection}
      initialTestConnectionOpen={initialTestConnectionOpen}
      preflight={preflight}
    />
  );
}
