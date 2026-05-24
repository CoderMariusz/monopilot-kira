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

function screenRoot() {
  return screen.getByTestId('settings-integrations-screen');
}

function kpiByName(name: RegExp) {
  return screen.getByTestId(`settings-integrations-kpi-${name.source.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
}

function assertModalA11y(dialog: HTMLElement, name: RegExp) {
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(dialog).toHaveAccessibleName(name);
  expect(within(dialog).getByRole('button', { name: /close|cancel/i })).toBeInTheDocument();
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
    expect(sections.map((section) => within(section).getByRole('heading', { level: 2 }).textContent)).toEqual([
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

  it('renders grid layout for view=grid and does not render the category list rows', async () => {
    window.history.replaceState(null, '', '/en/settings/integrations?view=grid');
    await renderIntegrationsPage({ searchParams: Promise.resolve({ view: 'grid' }) });

    const root = screenRoot();
    const grid = within(root).getByTestId('settings-integrations-grid');
    expect(root).toHaveAttribute('data-view', 'grid');
    expect(grid).toHaveAttribute('data-layout', 'grid');
    expect(screen.getByText(/2 connected · 5 available/i)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /search integrations/i })).toHaveAttribute('data-slot', 'input');
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

  it('opens a shadcn Dialog from integration action triggers and preserves keyboard focus order', async () => {
    const user = userEvent.setup();
    await renderIntegrationsPage();

    const root = screenRoot();
    const focusableLabels = Array.from(root.querySelectorAll<HTMLElement>('button, input, [href], [role="button"]'))
      .filter((element) => !element.hasAttribute('disabled'))
      .map((element) => element.textContent?.trim() || element.getAttribute('aria-label') || element.getAttribute('placeholder'));
    expect(focusableLabels.slice(0, 4)).toEqual(['Browse all (5)', 'Configure', 'Connect', 'Configure']);

    await user.click(screen.getByRole('button', { name: /^Configure D365$/i }));
    const dialog = await screen.findByRole('dialog', { name: /configure d365/i });
    expect(dialog).toHaveAttribute('data-modal-id', 'SM-08');
    expect(dialog).toHaveAttribute('data-slot', 'dialog-content');
    assertModalA11y(dialog, /configure d365/i);
  });
});
