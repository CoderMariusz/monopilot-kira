/**
 * @vitest-environment jsdom
 * T-061 / SET-080 — D365 connection screen RED tests.
 * Prototype source: prototypes/design/Monopilot Design System/settings/admin-screens.jsx:27-103.
 * RED scope: tests only; production page is intentionally not implemented here.
 */
import React from 'react';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, string | number>) => {
    const labels: Record<string, string> = {
      'settings.integrations.d365.connection.title': 'D365 connection',
      'settings.integrations.d365.connection.subtitle':
        'Dynamics 365 Finance & Operations — endpoint, auth, polling schedule.',
      'settings.integrations.d365.connection.testConnection': 'Test connection',
      'settings.integrations.d365.connection.save': 'Save configuration',
      'settings.integrations.d365.connection.rotateSecret': 'Rotate secret',
      'settings.integrations.d365.connection.secretRotated': 'D365 client secret rotated',
      'settings.integrations.d365.connection.urlInvalid': 'URL_INVALID',
      'settings.integrations.d365.connection.loading': 'Loading D365 connection…',
      'settings.integrations.d365.connection.empty': 'D365 connection is not configured.',
      'settings.integrations.d365.connection.error': 'Unable to load D365 connection.',
    };
    return (labels[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? `{${name}}`));
  }),
}));

const { testD365ConnectionActionMock } = vi.hoisted(() => ({
  testD365ConnectionActionMock: vi.fn(async () => ({ ok: true as const })),
}));

vi.mock('../../../../../../../actions/d365/test-connection', () => ({
  testD365Connection: testD365ConnectionActionMock,
}));

type D365ConnectionConfig = {
  baseUrl: string;
  environment: 'Production' | 'Sandbox' | 'Development';
  tenantId: string;
  clientId: string;
  clientSecretSet: boolean;
  serviceAccountEmail: string;
  pollCron: string;
  enabled: boolean;
  lastTest: { ok: true; at: string; latencyMs: number; environment: string } | { ok: false; at: string | null; message: string };
};

type D365ConnectionTestResult =
  | { status: 'ok'; latencyMs: number; environment: string }
  | { status: 'error'; reason: string };

type SaveD365ConnectionInput = {
  baseUrl: string;
  environment: 'Production' | 'Sandbox' | 'Development';
  tenantId: string;
  clientId: string;
  serviceAccountEmail: string;
  pollCron: string;
  enabled: boolean;
};

type D365ConnectionPageProps = {
  params?: Promise<{ locale: string }>;
  state?: 'ready' | 'loading' | 'empty' | 'error';
  config?: D365ConnectionConfig | null;
  saveD365Connection?: (input: SaveD365ConnectionInput) => Promise<{ ok: true } | { ok: false; code: string }>;
  rotateD365ClientSecret?: () => Promise<{ ok: true } | { ok: false; code: string }>;
  testD365Connection?: () => Promise<D365ConnectionTestResult>;
};

type D365ConnectionPage = (props: D365ConnectionPageProps) => React.ReactNode | Promise<React.ReactNode>;

const d365Config: D365ConnectionConfig = {
  baseUrl: 'https://apex.operations.dynamics.com',
  environment: 'Production',
  tenantId: '7b6a5d44-4c39-4f2e-95a2-3263db0dd4d3',
  clientId: 'client-app-123456',
  clientSecretSet: true,
  serviceAccountEmail: 'd365-service@apex.example',
  pollCron: '0 2 * * *',
  enabled: true,
  lastTest: { ok: true, at: '2026-05-20T14:02:00.000Z', latencyMs: 138, environment: 'Production' },
};

const d365EnvKeys = [
  'D365_BASE_URL',
  'NEXT_PUBLIC_D365_BASE_URL',
  'D365_TENANT_ID',
  'D365_CLIENT_ID',
  'D365_CLIENT_SECRET_REF',
  'D365_CLIENT_SECRET_SET',
  'D365_SERVICE_ACCOUNT_EMAIL',
  'D365_POLL_CRON',
  'D365_ENABLED',
  'D365_ENVIRONMENT',
  'D365_OAUTH_BEARER',
] as const;

function withRuntimeD365Env(values: Partial<Record<(typeof d365EnvKeys)[number], string>>) {
  const previous = new Map<(typeof d365EnvKeys)[number], string | undefined>();
  for (const key of d365EnvKeys) {
    previous.set(key, process.env[key]);
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      const value = values[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }

  return () => {
    for (const key of d365EnvKeys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

async function loadD365ConnectionPage(): Promise<D365ConnectionPage> {
  const routeCandidates = [
    join(process.cwd(), 'apps/web/app/[locale]/(app)/(admin)/settings/integrations/d365/page.tsx'),
    join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/integrations/d365/page.tsx'),
  ];

  if (!routeCandidates.some((routePath) => existsSync(routePath))) {
    return function MissingD365ConnectionPage() {
      return React.createElement('main', { 'data-testid': 'missing-d365-connection-page' });
    };
  }

  const pageModulePath = './page.tsx';
  const mod = await import(/* @vite-ignore */ pageModulePath);
  expect(mod.default, 'T-061 D365 connection page must default-export a renderable React component').toEqual(
    expect.any(Function),
  );
  return mod.default as D365ConnectionPage;
}

async function renderD365ConnectionPage(overrides: Partial<D365ConnectionPageProps> = {}) {
  const Page = await loadD365ConnectionPage();
  const props: D365ConnectionPageProps = {
    params: Promise.resolve({ locale: 'en' }),
    state: 'ready',
    config: d365Config,
    saveD365Connection: vi.fn(async () => ({ ok: true as const })),
    rotateD365ClientSecret: vi.fn(async () => ({ ok: true as const })),
    testD365Connection: vi.fn(async () => ({ status: 'ok' as const, latencyMs: 138, environment: 'Production' })),
    ...overrides,
  };

  const node = await Page(props);
  return { props, ...render(React.createElement(React.Fragment, null, node)) };
}

function connectionScreen() {
  return screen.getByTestId('settings-d365-connection-screen');
}

function sectionTitles() {
  return within(connectionScreen())
    .getAllByTestId('settings-d365-connection-section')
    .map((section) => within(section).getByRole('heading', { level: 2 }).textContent);
}

function fieldContainer(input: HTMLElement) {
  return input.closest('[data-field]') ?? input.parentElement ?? document.body;
}

function assertModalA11y(dialog: HTMLElement, name: RegExp) {
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(dialog).toHaveAccessibleName(name);
  expect(within(dialog).getByRole('button', { name: /close|cancel/i })).toBeInTheDocument();
}

describe('T-061 D365 connection localized AppShell route contract', () => {
  it('defines the user-visible /en/settings/integrations/d365 route under the AppShell route group only', () => {
    const canonicalRouteCandidates = [
      join(process.cwd(), 'apps/web/app/[locale]/(app)/(admin)/settings/integrations/d365/page.tsx'),
      join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/integrations/d365/page.tsx'),
    ];
    const legacyRouteCandidates = [
      join(process.cwd(), 'apps/web/app/[locale]/(admin)/settings/integrations/d365/page.tsx'),
      join(process.cwd(), 'app/[locale]/(admin)/settings/integrations/d365/page.tsx'),
    ];

    expect(
      canonicalRouteCandidates.some((candidate) => existsSync(candidate)),
      'T-061 must implement /en/settings/integrations/d365 under app/[locale]/(app)/(admin) so AppShell/AppSidebar/AppTopbar wrap the page',
    ).toBe(true);
    expect(
      legacyRouteCandidates.some((candidate) => existsSync(candidate)),
      'Legacy body-only settings route must not be the only implementation',
    ).toBe(false);
  });
});

describe('T-061 D365 connection prototype parity and behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/en/settings/integrations/d365');
  });

  afterEach(() => {
    cleanup();
  });

  it('renders prototype regions, fields, shadcn primitives, action order, d365Test modal trigger, and keyboard order', async () => {
    const user = userEvent.setup();
    await renderD365ConnectionPage();

    const root = connectionScreen();
    expect(root).toHaveAttribute('data-route', '/settings/integrations/d365');
    expect(root).toHaveAttribute('data-screen', 'd365_connection_screen');
    expect(root).toHaveAttribute(
      'data-prototype-source',
      'prototypes/design/Monopilot Design System/settings/admin-screens.jsx:27-103',
    );
    expect(screen.getByRole('heading', { name: /^D365 connection$/i })).toBeInTheDocument();
    expect(screen.getByText(/Dynamics 365 Finance & Operations/i)).toBeInTheDocument();
    expect(screen.getByText(/LEGACY-D365/i)).toBeInTheDocument();
    expect(screen.getByText(/integration\.d365\.so_trigger\.enabled/i)).toBeInTheDocument();

    expect(sectionTitles()).toEqual(['Endpoint', 'Authentication (Azure AD)', 'Polling & sync', 'Last test']);
    expect(screen.getByRole('textbox', { name: /base url/i })).toHaveAttribute('type', 'url');
    expect(screen.getByRole('textbox', { name: /base url/i })).toHaveAttribute('data-slot', 'input');
    expect(screen.getByRole('combobox', { name: /environment/i })).toHaveAttribute('data-slot', 'select-trigger');
    expect(screen.getByRole('textbox', { name: /tenant id/i })).toHaveValue(d365Config.tenantId);
    expect(screen.getByRole('textbox', { name: /client id/i })).toHaveValue(d365Config.clientId);
    expect(screen.getByLabelText(/client secret/i)).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: /rotate secret/i })).toHaveAttribute('data-slot', 'button');
    expect(screen.getByRole('textbox', { name: /service account email/i })).toHaveAttribute('type', 'email');
    expect(screen.getByRole('textbox', { name: /pull cron schedule/i })).toHaveValue('0 2 * * *');
    expect(screen.getByRole('switch', { name: /integration enabled/i })).toHaveAttribute('data-slot', 'switch');
    expect(screen.getByText(/Connected at/i)).toHaveTextContent(/Latency.*138ms.*Env.*Production/s);

    const buttons = within(root).getAllByRole('button').map((button) => button.textContent?.trim()).filter(Boolean);
    expect(buttons.slice(0, 3)).toEqual(['Test connection', 'Save configuration', 'Rotate secret']);
    expect(screen.getByRole('button', { name: /save configuration/i })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /test connection/i }));
    const dialog = await screen.findByRole('dialog', { name: /test d365 connection|test connection/i });
    expect(dialog).toHaveAttribute('data-modal-id', 'd365Test');
    assertModalA11y(dialog, /test d365 connection|test connection/i);
    await user.keyboard('{Escape}');

    await user.tab();
    expect(screen.getByRole('button', { name: /test connection/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /save configuration/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('textbox', { name: /base url/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('combobox', { name: /environment/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('textbox', { name: /tenant id/i })).toHaveFocus();
  });

  it('opens the shared SM-08 diagnostics modal from the route, calls the real test action, and renders async provenance without secrets', async () => {
    const user = userEvent.setup();
    let resolveConnection!: (value: D365ConnectionTestResult) => void;
    const testD365Connection = vi.fn(
      () =>
        new Promise<D365ConnectionTestResult>((resolve) => {
          resolveConnection = resolve;
        }),
    );
    await renderD365ConnectionPage({ testD365Connection });

    await user.click(screen.getByRole('button', { name: /^Test connection$/i }));

    await waitFor(() => expect(testD365Connection).toHaveBeenCalledTimes(1));
    const dialog = await screen.findByRole('dialog', { name: /test d365 connection|test connection/i });
    expect(dialog).toHaveAttribute('data-modal-id', 'SM-08');
    expect(within(dialog).getByRole('status', { name: /connecting to d365 environment/i })).toHaveTextContent(
      d365Config.baseUrl,
    );
    expect(document.body).not.toHaveTextContent(/client-secret|super-secret|oauth|bearer/i);

    resolveConnection({ status: 'ok', latencyMs: 238, environment: 'Production' });
    expect(await within(dialog).findByText(/connection successful/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/latency:/i)).toHaveTextContent(/238ms.*Production/);
  });

  it("surfaces inline Zod URL_INVALID and disables Save when Base URL does not contain 'dynamics.com'", async () => {
    const user = userEvent.setup();
    await renderD365ConnectionPage();

    const baseUrl = screen.getByRole('textbox', { name: /base url/i });
    const save = screen.getByRole('button', { name: /save configuration/i });
    expect(save).toBeEnabled();

    await user.clear(baseUrl);
    await user.type(baseUrl, 'https://example.com');
    await user.tab();

    await waitFor(() => expect(save).toBeDisabled());
    expect(within(fieldContainer(baseUrl) as HTMLElement).getByText('URL_INVALID')).toBeVisible();
  });

  it('clears the password field, calls rotate action, and renders a success toast without exposing plaintext', async () => {
    const user = userEvent.setup();
    const rotateD365ClientSecret = vi.fn(async () => ({ ok: true as const }));
    await renderD365ConnectionPage({ rotateD365ClientSecret });

    const secretInput = screen.getByLabelText(/client secret/i) as HTMLInputElement;
    expect(secretInput).toHaveAttribute('type', 'password');
    expect(secretInput.value).toMatch(/[●•*]/);
    expect(screen.queryByText(/super-secret|client-secret|plaintext/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /rotate secret/i }));

    await waitFor(() => expect(rotateD365ClientSecret).toHaveBeenCalledTimes(1));
    expect(secretInput).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent(/secret rotated|D365 client secret rotated/i);
    expect(document.body).not.toHaveTextContent(/super-secret|client-secret|plaintext/i);
  });

  it('renders loading, empty, and error states with the same root screen contract', async () => {
    await renderD365ConnectionPage({ state: 'loading', config: null });
    expect(connectionScreen()).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText(/Loading D365 connection/i)).toBeVisible();
    cleanup();

    await renderD365ConnectionPage({ state: 'empty', config: null });
    expect(connectionScreen()).toHaveTextContent(/D365 connection is not configured/i);
    cleanup();

    await renderD365ConnectionPage({ state: 'error', config: null });
    expect(connectionScreen()).toHaveTextContent(/Unable to load D365 connection/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/Unable to load D365 connection/i);
  });

  it('uses the existing d365 test-connection action path when the route supplies no test override', async () => {
    const restoreEnv = withRuntimeD365Env({
      D365_BASE_URL: d365Config.baseUrl,
      D365_TENANT_ID: d365Config.tenantId,
      D365_CLIENT_ID: d365Config.clientId,
      D365_CLIENT_SECRET_SET: 'true',
      D365_SERVICE_ACCOUNT_EMAIL: d365Config.serviceAccountEmail,
      D365_POLL_CRON: d365Config.pollCron,
      D365_ENABLED: 'true',
      D365_ENVIRONMENT: 'Production',
      D365_OAUTH_BEARER: 'redacted-test-bearer',
    });
    try {
      const user = userEvent.setup();
      const Page = await loadD365ConnectionPage();
      const node = await Page({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) });
      render(React.createElement(React.Fragment, null, node));

      await user.click(screen.getByRole('button', { name: /^Test connection$/i }));

      await waitFor(() => expect(testD365ConnectionActionMock).toHaveBeenCalledTimes(1));
      expect(testD365ConnectionActionMock).toHaveBeenCalledWith({
        baseUrl: d365Config.baseUrl,
        oauthBearer: expect.any(String),
      });
      expect(await screen.findByRole('dialog', { name: /test d365 connection|test connection/i })).toHaveAttribute(
        'data-modal-id',
        'SM-08',
      );
      expect(document.body).not.toHaveTextContent(/redacted-test-bearer|D365_OAUTH_BEARER|bearer/i);
    } finally {
      restoreEnv();
    }
  });

  it('keeps D365 controls visible but fail-closed and explicit when runtime prerequisites are missing', async () => {
    const restoreEnv = withRuntimeD365Env({});
    try {
      const Page = await loadD365ConnectionPage();
      const node = await Page({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) });
      render(React.createElement(React.Fragment, null, node));

      expect(connectionScreen()).toHaveTextContent(/D365 connection is not configured|missing/i);
      expect(screen.getByRole('button', { name: /^Test connection$/i })).toBeEnabled();
      expect(screen.getByRole('button', { name: /^Save configuration$/i })).toBeDisabled();
      expect(screen.getByRole('textbox', { name: /base url/i })).toBeDisabled();
      expect(screen.getByRole('combobox', { name: /environment/i })).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByRole('textbox', { name: /tenant id/i })).toBeDisabled();
      expect(screen.getByRole('textbox', { name: /client id/i })).toBeDisabled();
      expect(screen.getByRole('switch', { name: /integration enabled/i })).toBeDisabled();
      expect(screen.getByRole('alert')).toHaveTextContent(/D365.*(prerequisite|configuration|environment|missing)/i);
      expect(document.body).not.toHaveTextContent(/settings\./i);
    } finally {
      restoreEnv();
    }
  });
});
