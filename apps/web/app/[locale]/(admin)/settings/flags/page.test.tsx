/**
 * @vitest-environment jsdom
 * T-065 / SET-071 — Feature flags admin screen.
 *
 * RED phase: page-level RTL tests for flags_admin_screen from
 * prototypes/design/Monopilot Design System/settings/admin-screens.jsx:350-408.
 * The test file lives at the ACP-scoped RED path, but it intentionally loads the
 * canonical browser-visible route under app/[locale]/(app)/(admin)/settings/flags.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => {
    const labels: Record<string, string> = {
      title: 'Feature flags',
      subtitle: 'Per-tenant toggles. L1 changes go through promotion; L2/L3 are editable here.',
      openPostHog: 'Open in PostHog ↗',
      preflightNotice:
        'Some flags trigger pre-flight checks. Example: enabling npd.post_release_edit.enabled validates V-SET-43 authorization policy before the toggle is saved.',
      coreTab: 'L1 core ({count})',
      localTab: 'L2 local ({count})',
      tenantTab: 'L3 tenant ({count})',
      searchPlaceholder: 'Search flag code or description…',
      coreFlags: 'Core flags',
      localFlags: 'Local (L2) flags',
      tenantFlags: 'Tenant-private (L3) flags',
      flagCode: 'Flag code',
      description: 'Description',
      status: 'Status',
      rollout: 'Rollout %',
      updated: 'Updated',
      consumers: 'Consumers',
      actions: 'Actions',
      on: '● ON',
      off: '○ OFF',
      edit: 'Edit →',
      loading: 'Loading feature flags…',
      empty: 'No feature flags found.',
      error: 'Unable to load feature flags.',
      vSet43Title: 'V-SET-43 authorization preflight failed',
      vSet43Body:
        'NPD post-release edits require a policy that creates a new BOM/product-spec version and has authorizer roles configured.',
      configureAuthorization: 'Configure authorization policy',
      promoteToL2Title: 'Promote to L2',
      close: 'Close',
    };
    return labels[key] ?? key;
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

type FlagTier = 'L1' | 'L2' | 'L3';
type FlagTenant = 'L1-core' | 'L2-local' | 'L3-tenant';

type FeatureFlagRow = {
  code: string;
  description: string;
  desc?: string;
  tier: FlagTier;
  tenant: FlagTenant;
  enabled: boolean;
  on?: boolean;
  rolloutPercent: number;
  rollout?: number;
  updatedAt: string;
  updated?: string;
  consumers: string[];
};

type FlagAuthorizationPreflight = {
  flagCode: 'npd.post_release_edit.enabled';
  canEnable: boolean;
  requiresNewVersion: boolean;
  hasAuthorizerRoles: boolean;
  configureHref: '/en/settings/authorization' | '/settings/authorization';
};

type FlagsPageProps = {
  params?: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | undefined>>;
  flags?: FeatureFlagRow[];
  state?: 'ready' | 'loading' | 'empty' | 'error';
  posthogUrl?: string;
  authorizationPreflight?: FlagAuthorizationPreflight;
  openModal?: (modalId: 'flagEdit' | 'promoteToL2', payload?: { flag: FeatureFlagRow }) => void;
  onToggleFlag?: (code: string, enabled: boolean) => Promise<{ ok: true } | { ok: false; error: string }>;
};

type FlagsPage = (props: FlagsPageProps) => React.ReactNode | Promise<React.ReactNode>;

const flags: FeatureFlagRow[] = [
  {
    code: 'npd.post_release_edit.enabled',
    description: 'Allow released NPD product/BOM edits after authorization.',
    desc: 'Allow released NPD product/BOM edits after authorization.',
    tier: 'L1',
    tenant: 'L1-core',
    enabled: false,
    on: false,
    rolloutPercent: 0,
    rollout: 0,
    updatedAt: '2026-05-20',
    updated: '2026-05-20',
    consumers: ['npd', 'technical'],
  },
  {
    code: 'technical.product_spec_approval.required',
    description: 'Require Technical product-spec approval before factory use.',
    desc: 'Require Technical product-spec approval before factory use.',
    tier: 'L1',
    tenant: 'L1-core',
    enabled: true,
    on: true,
    rolloutPercent: 100,
    rollout: 100,
    updatedAt: '2026-05-19',
    updated: '2026-05-19',
    consumers: ['technical', 'quality'],
  },
  {
    code: 'integration.d365.enabled',
    description: 'Enable D365 export integration after constants and connection checks pass.',
    desc: 'Enable D365 export integration after constants and connection checks pass.',
    tier: 'L2',
    tenant: 'L2-local',
    enabled: true,
    on: true,
    rolloutPercent: 75,
    rollout: 75,
    updatedAt: '2026-05-18',
    updated: '2026-05-18',
    consumers: ['finance', 'shipping'],
  },
  {
    code: 'tenant.apex.experimental_dashboard',
    description: 'Tenant-private dashboard experiment for Apex.',
    desc: 'Tenant-private dashboard experiment for Apex.',
    tier: 'L3',
    tenant: 'L3-tenant',
    enabled: false,
    on: false,
    rolloutPercent: 10,
    rollout: 10,
    updatedAt: '2026-05-17',
    updated: '2026-05-17',
    consumers: ['reporting'],
  },
];

async function loadFlagsPage(): Promise<FlagsPage> {
  try {
    const canonicalRouteModule = '../../../(app)/(admin)/settings/flags/page';
    const mod = await import(/* @vite-ignore */ canonicalRouteModule);
    expect(mod.default, 'SET-071 flags admin page must default-export a renderable React component').toEqual(
      expect.any(Function),
    );
    return mod.default as FlagsPage;
  } catch {
    return function MissingFlagsAdminPage() {
      return React.createElement('main', { 'data-testid': 'missing-flags-admin-page' });
    };
  }
}

async function renderFlagsPage(overrides: Partial<FlagsPageProps> = {}) {
  const Page = await loadFlagsPage();
  const props: FlagsPageProps = {
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve({}),
    flags,
    state: 'ready',
    posthogUrl: 'https://posthog.monopilot.test/project/feature_flags',
    authorizationPreflight: {
      flagCode: 'npd.post_release_edit.enabled',
      canEnable: false,
      requiresNewVersion: true,
      hasAuthorizerRoles: false,
      configureHref: '/en/settings/authorization',
    },
    openModal: vi.fn(),
    onToggleFlag: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };

  const node = await Page(props);
  return { props, ...render(React.createElement(React.Fragment, null, node)) };
}

function flagsTable() {
  return screen.getByRole('table', { name: /core flags|local \(l2\) flags|tenant-private \(l3\) flags/i });
}

function bodyRows(table = flagsTable()) {
  return within(table).getAllByRole('row').slice(1);
}

function structuralSnapshot() {
  const table = flagsTable();
  return {
    regions: Array.from(document.querySelectorAll<HTMLElement>('[data-region]')).map((region) =>
      region.getAttribute('data-region'),
    ),
    actions: screen.getAllByRole('button').map((button) => button.textContent?.trim()).filter(Boolean),
    links: screen.getAllByRole('link').map((link) => ({
      name: link.textContent?.trim(),
      href: link.getAttribute('href'),
    })),
    search: screen.getByPlaceholderText(/search flag code or description/i).getAttribute('type') ?? 'text',
    headers: within(table).getAllByRole('columnheader').map((header) => header.textContent?.trim()),
    rows: bodyRows(table).map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent?.trim())),
  };
}

function assertDialogA11y(dialog: HTMLElement, name: RegExp) {
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(dialog).toHaveAccessibleName(name);
  expect(within(dialog).getByRole('button', { name: /close/i })).toBeInTheDocument();
}

describe('SET-071 flags admin prototype parity', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_POSTHOG_URL = 'https://posthog.monopilot.test/project/feature_flags';
  });

  it('renders prototype regions, action order, search field, table columns, rollout/status presentation, and keyboard order', async () => {
    const user = userEvent.setup();
    await renderFlagsPage();

    expect(screen.getByTestId('settings-flags-admin-screen')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^feature flags$/i })).toBeInTheDocument();
    expect(screen.getByText(/per-tenant toggles\. l1 changes go through promotion/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/some flags trigger pre-flight checks/i);

    expect(structuralSnapshot()).toMatchInlineSnapshot(`
      {
        "actions": [
          "L1 core (2)",
          "L2 local (1)",
          "L3 tenant (1)",
          "Edit →",
          "Edit →",
        ],
        "headers": [
          "Flag code",
          "Description",
          "Status",
          "Rollout %",
          "Updated",
          "Consumers",
          "Actions",
        ],
        "links": [
          {
            "href": "https://posthog.monopilot.test/project/feature_flags",
            "name": "Open in PostHog ↗",
          },
        ],
        "regions": [
          "page-head",
          "preflight-notice",
          "flag-tabs-search",
          "flags-table",
        ],
        "rows": [
          [
            "npd.post_release_edit.enabled",
            "Allow released NPD product/BOM edits after authorization.",
            "○ OFF",
            "0%",
            "2026-05-20",
            "npd, technical",
            "Edit →",
          ],
          [
            "technical.product_spec_approval.required",
            "Require Technical product-spec approval before factory use.",
            "● ON",
            "100%",
            "2026-05-19",
            "technical, quality",
            "Edit →",
          ],
        ],
        "search": "search",
      }
    `);

    await user.tab();
    expect(screen.getByRole('link', { name: /open in posthog/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /l1 core/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /l2 local/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /l3 tenant/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByPlaceholderText(/search flag code or description/i)).toHaveFocus();
  });

  it('filters by tab/search and renders loading, empty, and error states without skipped assertions', async () => {
    const user = userEvent.setup();
    await renderFlagsPage();

    await user.click(screen.getByRole('button', { name: /l2 local/i }));
    expect(within(flagsTable()).getByText('integration.d365.enabled')).toBeInTheDocument();
    expect(within(flagsTable()).queryByText('npd.post_release_edit.enabled')).not.toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText(/search flag code or description/i));
    await user.type(screen.getByPlaceholderText(/search flag code or description/i), 'd365');
    expect(bodyRows()).toHaveLength(1);
    expect(within(flagsTable()).getByText(/d365 export integration/i)).toBeInTheDocument();

    cleanup();
    await renderFlagsPage({ state: 'loading' });
    expect(screen.getByText(/loading feature flags/i)).toBeInTheDocument();
    expect(screen.getByTestId('settings-flags-loading-state')).toBeInTheDocument();

    cleanup();
    await renderFlagsPage({ state: 'empty', flags: [] });
    expect(screen.getByText(/no feature flags found/i)).toBeInTheDocument();

    cleanup();
    await renderFlagsPage({ state: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent(/unable to load feature flags/i);
  });

  it('opens SM-05 PromoteToL2Modal for L1 edit triggers and never opens the SM-02 flag edit dialog for that row', async () => {
    const user = userEvent.setup();
    const openModal = vi.fn();
    await renderFlagsPage({ openModal });

    const npdRow = bodyRows().find((row) => within(row).queryByText('npd.post_release_edit.enabled'));
    expect(npdRow, 'NPD L1 core flag row must be rendered before editing').toBeTruthy();
    await user.click(within(npdRow as HTMLElement).getByRole('button', { name: /edit/i }));

    expect(openModal).toHaveBeenCalledWith('promoteToL2', expect.objectContaining({ flag: expect.objectContaining({ tier: 'L1' }) }));
    expect(openModal).not.toHaveBeenCalledWith('flagEdit', expect.anything());

    const dialog = screen.queryByRole('dialog', { name: /promote to l2/i });
    if (dialog) {
      assertDialogA11y(dialog, /promote to l2/i);
    }
  });

  it('uses NEXT_PUBLIC_POSTHOG_URL and blocks enabling NPD post-release edit when V-SET-43 policy preflight is missing', async () => {
    const user = userEvent.setup();
    const onToggleFlag = vi.fn(async () => ({ ok: true as const }));
    await renderFlagsPage({ onToggleFlag });

    expect(screen.getByRole('link', { name: /open in posthog/i })).toHaveAttribute(
      'href',
      'https://posthog.monopilot.test/project/feature_flags',
    );

    const npdRow = bodyRows().find((row) => within(row).queryByText('npd.post_release_edit.enabled'));
    expect(npdRow, 'NPD post-release edit flag must be present in Core flags').toBeTruthy();
    const toggle = within(npdRow as HTMLElement).getByRole('switch', { name: /npd\.post_release_edit\.enabled/i });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await user.click(toggle);

    expect(onToggleFlag).not.toHaveBeenCalledWith('npd.post_release_edit.enabled', true);
    expect(screen.getByRole('alert')).toHaveTextContent(/v-set-43 authorization preflight failed/i);
    expect(screen.getByText(/new bom\/product-spec version/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /configure authorization policy/i })).toHaveAttribute(
      'href',
      expect.stringMatching(/\/settings\/authorization$/),
    );
  });
});
