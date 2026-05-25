/**
 * @vitest-environment jsdom
 * T-069 / SET-091 — Email template variables RED tests.
 *
 * Prototype source: prototypes/design/Monopilot Design System/settings/admin-screens.jsx:678-717.
 * RED scope: tests only; production page is intentionally not implemented here.
 */
import React from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => window.location.pathname,
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, string | number>) => {
    const labels: Record<string, string> = {
      title: 'Email template variables',
      subtitle: 'Merge fields available inside email templates (Mustache syntax).',
      guidance:
        'Click any variable to copy to clipboard. Variables are resolved per-trigger: PO variables only populate when the trigger payload is a PO.',
      searchPlaceholder: 'Search variable…',
      variable: 'Variable',
      description: 'Description',
      exampleValue: 'Example value',
      copy: 'Copy',
      copied: 'Copied {name} to clipboard',
      variablesCount: '{count} variables',
      loading: 'Loading email variables…',
      empty: 'No email variables are available yet.',
      error: 'Unable to load email variables.',
    };
    return (labels[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? `{${name}}`));
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    const labels: Record<string, string> = {
      title: 'Email template variables',
      subtitle: 'Merge fields available inside email templates (Mustache syntax).',
      guidance:
        'Click any variable to copy to clipboard. Variables are resolved per-trigger: PO variables only populate when the trigger payload is a PO.',
      searchPlaceholder: 'Search variable…',
      variable: 'Variable',
      description: 'Description',
      exampleValue: 'Example value',
      copy: 'Copy',
      copied: 'Copied {name} to clipboard',
      variablesCount: '{count} variables',
      loading: 'Loading email variables…',
      empty: 'No email variables are available yet.',
      error: 'Unable to load email variables.',
    };
    return (labels[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? `{${name}}`));
  },
}));

type EmailTemplateVariable = {
  name: string;
  desc: string;
  example: string;
};

type EmailTemplateVariableGroup = {
  group: string;
  vars: EmailTemplateVariable[];
};

type EmailVariablesPageProps = {
  params?: Promise<{ locale: string }>;
  state?: 'ready' | 'loading' | 'empty' | 'error';
  groups?: EmailTemplateVariableGroup[];
};

type EmailVariablesPage = (props: EmailVariablesPageProps) => React.ReactNode | Promise<React.ReactNode>;

const sourceDir = __dirname;

function repoRoot() {
  return process.cwd().endsWith('/apps/web') ? join(process.cwd(), '..', '..') : process.cwd();
}

const emailVariableGroups: EmailTemplateVariableGroup[] = [
  {
    group: 'Purchase order',
    vars: [
      { name: '{{order.number}}', desc: 'Purchase order number', example: 'PO-2026-00042' },
      { name: '{{order.total}}', desc: 'Gross order value', example: '€4,218.00' },
      { name: '{{supplier.name}}', desc: 'Purchase order supplier name', example: 'Apex Dairy Co.' },
    ],
  },
  {
    group: 'Quality',
    vars: [
      { name: '{{qa.release_status}}', desc: 'QA release status for the lot', example: 'Released' },
      { name: '{{lot.expiry_date}}', desc: 'Best-before date', example: '2026-09-30' },
    ],
  },
  {
    group: 'Shipping',
    vars: [{ name: '{{shipment.sscc}}', desc: 'SSCC-18 label number', example: '059012345678901234' }],
  },
];

async function loadEmailVariablesPage(): Promise<EmailVariablesPage> {
  const routePath = join(repoRoot(), 'apps/web/app/[locale]/(app)/(admin)/settings/email/variables/page.tsx');

  if (!existsSync(routePath)) {
    return function MissingEmailVariablesPage() {
      return React.createElement('main', { 'data-testid': 'missing-email-variables-page' });
    };
  }

  const pageModulePath = './page.tsx';
  const mod = await import(/* @vite-ignore */ pageModulePath);
  expect(
    mod.default,
    'T-069 email variables page must default-export a renderable React component at app/[locale]/(app)/(admin)/settings/email/variables/page.tsx',
  ).toEqual(expect.any(Function));
  return mod.default as EmailVariablesPage;
}

async function renderEmailVariablesPage(overrides: Partial<EmailVariablesPageProps> = {}) {
  const Page = await loadEmailVariablesPage();
  const props: EmailVariablesPageProps = {
    params: Promise.resolve({ locale: 'en' }),
    state: 'ready',
    groups: emailVariableGroups,
    ...overrides,
  };

  const node = await Page(props);
  return { props, ...render(React.createElement(React.Fragment, null, node)) };
}

function screenRoot() {
  return screen.getByTestId('settings-email-variables-screen');
}

function variableRows() {
  return within(screenRoot()).getAllByTestId('settings-email-variable-row');
}

function variableNames() {
  return variableRows().map((row) => within(row).getByTestId('settings-email-variable-name').textContent?.trim());
}

function structuralSnapshot() {
  const root = screenRoot();
  return {
    prototypeSource: root.getAttribute('data-prototype-source'),
    route: root.getAttribute('data-route'),
    screen: root.getAttribute('data-screen'),
    regions: Array.from(root.querySelectorAll<HTMLElement>('[data-region]')).map((region) =>
      region.getAttribute('data-region'),
    ),
    sections: within(root)
      .getAllByTestId('settings-email-variable-group')
      .map((section) => within(section).getByRole('heading', { level: 2 }).textContent),
    groupCounts: within(root)
      .getAllByTestId('settings-email-variable-count')
      .map((count) => count.textContent),
    tableHeaders: within(root).getAllByRole('columnheader').map((header) => header.textContent),
    variables: variableNames(),
  };
}

describe('T-069 email variables localized AppShell route contract', () => {
  it('defines the user-visible /en/settings/email/variables route under the AppShell route group', () => {
    const canonicalRoute = join(repoRoot(), 'apps/web/app/[locale]/(app)/(admin)/settings/email/variables/page.tsx');
    const legacyRoute = join(repoRoot(), 'apps/web/app/[locale]/(admin)/settings/email/variables/page.tsx');

    expect(
      existsSync(canonicalRoute),
      'T-069 must implement /en/settings/email/variables under app/[locale]/(app)/(admin) so AppShell/AppSidebar/AppTopbar wrap the page',
    ).toBe(true);
    expect(existsSync(legacyRoute), 'Legacy body-only settings route must not be the only implementation').toBe(false);
  });

  it('keeps page.tsx server-rendered and isolates browser state in a client component', () => {
    const pageSource = readFileSync(join(sourceDir, 'page.tsx'), 'utf8');
    const clientSource = readFileSync(join(sourceDir, 'email-variables-screen.client.tsx'), 'utf8');

    expect(pageSource).not.toMatch(/^['"]use client['"]/m);
    expect(pageSource).not.toContain('React.useState');
    expect(pageSource).not.toContain('globalThis.vi');
    expect(pageSource).toContain("from './email-variables-screen.client'");
    expect(clientSource).toMatch(/^['"]use client['"]/m);
    expect(clientSource).toContain('navigator.clipboard.writeText(name)');
    expect(clientSource).not.toContain('globalThis.vi');
  });
});

describe('T-069 email_variables_screen prototype parity and interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    window.history.replaceState(null, '', '/en/settings/email/variables');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => undefined) },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the SET-091 prototype regions, guidance, search input, grouped cards, table columns, copy buttons, and focus order', async () => {
    const user = userEvent.setup({ writeToClipboard: false });
    await renderEmailVariablesPage();

    expect(screenRoot()).toHaveAttribute('data-route', '/settings/email/variables');
    expect(screenRoot()).toHaveAttribute('data-screen', 'email_variables_screen');
    expect(screenRoot()).toHaveAttribute(
      'data-prototype-source',
      'prototypes/design/Monopilot Design System/settings/admin-screens.jsx:678-717',
    );
    expect(screen.getByRole('heading', { name: /^Email template variables$/i })).toBeInTheDocument();
    expect(screen.getByText(/merge fields available inside email templates/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/click any variable to copy to clipboard/i);

    const search = screen.getByRole('searchbox', { name: /search variable/i });
    expect(search).toHaveAttribute('placeholder', 'Search variable…');
    expect(search).toHaveAttribute('data-slot', 'input');
    expect(document.querySelectorAll('[data-slot="card"]').length).toBe(emailVariableGroups.length);
    expect(document.querySelectorAll('[data-slot="table"]').length).toBe(emailVariableGroups.length);
    expect(screen.getAllByRole('button', { name: /^Copy$/i })).toHaveLength(6);
    screen.getAllByRole('button', { name: /^Copy$/i }).forEach((button) => {
      expect(button).toBeEnabled();
      expect(button).toHaveAttribute('data-slot', 'button');
    });

    expect(structuralSnapshot()).toMatchInlineSnapshot(`
      {
        "groupCounts": [
          "3 variables",
          "2 variables",
          "1 variables",
        ],
        "prototypeSource": "prototypes/design/Monopilot Design System/settings/admin-screens.jsx:678-717",
        "regions": [
          "page-head",
          "copy-guidance",
          "search",
          "variables-grid",
        ],
        "route": "/settings/email/variables",
        "screen": "email_variables_screen",
        "sections": [
          "Purchase order",
          "Quality",
          "Shipping",
        ],
        "tableHeaders": [
          "Variable",
          "Description",
          "Example value",
          "",
          "Variable",
          "Description",
          "Example value",
          "",
          "Variable",
          "Description",
          "Example value",
          "",
        ],
        "variables": [
          "{{order.number}}",
          "{{order.total}}",
          "{{supplier.name}}",
          "{{qa.release_status}}",
          "{{lot.expiry_date}}",
          "{{shipment.sscc}}",
        ],
      }
    `);

    await user.tab();
    expect(search).toHaveFocus();
    await user.tab();
    expect(within(variableRows()[0]).getByRole('button', { name: /^Copy$/i })).toHaveFocus();
    await user.tab();
    expect(within(variableRows()[1]).getByRole('button', { name: /^Copy$/i })).toHaveFocus();
  });

  it("filters the grid by variable name when Search='order' and does not match description-only text", async () => {
    const user = userEvent.setup({ writeToClipboard: false });
    await renderEmailVariablesPage();

    await user.type(screen.getByRole('searchbox', { name: /search variable/i }), 'order');

    expect(variableNames()).toEqual(['{{order.number}}', '{{order.total}}']);
    expect(screen.queryByText('{{supplier.name}}')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^Quality$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^Shipping$/i })).not.toBeInTheDocument();
  });

  it('copies the clicked variable name to navigator.clipboard and renders a toast/status message', async () => {
    const user = userEvent.setup({ writeToClipboard: false });
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    await renderEmailVariablesPage();

    const orderNumberRow = variableRows().find((row) => within(row).queryByText('{{order.number}}'));
    expect(orderNumberRow, 'The {{order.number}} variable row must render before copy can be exercised').toBeTruthy();
    await user.click(within(orderNumberRow as HTMLElement).getByRole('button', { name: /^Copy$/i }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('{{order.number}}');
    expect(await screen.findByRole('status')).toHaveTextContent(/copied \{\{order\.number\}\} to clipboard/i);
  });

  it('renders loading, empty, and error states loudly without silently skipping data preconditions', async () => {
    await renderEmailVariablesPage({ state: 'loading', groups: [] });
    expect(screen.getByTestId('settings-email-variables-loading')).toHaveTextContent(/loading email variables/i);
    cleanup();

    await renderEmailVariablesPage({ state: 'empty', groups: [] });
    expect(screen.getByText(/no email variables are available yet/i)).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: /search variable/i })).toHaveAttribute('data-slot', 'input');
    cleanup();

    await renderEmailVariablesPage({ state: 'error', groups: [] });
    expect(screen.getByRole('alert')).toHaveTextContent(/unable to load email variables/i);
  });
});
