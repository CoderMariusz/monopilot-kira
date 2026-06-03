/**
 * @vitest-environment jsdom
 * T-076 / SET-110 — Integrations catalog screen RED tests.
 * Prototype source: prototypes/design/Monopilot Design System/settings/integrations.jsx:7-107.
 * RED scope: tests only; production page is intentionally not implemented here.
 */
import React from 'react';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// Default suites inject `categories`/`activity` directly, so the real loader is
// never invoked. Stub the module so importing page.tsx does not pull the DB /
// Supabase stack (pg, with-org-context) into the jsdom test environment. The
// dedicated loader-wiring suite below overrides this with `vi.doMock`.
vi.mock('./_data/load-integrations', () => ({
  loadIntegrations: vi.fn(async () => ({
    state: 'empty' as const,
    categories: [],
    syncSummary: { totalLast24h: 0, failedLast24h: 0 },
    activity: [],
  })),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, string | number>) => {
    const labels: Record<string, string> = {
      'settings.integrations.title': 'Integrations',
      'settings.integrations.subtitle':
        'D365 (Dynamics 365), Peppol e-invoicing and Developer API keys. Scope per 02-SETTINGS PRD §4 + §11.',
    };
    return (labels[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? `{${name}}`));
  }),
}));

type IntegrationItem = {
  id: string;
  name: string;
  description: string;
  status: 'connected' | 'available';
  logo: string;
  color: string;
};

type IntegrationCategory = {
  category: string;
  items: IntegrationItem[];
};

type SyncActivity = {
  id: string;
  when: string;
  integration: string;
  direction: string;
  records: number;
  status: 'success' | 'failed';
};

type IntegrationsPageProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<{ view?: string }>;
  state?: 'ready' | 'loading' | 'empty' | 'error';
  categories?: IntegrationCategory[];
  syncSummary?: { totalLast24h: number; failedLast24h: number };
  activity?: SyncActivity[];
};

type IntegrationsPage = (props: IntegrationsPageProps) => React.ReactNode | Promise<React.ReactNode>;

const categories: IntegrationCategory[] = [
  {
    category: 'ERP',
    items: [
      {
        id: 'd365',
        name: 'D365',
        description: 'Dynamics 365 finance, inventory, items, BOMs, and WO journals.',
        status: 'connected',
        logo: 'D',
        color: '#1d4ed8',
      },
      {
        id: 'sap-b1',
        name: 'SAP Business One',
        description: 'Optional ERP connector for smaller factories.',
        status: 'available',
        logo: 'S',
        color: '#0f766e',
      },
    ],
  },
  {
    category: 'Accounting',
    items: [
      {
        id: 'xero',
        name: 'Xero',
        description: 'Accounting sync for invoices and journals.',
        status: 'connected',
        logo: 'X',
        color: '#0284c7',
      },
    ],
  },
  {
    category: 'BI',
    items: [
      {
        id: 'power-bi',
        name: 'Power BI',
        description: 'Warehouse and production dashboards.',
        status: 'available',
        logo: 'P',
        color: '#ca8a04',
      },
    ],
  },
  {
    category: 'Shipping',
    items: [
      {
        id: 'shipstation',
        name: 'ShipStation',
        description: 'Carrier labels and shipment status.',
        status: 'available',
        logo: '🚚',
        color: '#7c3aed',
      },
    ],
  },
];

const activity: SyncActivity[] = [
  {
    id: 'a1',
    when: '14:02',
    integration: 'D365 · ItemEntity',
    direction: 'Inbound · Items (nightly refresh)',
    records: 142,
    status: 'success',
  },
  {
    id: 'a2',
    when: '11:15',
    integration: 'D365 · SalesOrderEntity',
    direction: 'Outbound · Shipment confirmed',
    records: 1,
    status: 'failed',
  },
];

async function loadIntegrationsPage(): Promise<IntegrationsPage> {
  try {
    const pageModulePath = './' + 'page.tsx';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    expect(
      mod.default,
      'SET-110 integrations page must default-export a renderable component at app/[locale]/(app)/(admin)/settings/integrations/page.tsx',
    ).toEqual(expect.any(Function));
    return mod.default as IntegrationsPage;
  } catch {
    return function MissingIntegrationsPage() {
      return React.createElement('main', { 'data-testid': 'missing-integrations-page' });
    };
  }
}

async function renderIntegrationsPage(overrides: Partial<IntegrationsPageProps> = {}) {
  const Page = await loadIntegrationsPage();
  const props: IntegrationsPageProps = {
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve({}),
    state: 'ready',
    categories,
    syncSummary: { totalLast24h: 1248, failedLast24h: 3 },
    activity,
    ...overrides,
  };

  const node = await Page(props);
  return { props, ...render(React.createElement(React.Fragment, null, node)) };
}

async function renderIntegrationsPageWithoutInjectedData() {
  const Page = await loadIntegrationsPage();
  const node = await Page({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) });
  return render(React.createElement(React.Fragment, null, node));
}

function screenRoot() {
  return screen.getByTestId('settings-integrations-screen');
}

describe('SET-110 integrations localized AppShell route contract', () => {
  it('defines the user-visible /en/settings/integrations route under the AppShell route group', () => {
    const canonicalRouteCandidates = [
      join(process.cwd(), 'apps/web/app/[locale]/(app)/(admin)/settings/integrations/page.tsx'),
      join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/integrations/page.tsx'),
    ];
    const legacyRouteCandidates = [
      join(process.cwd(), 'apps/web/app/[locale]/(admin)/settings/integrations/page.tsx'),
      join(process.cwd(), 'app/[locale]/(admin)/settings/integrations/page.tsx'),
    ];

    expect(
      canonicalRouteCandidates.some((candidate) => existsSync(candidate)),
      'SET-110 must implement /en/settings/integrations under app/[locale]/(app)/(admin) so AppShell/AppSidebar/AppTopbar wrap the page',
    ).toBe(true);
    expect(
      legacyRouteCandidates.some((candidate) => existsSync(candidate)),
      'Legacy body-only settings route must not be the only implementation',
    ).toBe(false);
  });
});

describe('SET-110 integrations prototype parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/en/settings/integrations');
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the default category-list layout with prototype regions, shadcn buttons, live KPI aggregates, and recent sync activity', async () => {
    await renderIntegrationsPage();

    const root = screenRoot();
    expect(root).toHaveAttribute('data-route', '/settings/integrations');
    expect(root).toHaveAttribute('data-screen', 'integrations_screen');
    expect(root).toHaveAttribute(
      'data-prototype-source',
      'prototypes/design/Monopilot Design System/settings/integrations.jsx:7-107',
    );
    expect(screen.getByRole('heading', { name: /^Integrations$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /browse all \(5\)/i })).toHaveAttribute('data-slot', 'button');

    const kpis = within(root).getAllByTestId('settings-integrations-kpi');
    expect(kpis.map((card) => card.textContent)).toEqual([
      expect.stringMatching(/Connected.*2/s),
      expect.stringMatching(/Categories.*4/s),
      expect.stringMatching(/Sync last 24h.*1,248/s),
      expect.stringMatching(/Failed syncs last 24h.*3/s),
    ]);
    expect(screen.queryByText(/D365 DLQ \(shipping\).*1/s)).not.toBeInTheDocument();

    const sections = within(root).getAllByTestId('settings-integrations-category-section');
    expect(
      sections.map((section) => within(section).getByRole('heading', { level: 2 }).getAttribute('id')?.replace('settings-integrations-', '')),
    ).toEqual(['erp', 'accounting', 'bi', 'shipping']);
    expect(sections.map((section) => within(section).getByRole('button', { expanded: true }).getAttribute('aria-label'))).toEqual([
      'ERP',
      'Accounting',
      'BI',
      'Shipping',
    ]);
    expect(within(sections[0]).getByText(/1 connected · 2 available/i)).toBeInTheDocument();
    expect(within(sections[0]).getByText('D365')).toBeInTheDocument();
    expect(within(sections[0]).getByRole('button', { name: /^Configure$/i })).toHaveAttribute('data-slot', 'button');
    expect(within(sections[0]).getByRole('button', { name: /^Connect$/i })).toHaveAttribute('data-slot', 'button');

    const activityRegion = screen.getByRole('region', { name: /recent sync activity/i });
    expect(within(activityRegion).getByRole('table')).toBeInTheDocument();
    expect(within(activityRegion).getByRole('columnheader', { name: 'When' })).toBeInTheDocument();
    expect(within(activityRegion).getByText('D365 · ItemEntity')).toBeInTheDocument();
    expect(within(activityRegion).getByText(/Failed · Retry backoff/i)).toBeInTheDocument();
  });

  it('does not render hardcoded connector catalog, sync activity, or KPI counts when no live integrations loader data is injected', async () => {
    await renderIntegrationsPageWithoutInjectedData();

    expect(
      screen.queryAllByTestId('settings-integrations-category-section'),
      'Default production render must be live-loader backed or an explicit placeholder; it must not fabricate connector status rows.',
    ).toHaveLength(0);
    expect(document.body).not.toHaveTextContent(/SAP Business One|Xero|Power BI|ShipStation|D365 · ItemEntity|14:02|11:15|1,248|142/i);
    expect(document.body).toHaveTextContent(/loading|no integrations|not configured|unavailable|placeholder|live data/i);
  });

  it('renders grid layout for view=grid and does not render the category list rows', async () => {
    window.history.replaceState(null, '', '/en/settings/integrations?view=grid');
    await renderIntegrationsPage({ searchParams: Promise.resolve({ view: 'grid' }) });

    const root = screenRoot();
    const grid = within(root).getByTestId('settings-integrations-grid');
    expect(root).toHaveAttribute('data-view', 'grid');
    expect(grid).toHaveAttribute('data-layout', 'grid');
    expect(screen.getByText(/2 connected · 5 available/i)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /search integrations/i }).parentElement).toHaveAttribute('data-slot', 'input');
    expect(within(grid).getAllByTestId('settings-integration-grid-card')).toHaveLength(5);
    expect(screen.queryByTestId('settings-integrations-category-section')).not.toBeInTheDocument();
  });

  it('renders loading, empty, and error states loudly instead of silently skipping unavailable catalog data', async () => {
    await renderIntegrationsPage({ state: 'loading', categories: [], activity: [] });
    expect(screen.getByTestId('settings-integrations-loading')).toHaveTextContent(/loading integrations/i);
    cleanup();

    await renderIntegrationsPage({ state: 'empty', categories: [], activity: [] });
    expect(screen.getByRole('heading', { name: /no integrations configured/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /browse catalog/i })).toHaveAttribute('data-slot', 'button');
    cleanup();

    await renderIntegrationsPage({ state: 'error', categories: [], activity: [] });
    expect(screen.getByRole('alert')).toHaveTextContent(/unable to load integrations/i);
  });

  it('preserves keyboard focus order without synthesizing fake dialog DOM when the Dialog primitive is unavailable', async () => {
    await renderIntegrationsPage();

    const root = screenRoot();
    // First focusable is the page-head action; each interactive category header
    // is an accordion toggle (button) followed by its row Connect/Configure
    // actions — no synthetic dialog DOM in the focus path.
    const focusables = Array.from(root.querySelectorAll<HTMLElement>('button, input, [href], [role="button"]')).filter(
      (element) => !element.hasAttribute('disabled'),
    );
    expect(focusables[0]?.textContent?.trim()).toMatch(/^Browse all \(5\)/);
    const toggles = focusables.filter((element) => element.getAttribute('aria-expanded') !== null);
    expect(toggles).toHaveLength(4);
    toggles.forEach((toggle) => expect(toggle.tagName).toBe('BUTTON'));

    const d365Row = screen.getByText('D365').closest('.int-row');
    expect(d365Row).not.toBeNull();
    expect(within(d365Row as HTMLElement).getByRole('button', { name: /^Configure$/i })).toHaveAttribute('data-slot', 'button');
    expect(root).toHaveAttribute('data-dialog-primitive', 'unavailable-in-ui-package');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="dialog-content"]')).not.toBeInTheDocument();
  });

  it('collapses and re-expands a category when its accordion header is toggled (client interactivity)', async () => {
    const user = userEvent.setup();
    await renderIntegrationsPage();

    const root = screenRoot();
    const erpSection = within(root)
      .getAllByTestId('settings-integrations-category-section')
      .find((section) => within(section).getByRole('heading', { level: 2 }).getAttribute('id') === 'settings-integrations-erp');
    expect(erpSection).toBeDefined();

    const toggle = within(erpSection as HTMLElement).getByRole('button', { name: 'ERP' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // Default expanded: D365 row visible.
    expect(within(erpSection as HTMLElement).getByText('D365')).toBeVisible();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const panel = (erpSection as HTMLElement).querySelector('[role="region"]');
    expect(panel).toHaveAttribute('hidden');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect((erpSection as HTMLElement).querySelector('[role="region"]')).not.toHaveAttribute('hidden');
  });
});

describe('SET-110 integrations real Supabase loader wiring', () => {
  afterEach(() => {
    cleanup();
    vi.resetModules();
  });

  it('renders the live loader result (no EMPTY_CATEGORIES fallback) when no props are injected', async () => {
    vi.resetModules();
    const loadIntegrations = vi.fn(async () => ({
      state: 'ready' as const,
      categories: [
        {
          category: 'ERP',
          items: [
            {
              id: 'd365',
              name: 'D365',
              description: 'Live D365 connection.',
              status: 'connected' as const,
              logo: 'D',
              color: '#1d4ed8',
            },
          ],
        },
        {
          category: 'Notifications',
          items: [
            {
              id: 'email-resend',
              name: 'Email (Resend)',
              description: 'Not configured yet.',
              status: 'available' as const,
              logo: 'M',
              color: '#0f766e',
            },
          ],
        },
      ],
      syncSummary: { totalLast24h: 7, failedLast24h: 2 },
      activity: [
        {
          id: 'run-1',
          when: '08:00',
          integration: 'D365 · ItemEntity',
          direction: 'Inbound',
          records: 5,
          status: 'success' as const,
        },
      ],
    }));

    vi.doMock('./_data/load-integrations', () => ({ loadIntegrations }));
    const mod = await import('./page.tsx');
    const Page = mod.default as IntegrationsPage;
    const node = await Page({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) });
    render(React.createElement(React.Fragment, null, node));

    expect(loadIntegrations).toHaveBeenCalledTimes(1);

    const root = screen.getByTestId('settings-integrations-screen');
    const kpis = within(root).getAllByTestId('settings-integrations-kpi');
    expect(kpis.map((card) => card.textContent)).toEqual([
      expect.stringMatching(/Connected.*1/s),
      expect.stringMatching(/Categories.*2/s),
      expect.stringMatching(/Sync last 24h.*7/s),
      expect.stringMatching(/Failed syncs last 24h.*2/s),
    ]);
    expect(within(root).getAllByTestId('settings-integrations-category-section')).toHaveLength(2);
    // Connector with no config is surfaced as a real "Available" state, not hidden.
    expect(within(root).getByText('Email (Resend)')).toBeInTheDocument();
    expect(screen.getByText('D365 · ItemEntity')).toBeInTheDocument();
  });

  it('renders the loud error state when the loader cannot resolve org context', async () => {
    vi.resetModules();
    const loadIntegrations = vi.fn(async () => ({
      state: 'error' as const,
      categories: [],
      syncSummary: { totalLast24h: 0, failedLast24h: 0 },
      activity: [],
    }));
    vi.doMock('./_data/load-integrations', () => ({ loadIntegrations }));
    const mod = await import('./page.tsx');
    const Page = mod.default as IntegrationsPage;
    const node = await Page({ params: Promise.resolve({ locale: 'en' }), searchParams: Promise.resolve({}) });
    render(React.createElement(React.Fragment, null, node));

    expect(loadIntegrations).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent(/unable to load integrations/i);
  });
});
