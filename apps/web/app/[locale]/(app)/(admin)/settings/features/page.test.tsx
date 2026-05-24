/**
 * @vitest-environment jsdom
 * T-072 / SET-070 — Features screen.
 *
 * RED phase: RTL contract for features_screen parity from
 * prototypes/design/Monopilot Design System/settings/ops-screens.jsx:166-244.
 * Missing production features route renders an empty placeholder so RED reports
 * behavior assertion failures instead of module-resolution noise.
 */
import React from 'react';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const labels: Record<string, string> = {
  title: 'Feature flags',
  subtitle: 'Turn modules and features on for your workspace.',
  dryRunActivation: 'Dry-run activation',
  dryRunTitle: 'Preview affected modules + active sessions before saving flag changes',
  planNotice: "You're on the {planName}. All premium features are included. Beta features are released incrementally.",
  freePlanNotice: "You're on the {planName}. Premium features require an upgrade. Beta features are released incrementally.",
  modulesTitle: 'Modules',
  earlyAccessTitle: 'Early access',
  earlyAccessCopy: 'Want to try a feature early?',
  joinPreviewProgram: 'Join the preview program →',
  loading: 'Loading feature flags…',
  empty: 'No feature flags are configured for this workspace.',
  error: 'Unable to load feature flags.',
  premium: 'Premium',
  beta: 'Beta',
  upgradePlanTooltip: 'Upgrade plan to enable',
  dependencyRejectedTitle: 'Force-disable dependent modules?',
  dependencyRejectedBody: 'This feature is required by dependent modules. Review the affected modules before force-disable.',
  forceDisable: 'Force-disable',
  cancel: 'Cancel',
  close: 'Close',
  saveChanges: 'Save changes',
  dryRunDialogTitle: 'Dry-run — feature flag activation',
  dryRunAffects: 'Activating this flag set affects {modules} modules across {sessions} active sessions.',
  dryRunFlagsOn: '{enabled} of {total}',
  dryRunApplyOnLoad: 'flags currently on. Changes apply on next page load for each user.',
  affectedModulesLabel: 'Affected modules',
};

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, string | number>) => {
    const value = labels[key] ?? key;
    return Object.entries(values ?? {}).reduce(
      (message, [name, replacement]) => message.replaceAll(`{${name}}`, String(replacement)),
      value,
    );
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

type FeatureFlag = {
  key: string;
  label: string;
  desc: string;
  on: boolean;
  premium?: boolean;
  beta?: boolean;
};

type ToggleFeatureInput = {
  featureKey: string;
  enabled: boolean;
  force?: boolean;
};

type ToggleFeatureResult =
  | { ok: true; featureKey: string; enabled: boolean; outboxEventType: 'settings.feature_toggled' }
  | { ok: false; code: 'dependency_check_rejected'; dependentModules: string[]; message: string };

type FeaturesPageProps = {
  params?: Promise<{ locale: string }>;
  features?: FeatureFlag[];
  state?: 'ready' | 'loading' | 'empty' | 'error';
  planName?: 'Free plan' | 'Premium plan';
  activeSessionCount?: number;
  toggleFeature?: (input: ToggleFeatureInput) => Promise<ToggleFeatureResult>;
};

type FeaturesPage = (props: FeaturesPageProps) => React.ReactNode | Promise<React.ReactNode>;

const features: FeatureFlag[] = [
  {
    key: 'core-manufacturing',
    label: 'Core manufacturing',
    desc: 'Production execution, work orders, and operator workflows.',
    on: true,
  },
  {
    key: 'quality',
    label: 'Quality',
    desc: 'Specifications, holds, NCR, HACCP, and allergen gates.',
    on: true,
    beta: true,
  },
  {
    key: 'oee',
    label: 'OEE',
    desc: 'Availability, performance, quality, and read-only snapshots.',
    on: false,
    premium: true,
    beta: true,
  },
];

async function loadFeaturesPage(): Promise<FeaturesPage> {
  const routeCandidates = [
    join(process.cwd(), 'apps/web/app/[locale]/(app)/(admin)/settings/features/page.tsx'),
    join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/features/page.tsx'),
  ];

  if (!routeCandidates.some((routePath) => existsSync(routePath))) {
    return function MissingFeaturesPage() {
      return React.createElement('main', { 'data-testid': 'settings-features-screen-missing' });
    };
  }

  const pageModulePath = './page.tsx';
  const mod = await import(/* @vite-ignore */ pageModulePath);
  expect(mod.default, 'T-072 features page must default-export a renderable React component').toEqual(expect.any(Function));
  return mod.default as FeaturesPage;
}

async function renderFeaturesPage(overrides: Partial<FeaturesPageProps> = {}) {
  const Page = await loadFeaturesPage();
  const props: FeaturesPageProps = {
    params: Promise.resolve({ locale: 'en' }),
    features,
    state: 'ready',
    planName: 'Premium plan',
    activeSessionCount: 28,
    toggleFeature: vi.fn(async (input: ToggleFeatureInput) => ({
      ok: true as const,
      featureKey: input.featureKey,
      enabled: input.enabled,
      outboxEventType: 'settings.feature_toggled' as const,
    })),
    ...overrides,
  };

  const node = await Page(props);
  return { props, ...render(React.createElement(React.Fragment, null, node)) };
}

function featureRows() {
  return screen.getAllByTestId('settings-feature-row');
}

function structuralSnapshot() {
  return {
    regions: Array.from(document.querySelectorAll<HTMLElement>('[data-region]')).map((region) =>
      region.getAttribute('data-region'),
    ),
    actions: screen.getAllByRole('button').map((button) => button.textContent?.trim()).filter(Boolean),
    sections: screen.getAllByTestId('settings-feature-section').map((section) =>
      within(section).getByRole('heading', { level: 2 }).textContent,
    ),
    features: featureRows().map((row) => ({
      label: within(row).getByTestId('settings-feature-label').textContent,
      desc: within(row).getByTestId('settings-feature-description').textContent,
      badges: within(row).queryAllByTestId('settings-feature-badge').map((badge) => badge.textContent),
      checked: within(row).getByRole('switch').getAttribute('aria-checked'),
      disabled: within(row).getByRole('switch').hasAttribute('disabled'),
    })),
  };
}

function assertModalA11y(dialog: HTMLElement, name: RegExp) {
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(dialog).toHaveAccessibleName(name);
  expect(within(dialog).getByRole('button', { name: /close|cancel|force-disable/i })).toBeInTheDocument();
}

describe('T-072 features AppShell route contract', () => {
  it('defines the user-visible localized AppShell route instead of only a legacy settings route', () => {
    const canonicalRouteCandidates = [
      join(process.cwd(), 'apps/web/app/[locale]/(app)/(admin)/settings/features/page.tsx'),
      join(process.cwd(), 'app/[locale]/(app)/(admin)/settings/features/page.tsx'),
    ];
    const legacyRouteCandidates = [
      join(process.cwd(), 'apps/web/app/[locale]/(admin)/settings/features/page.tsx'),
      join(process.cwd(), 'app/[locale]/(admin)/settings/features/page.tsx'),
    ];

    expect(
      canonicalRouteCandidates.some((candidate) => existsSync(candidate)),
      'T-072 must implement /en/settings/features under app/[locale]/(app)/(admin) so AppShell/AppSidebar/AppTopbar wrap the page',
    ).toBe(true);
    expect(
      legacyRouteCandidates.some((candidate) => existsSync(candidate)),
      'Legacy body-only settings route must not be the only implementation',
    ).toBe(false);
  });
});

describe('T-072 features_screen prototype parity', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders prototype regions, labels, badges, shadcn switches, dry-run dialog, and keyboard order', async () => {
    const user = userEvent.setup();
    await renderFeaturesPage();

    expect(screen.getByTestId('settings-features-screen')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^feature flags$/i })).toBeInTheDocument();
    expect(screen.getByText(/turn modules and features on for your workspace/i)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/premium plan/i);
    expect(screen.getByRole('button', { name: /dry-run activation/i })).toHaveAttribute('data-slot', 'button');
    expect(screen.getByRole('link', { name: /join the preview program/i })).toHaveAttribute('href', expect.stringContaining('preview'));
    expect(document.querySelectorAll('[data-slot="switch"]').length).toBeGreaterThanOrEqual(features.length);
    expect(document.querySelectorAll('input[type="checkbox"]:not([role="switch"])')).toHaveLength(0);

    expect(structuralSnapshot()).toMatchInlineSnapshot(`
      {
        "actions": [
          "Dry-run activation",
        ],
        "features": [
          {
            "badges": [],
            "checked": "true",
            "desc": "Production execution, work orders, and operator workflows.",
            "disabled": false,
            "label": "Core manufacturing",
          },
          {
            "badges": [
              "Beta",
            ],
            "checked": "true",
            "desc": "Specifications, holds, NCR, HACCP, and allergen gates.",
            "disabled": false,
            "label": "Quality",
          },
          {
            "badges": [
              "Premium",
              "Beta",
            ],
            "checked": "false",
            "desc": "Availability, performance, quality, and read-only snapshots.",
            "disabled": false,
            "label": "OEE",
          },
        ],
        "regions": [
          "page-head",
          "plan-notice",
          "modules-section",
          "early-access-section",
        ],
        "sections": [
          "Modules",
          "Early access",
        ],
      }
    `);

    await user.tab();
    expect(screen.getByRole('button', { name: /dry-run activation/i })).toHaveFocus();
    await user.tab();
    expect(within(featureRows()[0]).getByRole('switch', { name: /core manufacturing/i })).toHaveFocus();
    await user.tab();
    expect(within(featureRows()[1]).getByRole('switch', { name: /quality/i })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: /dry-run activation/i }));
    const dialog = screen.getByRole('dialog', { name: /dry-run/i });
    assertModalA11y(dialog, /dry-run/i);
    expect(dialog).toHaveTextContent(/affects 3 modules across 28 active sessions/i);
    expect(within(dialog).getByText(/2 of 3/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/affected modules/i)).toBeInTheDocument();
    expect(within(dialog).getAllByTestId('settings-dry-run-module-badge').map((badge) => badge.textContent)).toEqual([
      'Core manufacturing',
      'Quality',
    ]);
    expect(within(dialog).getAllByRole('button').map((button) => button.textContent?.trim())).toEqual(['Close', 'Save changes']);
  });

  it('renders loading, empty, and error states without silently skipping parity invariants', async () => {
    await renderFeaturesPage({ state: 'loading' });
    expect(screen.getByText(/loading feature flags/i)).toBeInTheDocument();
    expect(screen.getByTestId('settings-features-loading-state')).toBeInTheDocument();

    cleanup();
    await renderFeaturesPage({ state: 'empty', features: [] });
    expect(screen.getByText(/no feature flags are configured/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /join the preview program/i })).toBeInTheDocument();

    cleanup();
    await renderFeaturesPage({ state: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent(/unable to load feature flags/i);
  });

  it('disables Premium feature toggles on Free plan and exposes the upgrade tooltip text', async () => {
    await renderFeaturesPage({ planName: 'Free plan' });

    const oeeRow = featureRows().find((row) => within(row).queryByText('OEE'));
    expect(oeeRow, 'Premium OEE feature row must render before Free-plan disabled assertions run').toBeTruthy();

    const oeeSwitch = within(oeeRow as HTMLElement).getByRole('switch', { name: /oee/i });
    expect(oeeSwitch).toBeDisabled();
    expect(within(oeeRow as HTMLElement).getByText('Upgrade plan to enable')).toBeInTheDocument();
  });

  it('opens a dependency rejection confirm dialog that lists dependent modules before force-disable', async () => {
    const user = userEvent.setup();
    const toggleFeature = vi.fn(async (input: ToggleFeatureInput): Promise<ToggleFeatureResult> => {
      if (input.featureKey === 'quality' && input.enabled === false && !input.force) {
        return {
          ok: false,
          code: 'dependency_check_rejected',
          dependentModules: ['Production', 'Shipping'],
          message: 'Quality is required by dependent modules.',
        };
      }

      return {
        ok: true,
        featureKey: input.featureKey,
        enabled: input.enabled,
        outboxEventType: 'settings.feature_toggled',
      };
    });

    await renderFeaturesPage({ toggleFeature });

    const qualityRow = featureRows().find((row) => within(row).queryByText('Quality'));
    expect(qualityRow, 'Quality row must render before dependency rejection assertions run').toBeTruthy();

    await user.click(within(qualityRow as HTMLElement).getByRole('switch', { name: /quality/i }));

    expect(toggleFeature).toHaveBeenCalledWith({ featureKey: 'quality', enabled: false, force: false });
    const confirmDialog = await screen.findByRole('dialog', { name: /force-disable dependent modules/i });
    assertModalA11y(confirmDialog, /force-disable dependent modules/i);
    expect(confirmDialog).toHaveTextContent(/required by dependent modules/i);
    expect(within(confirmDialog).getByText('Production')).toBeInTheDocument();
    expect(within(confirmDialog).getByText('Shipping')).toBeInTheDocument();

    await user.click(within(confirmDialog).getByRole('button', { name: /force-disable/i }));

    expect(toggleFeature).toHaveBeenLastCalledWith({ featureKey: 'quality', enabled: false, force: true });
  });
});
