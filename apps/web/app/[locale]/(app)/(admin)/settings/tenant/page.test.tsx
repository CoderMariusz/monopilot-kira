/**
 * @vitest-environment jsdom
 * T-100 / SET-060 — Tenant Variations Dashboard RED tests.
 * Source of truth: prototypes/design/02-SETTINGS-UX.md SET-060 / tenant-variations.
 * RED scope: tests only; production page is intentionally not implemented here.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const routerPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

type DeptOverride = {
  id: string;
  action: 'split' | 'merge' | 'add';
  source?: string;
  targets: string[];
  columnCount: number;
  updatedAt: string;
  updatedBy: string;
};

type RuleVariantOverride = {
  code: string;
  currentVariant: string;
  availableVariants: string[];
  lastChangedAt: string | null;
};

type AuthorizationPolicySummary = {
  code: 'npd_post_release_edit' | 'technical_product_spec_approval';
  label: string;
  description: string;
  status: 'Enabled' | 'Misconfigured' | 'Disabled';
  updatedAt: string | null;
};

type TenantVariationsDashboardProps = {
  params?: Promise<{ locale: string }>;
  state?: 'ready' | 'loading' | 'empty' | 'error' | 'permission_denied';
  deptOverrides?: DeptOverride[];
  ruleVariantOverrides?: RuleVariantOverride[];
  schemaExtensionsL3?: number;
  lastUpgradeAt?: string | null;
  authorizationPolicies?: AuthorizationPolicySummary[];
  featureFlags?: Array<{ code: string; description: string; enabled: boolean }>;
};

type TenantVariationsDashboardPage = (
  props: TenantVariationsDashboardProps,
) => React.ReactNode | Promise<React.ReactNode>;

const deptOverrides: DeptOverride[] = [
  {
    id: 'dept-split-technical',
    action: 'split',
    source: 'technical',
    targets: ['technical-rd', 'technical-qa'],
    columnCount: 8,
    updatedAt: '2026-05-20T09:00:00.000Z',
    updatedBy: 'Jane QA',
  },
  {
    id: 'dept-merge-finance',
    action: 'merge',
    source: 'price',
    targets: ['finance'],
    columnCount: 3,
    updatedAt: '2026-05-21T11:30:00.000Z',
    updatedBy: 'Owner Admin',
  },
];

const ruleVariantOverrides: RuleVariantOverride[] = [
  {
    code: 'wo_release_gate',
    currentVariant: 'v2',
    availableVariants: ['v1', 'v2'],
    lastChangedAt: '2026-05-20T09:30:00.000Z',
  },
  {
    code: 'label_printing_strategy',
    currentVariant: 'v3',
    availableVariants: ['v1', 'v2', 'v3'],
    lastChangedAt: '2026-05-21T10:00:00.000Z',
  },
  {
    code: 'technical_product_spec_approval_gate_v1',
    currentVariant: 'v1',
    availableVariants: ['v1'],
    lastChangedAt: null,
  },
];

const authorizationPolicies: AuthorizationPolicySummary[] = [
  {
    code: 'npd_post_release_edit',
    label: 'NPD post-release edit authorization',
    description: 'Requires authorized request and approval before released product/BOM edits.',
    status: 'Enabled',
    updatedAt: '2026-05-22T08:00:00.000Z',
  },
  {
    code: 'technical_product_spec_approval',
    label: 'Technical product spec approval',
    description: 'Blocks factory use until the new technical spec version is approved.',
    status: 'Misconfigured',
    updatedAt: '2026-05-22T08:15:00.000Z',
  },
];

async function loadTenantVariationsDashboardPage(): Promise<TenantVariationsDashboardPage> {
  try {
    const pageModulePath = './page.tsx';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    expect(
      mod.default,
      'SET-060 tenant variations dashboard must default-export a renderable React component at app/[locale]/(app)/(admin)/settings/tenant/page.tsx',
    ).toEqual(expect.any(Function));
    return mod.default as TenantVariationsDashboardPage;
  } catch {
    return function MissingTenantVariationsDashboardPage() {
      return React.createElement('main', { 'data-testid': 'missing-tenant-variations-dashboard-page' });
    };
  }
}

async function renderTenantVariationsDashboard(overrides: Partial<TenantVariationsDashboardProps> = {}) {
  const Page = await loadTenantVariationsDashboardPage();
  const props: TenantVariationsDashboardProps = {
    params: Promise.resolve({ locale: 'en' }),
    state: 'ready',
    deptOverrides,
    ruleVariantOverrides,
    schemaExtensionsL3: 4,
    lastUpgradeAt: '2026-05-18T12:00:00.000Z',
    authorizationPolicies,
    featureFlags: [
      {
        code: 'npd.post_release_edit.enabled',
        description: 'Allow authorized NPD users to request post-release edits.',
        enabled: true,
      },
    ],
    ...overrides,
  };

  const node = await Page(props);
  return { props, ...render(React.createElement(React.Fragment, null, node)) };
}

function dashboardRoot() {
  return screen.getByTestId('settings-tenant-variations-screen');
}

function section(name: RegExp) {
  return screen.getByRole('region', { name });
}

describe('SET-060 tenant variations dashboard UX contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/en/settings/tenant');
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the spec-driven AppShell dashboard regions with live counts for 2 dept overrides and 3 rule variants', async () => {
    await renderTenantVariationsDashboard();

    const root = dashboardRoot();
    expect(root).toHaveAttribute('data-route', '/settings/tenant');
    expect(root).toHaveAttribute('data-screen', 'tenant-variations-dashboard');
    expect(root).toHaveAttribute('data-ux-source', 'SET-060');
    expect(screen.getByRole('heading', { name: /^Tenant Configuration$/i })).toBeInTheDocument();
    expect(screen.getByText(/overview of all active L2 configuration overrides for this tenant/i)).toBeInTheDocument();

    const kpis = within(root).getAllByTestId('settings-tenant-kpi');
    expect(kpis.map((card) => card.textContent)).toEqual([
      expect.stringMatching(/Dept Overrides Active.*2/s),
      expect.stringMatching(/Rule Variants Customized.*3/s),
      expect.stringMatching(/Schema Extensions L3.*4/s),
      expect.stringMatching(/Last Upgrade.*2026/s),
    ]);

    expect(section(/department overrides.*2/i)).toBeInTheDocument();
    expect(section(/rule variant overrides.*3/i)).toBeInTheDocument();
    expect(section(/feature flags.*l2 local/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view upgrade history/i })).toHaveAttribute(
      'href',
      '/settings/tenant/history',
    );
  });

  it('lists dept override and rule variant rows from the supplied tenant data and keeps the dashboard distinct from adjacent screens', async () => {
    await renderTenantVariationsDashboard();

    const deptSection = section(/department overrides.*2/i);
    expect(within(deptSection).getByText(/technical/i)).toBeInTheDocument();
    expect(within(deptSection).getByText(/technical-rd/i)).toBeInTheDocument();
    expect(within(deptSection).getByText(/technical-qa/i)).toBeInTheDocument();
    expect(within(deptSection).getByText(/finance/i)).toBeInTheDocument();
    expect(within(deptSection).getByRole('button', { name: /edit dept taxonomy/i })).toHaveAttribute(
      'data-slot',
      'button',
    );

    const variantSection = section(/rule variant overrides.*3/i);
    expect(within(variantSection).getByText('wo_release_gate')).toBeInTheDocument();
    expect(within(variantSection).getByText('label_printing_strategy')).toBeInTheDocument();
    expect(within(variantSection).getByText('technical_product_spec_approval_gate_v1')).toBeInTheDocument();
    expect(within(variantSection).getByRole('link', { name: /change variants/i })).toHaveAttribute(
      'href',
      '/settings/tenant/rules',
    );

    expect(dashboardRoot().querySelector('[data-testid="settings-rule-variant-selector-screen"]')).not.toBeInTheDocument();
    expect(dashboardRoot().querySelector('[data-testid="settings-dept-taxonomy-screen"]')).not.toBeInTheDocument();
  });

  it('renders the authorization policies summary with policy statuses and links to the authorization editor', async () => {
    const { rerender } = await renderTenantVariationsDashboard();

    const authSection = section(/authorization policies/i);
    expect(within(authSection).getByText('npd_post_release_edit')).toBeInTheDocument();
    expect(within(authSection).getByText('technical_product_spec_approval')).toBeInTheDocument();
    expect(within(authSection).getByText(/Enabled/i)).toBeInTheDocument();
    expect(within(authSection).getByText(/Misconfigured/i)).toBeInTheDocument();
    expect(within(authSection).getByRole('link', { name: /authorization policies/i })).toHaveAttribute(
      'href',
      '/settings/authorization',
    );

    const Page = await loadTenantVariationsDashboardPage();
    const disabledNode = await Page({
      params: Promise.resolve({ locale: 'en' }),
      state: 'ready',
      deptOverrides,
      ruleVariantOverrides,
      authorizationPolicies: [
        { ...authorizationPolicies[0], status: 'Disabled' },
        authorizationPolicies[1],
      ],
    });
    rerender(React.createElement(React.Fragment, null, disabledNode));
    expect(within(section(/authorization policies/i)).getByText(/Disabled/i)).toBeInTheDocument();
  });

  it('pushes /settings/tenant/depts through next/navigation when Edit Dept Taxonomy is clicked', async () => {
    const user = userEvent.setup();
    await renderTenantVariationsDashboard();

    await user.click(within(section(/department overrides.*2/i)).getByRole('button', { name: /edit dept taxonomy/i }));

    expect(routerPush).toHaveBeenCalledWith('/settings/tenant/depts');
  });
});
