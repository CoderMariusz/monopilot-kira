/**
 * @vitest-environment jsdom
 * T-070 / SET-063 — Promotions screen RED tests.
 *
 * RED scope: tests only. These tests pin the normalized AppShell route,
 * promotions_screen parity, Admin-only access, and history tab filtering.
 */
import React from 'react';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type PromotionStage = {
  id: string;
  label: string;
  description: string;
  count: number;
};

type PromotionRecord = {
  id: string;
  artefact: string;
  from: 'L3-tenant' | 'L2-local';
  to: 'L2-local' | 'L1-core';
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'rolled_back';
  requester: string;
  affects: string;
  diff: string;
};

type TenantMigrationRow = {
  id: string;
  status: 'canary' | 'completed' | 'rolled_back' | 'scheduled';
  component: string;
  currentVersion: string;
  targetVersion: string;
  lastRunAt: string;
  scheduledBy: string;
};

type CallerAccess = {
  roleCodes: string[];
  permissions: string[];
};

type PromotionsPageProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
  callerAccess?: CallerAccess;
  promotionStages?: PromotionStage[];
  promotions?: PromotionRecord[];
  tenantMigrations?: TenantMigrationRow[];
  state?: 'ready' | 'loading' | 'empty' | 'error';
};

type PromotionsPage = (props: PromotionsPageProps) => React.ReactNode | Promise<React.ReactNode>;

const adminAccess: CallerAccess = {
  roleCodes: ['Admin'],
  permissions: ['settings.promotions.read', 'settings.promotions.approve'],
};

const nonAdminWithPermissionLikeRole: CallerAccess = {
  roleCodes: ['settings.promotions.approve', 'owner_candidate'],
  permissions: ['settings.promotions.read', 'settings.promotions.approve'],
};

const promotionStages: PromotionStage[] = [
  {
    id: 'L3-tenant',
    label: 'L3 · Tenant',
    description: 'Tenant-local overrides and sandbox changes.',
    count: 8,
  },
  {
    id: 'L2-local',
    label: 'L2 · Shared local',
    description: 'Shared local changes available to multiple tenant sites.',
    count: 3,
  },
  {
    id: 'L1-core',
    label: 'L1 · Core / universal',
    description: 'Universal Monopilot defaults requiring controlled review.',
    count: 1,
  },
];

const promotions: PromotionRecord[] = [
  {
    id: 'promo-001',
    artefact: 'rules.cycle_count_variance_v1',
    from: 'L3-tenant',
    to: 'L2-local',
    status: 'pending',
    requester: 'Alicja Admin',
    affects: '12 tenants',
    diff: 'variance_threshold 0.05 → 0.10',
  },
  {
    id: 'promo-002',
    artefact: 'email_templates.po_overdue_notice',
    from: 'L2-local',
    to: 'L1-core',
    status: 'approved',
    requester: 'Bogdan Owner',
    affects: 'all tenants',
    diff: 'subject template changed',
  },
];

const tenantMigrations: TenantMigrationRow[] = [
  {
    id: 'mig-canary-hidden',
    status: 'canary',
    component: 'schema',
    currentVersion: 'v8',
    targetVersion: 'v9',
    lastRunAt: '2026-05-23T08:15:00.000Z',
    scheduledBy: 'Canary Runner',
  },
  {
    id: 'mig-completed-visible',
    status: 'completed',
    component: 'rules_registry',
    currentVersion: 'v3',
    targetVersion: 'v4',
    lastRunAt: '2026-05-20T11:30:00.000Z',
    scheduledBy: 'Alicja Admin',
  },
  {
    id: 'mig-rolled-back-visible',
    status: 'rolled_back',
    component: 'email_templates',
    currentVersion: 'v1',
    targetVersion: 'v2',
    lastRunAt: '2026-05-10T14:45:00.000Z',
    scheduledBy: 'Ops Reviewer',
  },
  {
    id: 'mig-scheduled-hidden',
    status: 'scheduled',
    component: 'flags',
    currentVersion: 'v1',
    targetVersion: 'v2',
    lastRunAt: '2026-05-24T09:00:00.000Z',
    scheduledBy: 'Scheduler',
  },
];

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, string | number>) => {
    const labels: Record<string, string> = {
      title: 'Promotions',
      subtitle: 'Promote rules, flags, schema columns, and email templates across L3 → L2 → L1.',
      startPromotion: '+ Start promotion',
      activeTab: 'Active',
      historyTab: 'History',
      stageOverview: 'Promotion stages',
      activePromotions: 'Active promotions',
      historyTitle: 'Promotion history',
      loading: 'Loading promotions…',
      empty: 'No active promotions yet.',
      error: 'Unable to load promotions.',
      forbidden: 'Insufficient permissions',
    };
    return Object.entries(values ?? {}).reduce(
      (message, [name, replacement]) => message.replaceAll(`{${name}}`, String(replacement)),
      labels[key] ?? key,
    );
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

function routeExists() {
  return [
    join(process.cwd(), 'apps/web/app/[locale]/(app)/(admin)/settings/promotions/page.tsx'),
    join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/promotions/page.tsx'),
  ].some((candidate) => existsSync(candidate));
}

async function loadPromotionsPage(): Promise<PromotionsPage> {
  if (!routeExists()) {
    return function MissingPromotionsPage() {
      return React.createElement('main', { 'data-testid': 'missing-settings-promotions-page' });
    };
  }

  const pageModulePath = './page.tsx';
  const mod = await import(/* @vite-ignore */ pageModulePath);
  expect(mod.default, 'SET-063 promotions page must default-export a renderable React component').toEqual(
    expect.any(Function),
  );
  return mod.default as PromotionsPage;
}

async function renderPromotionsPage(overrides: Partial<PromotionsPageProps> = {}) {
  const Page = await loadPromotionsPage();
  const props: PromotionsPageProps = {
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve({}),
    callerAccess: adminAccess,
    promotionStages,
    promotions,
    tenantMigrations,
    state: 'ready',
    ...overrides,
  };

  const node = await Page(props);
  return { props, ...render(React.createElement(React.Fragment, null, node)) };
}

function promotionScreen() {
  return screen.getByTestId('settings-promotions-screen');
}

function structuralSnapshot() {
  return {
    regions: Array.from(document.querySelectorAll<HTMLElement>('[data-region]')).map((region) =>
      region.getAttribute('data-region'),
    ),
    actions: screen.getAllByRole('button').map((button) => button.textContent?.trim()).filter(Boolean),
    tabs: screen.queryAllByRole('tab').map((tab) => ({
      name: tab.textContent?.trim(),
      selected: tab.getAttribute('aria-selected'),
    })),
    cards: screen.queryAllByTestId('promotion-stage-card').map((card) => ({
      title: within(card).getByTestId('promotion-stage-label').textContent,
      count: within(card).getByTestId('promotion-stage-count').textContent,
    })),
    rows: screen.queryAllByTestId('promotion-row').map((row) => ({
      artefact: within(row).getByTestId('promotion-artefact').textContent,
      status: within(row).getByTestId('promotion-status').textContent,
      action: within(row).getByRole('button').textContent?.trim(),
    })),
  };
}

function assertPromoteModalA11y(dialog: HTMLElement, name: RegExp) {
  expect(dialog).toHaveAttribute('data-modal-id', 'SM-05');
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(dialog).toHaveAccessibleName(name);
  expect(within(dialog).getByRole('button', { name: /cancel/i })).toBeInTheDocument();
}

describe('SET-063 promotions AppShell route contract', () => {
  it('defines the user-visible localized AppShell route instead of only a legacy settings route', () => {
    const canonicalRouteCandidates = [
      join(process.cwd(), 'apps/web/app/[locale]/(app)/(admin)/settings/promotions/page.tsx'),
      join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/promotions/page.tsx'),
    ];
    const legacyRouteCandidates = [
      join(process.cwd(), 'apps/web/app/[locale]/(admin)/settings/promotions/page.tsx'),
      join(process.cwd(), 'app/[locale]/(admin)/settings/promotions/page.tsx'),
    ];

    expect(
      canonicalRouteCandidates.some((candidate) => existsSync(candidate)),
      'T-070 must implement /en/settings/promotions under app/[locale]/(app)/(admin) so AppShell/AppSidebar/AppTopbar wrap the page',
    ).toBe(true);
    expect(
      legacyRouteCandidates.some((candidate) => existsSync(candidate)),
      'Legacy body-only settings route must not be the only implementation',
    ).toBe(false);
  });
});

describe('SET-063 promotions_screen prototype parity and behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/en/settings/promotions');
  });

  afterEach(() => {
    cleanup();
  });

  it('renders stage cards, active rows, shadcn primitives, SM-05 triggers, disabled rules, and keyboard order', async () => {
    const user = userEvent.setup();
    await renderPromotionsPage();

    expect(promotionScreen()).toHaveAttribute('data-route', '/settings/promotions');
    expect(screen.getByRole('heading', { name: /^Promotions$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start promotion/i })).toHaveAttribute('data-slot', 'button');
    expect(screen.getByRole('tab', { name: /active/i })).toHaveAttribute('aria-selected', 'true');
    expect(document.querySelectorAll('[data-slot="card"]').length).toBeGreaterThanOrEqual(promotionStages.length);
    expect(document.querySelectorAll('[data-slot="badge"]').length).toBeGreaterThanOrEqual(promotions.length);
    expect(document.querySelectorAll('select')).toHaveLength(0);

    expect(structuralSnapshot()).toMatchInlineSnapshot(`
      {
        "actions": [
          "+ Start promotion",
          "View diff",
          "View diff",
        ],
        "cards": [
          {
            "count": "8",
            "title": "L3 · Tenant",
          },
          {
            "count": "3",
            "title": "L2 · Shared local",
          },
          {
            "count": "1",
            "title": "L1 · Core / universal",
          },
        ],
        "regions": [
          "page-head",
          "promotion-tabs",
          "promotion-stage-overview",
          "active-promotions",
        ],
        "rows": [
          {
            "action": "View diff",
            "artefact": "rules.cycle_count_variance_v1",
            "status": "pending",
          },
          {
            "action": "View diff",
            "artefact": "email_templates.po_overdue_notice",
            "status": "approved",
          },
        ],
        "tabs": [
          {
            "name": "Active",
            "selected": "true",
          },
          {
            "name": "History",
            "selected": "false",
          },
        ],
      }
    `);

    await user.click(screen.getByRole('button', { name: /start promotion/i }));
    const createDialog = screen.getByRole('dialog', { name: /start l1→l2→l3 promotion/i });
    assertPromoteModalA11y(createDialog, /start l1→l2→l3 promotion/i);
    expect(within(createDialog).getByText('Select artefact')).toHaveAttribute('aria-current', 'step');
    expect(within(createDialog).getByLabelText(/artefact to promote/i)).toHaveAttribute('data-slot', 'input');
    expect(within(createDialog).getByRole('combobox', { name: /target stage/i })).toHaveAttribute(
      'data-slot',
      'select-trigger',
    );
    expect(within(createDialog).getByRole('button', { name: /next: preview/i })).toBeDisabled();

    const focusableLabels: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      await user.tab();
      focusableLabels.push(
        document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim() ?? '',
      );
    }
    expect(focusableLabels).toEqual(['Artefact to promote', 'Target stage', 'Cancel']);

    await user.type(within(createDialog).getByLabelText(/artefact to promote/i), 'rules.new_variance');
    await user.click(within(createDialog).getByRole('button', { name: /next: preview/i }));
    expect(within(createDialog).getByText(/current \(before\)/i)).toBeInTheDocument();
    expect(within(createDialog).getByText(/target \(/i)).toBeInTheDocument();
    await user.click(within(createDialog).getByRole('button', { name: /next: confirm/i }));
    expect(within(createDialog).getByRole('textbox', { name: /justification/i })).toHaveAttribute(
      'data-slot',
      'textarea',
    );
    expect(within(createDialog).getByRole('button', { name: /submit promotion/i })).toBeDisabled();
    await user.type(within(createDialog).getByRole('textbox', { name: /justification/i }), 'Audit-ready reason');
    expect(within(createDialog).getByRole('button', { name: /submit promotion/i })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    await user.click(screen.getAllByRole('button', { name: /view diff/i })[0]);
    const diffDialog = screen.getByRole('dialog', { name: /promotion promo-001/i });
    assertPromoteModalA11y(diffDialog, /promotion promo-001/i);
    expect(within(diffDialog).getByDisplayValue('rules.cycle_count_variance_v1')).toBeInTheDocument();
  });

  it('renders explicit loading, empty, and error states without silently skipping parity states', async () => {
    await renderPromotionsPage({ state: 'loading', promotions: [] });
    expect(screen.getByRole('status')).toHaveTextContent(/loading promotions/i);
    cleanup();

    await renderPromotionsPage({ state: 'empty', promotions: [] });
    expect(screen.getByRole('status')).toHaveTextContent(/no active promotions/i);
    cleanup();

    await renderPromotionsPage({ state: 'error', promotions: [] });
    expect(screen.getByRole('alert')).toHaveTextContent(/unable to load promotions/i);
  });

  it("renders 403 with 'Insufficient permissions' for any non-Admin caller even if permission-like strings are present", async () => {
    await renderPromotionsPage({ callerAccess: nonAdminWithPermissionLikeRole });

    expect(screen.getByRole('heading', { name: /403/i })).toBeInTheDocument();
    expect(screen.getByText('Insufficient permissions')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start promotion/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /view diff/i })).not.toBeInTheDocument();
  });

  it("lists only tenant_migrations history rows with status IN ('completed','rolled_back') when tab=history", async () => {
    window.history.replaceState(null, '', '/en/settings/promotions?tab=history');
    await renderPromotionsPage({ searchParams: Promise.resolve({ tab: 'history' }) });

    expect(screen.getByRole('tab', { name: /history/i })).toHaveAttribute('aria-selected', 'true');
    const table = screen.getByRole('table', { name: /promotion history/i });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(table).getByText('mig-completed-visible')).toBeInTheDocument();
    expect(within(table).getByText('completed')).toBeInTheDocument();
    expect(within(table).getByText('mig-rolled-back-visible')).toBeInTheDocument();
    expect(within(table).getByText('rolled_back')).toBeInTheDocument();
    expect(screen.queryByText('mig-canary-hidden')).not.toBeInTheDocument();
    expect(screen.queryByText('mig-scheduled-hidden')).not.toBeInTheDocument();
  });
});
