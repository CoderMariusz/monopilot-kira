/**
 * @vitest-environment jsdom
 * T-044 / SET-004 — Onboarding first product redirect step
 *
 * RED phase: specifies the production first_product step from
 * prototypes/design/Monopilot Design System/settings/onboarding-screens.jsx:7-238.
 * Missing production page modules render an empty placeholder so RED reports behavior
 * assertion failures, not module-resolution noise.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnboardingProductPage from './page';

const pageSourcePath = path.join(__dirname, 'page.tsx');
const parityReportPath = path.resolve(
  __dirname,
  '../../../../../artifacts/ui-parity/TASK-000468/onboarding-product/parity_report.json',
);

const routerPush = vi.fn();
const routerRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  },
  useRouter: () => ({
    push: routerPush,
    replace: vi.fn(),
    refresh: routerRefresh,
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

type OnboardingStepKey =
  | 'org_profile'
  | 'first_warehouse'
  | 'first_location'
  | 'first_product'
  | 'first_wo'
  | 'completion';

type SkipOnboardingStepResult =
  | { ok: true; skippedStep: 4; nextStep: 'first_wo' }
  | { ok: false; error: string };

type CompleteOnboardingStepResult =
  | { ok: true; completedStep: 4; nextStep: 'first_wo' }
  | { ok: false; error: string };

type OnboardingProductPageProps = {
  organization: {
    id: string;
    name: string;
    onboardingCompletedAt: string | null;
  };
  onboardingState: {
    currentStep: OnboardingStepKey;
    completedSteps: OnboardingStepKey[];
    skippedSteps: OnboardingStepKey[];
    savedAt: string;
  };
  state?: 'ready' | 'loading' | 'error' | 'permission_denied';
  skipOnboardingStep: (stepNumber: 4) => Promise<SkipOnboardingStepResult>;
  completeOnboardingStep?: (stepNumber: 4) => Promise<CompleteOnboardingStepResult>;
  retryLoad?: () => void;
};

const baseProps: OnboardingProductPageProps = {
  organization: {
    id: 'org-apex',
    name: 'Apex Foods Sp. z o.o.',
    onboardingCompletedAt: null,
  },
  onboardingState: {
    currentStep: 'first_product',
    completedSteps: ['org_profile', 'first_warehouse', 'first_location'],
    skippedSteps: [],
    savedAt: '2026-05-19T21:10:00.000Z',
  },
  state: 'ready',
  skipOnboardingStep: vi.fn().mockResolvedValue({
    ok: true,
    skippedStep: 4,
    nextStep: 'first_wo',
  } satisfies SkipOnboardingStepResult),
  completeOnboardingStep: vi.fn().mockResolvedValue({
    ok: true,
    completedStep: 4,
    nextStep: 'first_wo',
  } satisfies CompleteOnboardingStepResult),
  retryLoad: vi.fn(),
};

function renderProduct(overrides: Partial<OnboardingProductPageProps> = {}) {
  const props: OnboardingProductPageProps = {
    ...baseProps,
    ...overrides,
    organization: { ...baseProps.organization, ...overrides.organization },
    onboardingState: { ...baseProps.onboardingState, ...overrides.onboardingState },
    skipOnboardingStep:
      overrides.skipOnboardingStep ??
      vi.fn().mockResolvedValue({ ok: true, skippedStep: 4, nextStep: 'first_wo' } satisfies SkipOnboardingStepResult),
    completeOnboardingStep:
      overrides.completeOnboardingStep ??
      vi.fn().mockResolvedValue({ ok: true, completedStep: 4, nextStep: 'first_wo' } satisfies CompleteOnboardingStepResult),
    retryLoad: overrides.retryLoad ?? vi.fn(),
  };

  return {
    props,
    ...render(React.createElement(OnboardingProductPage, props)),
  };
}

function renderProductionRouteEntry() {
  return render(React.createElement(OnboardingProductPage, {} as OnboardingProductPageProps));
}

function stepperLabels() {
  return screen.getAllByRole('button', { name: /SET-00[1-6]/ }).map((button) => button.textContent);
}

function lastPushedHref() {
  const target = routerPush.mock.calls.at(-1)?.[0];
  if (typeof target === 'string') return target;
  if (target && typeof target === 'object' && 'pathname' in target) {
    const pathname = String(target.pathname);
    const query = 'query' in target ? new URLSearchParams(target.query as Record<string, string>).toString() : '';
    return query ? `${pathname}?${query}` : pathname;
  }
  return String(target ?? '');
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SET-004 onboarding first-product redirect-card prototype parity', () => {
  it('keeps page.tsx as a Server Component boundary that gets translated copy server-side', () => {
    const pageSource = readFileSync(pageSourcePath, 'utf8');
    const normalizedSource = pageSource.trimStart();

    expect(normalizedSource.startsWith("'use client'"), 'app/**/page.tsx must not be a Client Component').toBe(
      false,
    );
    expect(normalizedSource.startsWith('"use client"'), 'app/**/page.tsx must not be a Client Component').toBe(
      false,
    );
    expect(pageSource, 'Server Component page must fetch next-intl messages before passing props to its client island').toMatch(
      /from ['"]next-intl\/server['"]/,
    );
  });

  it('does not hardcode SET-004 user-visible English copy in production JSX', () => {
    const pageSource = readFileSync(pageSourcePath, 'utf8');
    const forbiddenVisibleCopy = [
      'Create your first product',
      'Open product editor',
      'Skip this step →',
      'Onboarding wizard',
      'Soft redirect into the Technical module',
      'Products live in',
      'Optional — you can skip this step.',
      "Couldn't load onboarding progress.",
      'Permission denied:',
    ];

    for (const literal of forbiddenVisibleCopy) {
      expect(pageSource, `Visible copy must come from next-intl, not a hardcoded literal: ${literal}`).not.toContain(
        literal,
      );
    }
  });

  it('publishes fail-closed UI parity artifacts for both declared viewports and regions', () => {
    expect(
      existsSync(parityReportPath),
      `Missing parity_report.json at ${parityReportPath}; SET-004 closeout requires screenshot pairs and DOM diff JSON`,
    ).toBe(true);

    const report = JSON.parse(readFileSync(parityReportPath, 'utf8')) as {
      prototype_path?: string;
      prototype_route?: string;
      target_route?: string;
      viewports?: Array<{ label?: string; width?: number; height?: number }>;
      region_selectors?: Record<string, string>;
      parity_matrix?: unknown;
      screenshot_pairs?: Array<{ viewport?: string; region?: string; prototype?: string; target?: string }>;
      dom_diff_json?: unknown;
    };

    expect(report).toEqual(
      expect.objectContaining({
        prototype_path: expect.stringContaining('prototypes/design/Monopilot Design System/settings/onboarding-screens.jsx'),
        prototype_route: 'multi-step-wizard',
        target_route: '/en/onboarding/product',
        region_selectors: expect.objectContaining({ main: 'main', page_head: expect.any(String) }),
        parity_matrix: expect.anything(),
      }),
    );
    expect(report.viewports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'desktop', width: 1440, height: 900 }),
        expect.objectContaining({ label: 'tablet', width: 768, height: 1024 }),
      ]),
    );

    const requiredArtifactPairs = [
      ['desktop', 'main'],
      ['desktop', 'page_head'],
      ['tablet', 'main'],
      ['tablet', 'page_head'],
    ] as const;
    for (const [viewport, region] of requiredArtifactPairs) {
      expect(report.screenshot_pairs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ viewport, region, prototype: expect.any(String), target: expect.any(String) }),
        ]),
      );
    }
    expect(report.dom_diff_json).toEqual(expect.anything());
  });

  it('renders SET-004 from the production route boundary without test-injected props or client-only fallback', async () => {
    renderProductionRouteEntry();

    expect(screen.queryByText(/Server onboarding data or actions are unavailable/i)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /onboarding wizard/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /SET-004 · First product/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open product editor/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Skip this step →/i })).toBeEnabled();
  });

  it('routes to the canonical step-5 URL after successful Skip instead of only changing local state', async () => {
    const user = userEvent.setup();
    const skipOnboardingStep = vi.fn().mockResolvedValue({
      ok: true,
      skippedStep: 4,
      nextStep: 'first_wo',
    } satisfies SkipOnboardingStepResult);
    renderProduct({ skipOnboardingStep });

    await user.click(screen.getByRole('button', { name: /Skip this step →/i }));

    expect(skipOnboardingStep).toHaveBeenCalledWith(4);
    expect(routerPush).toHaveBeenCalledWith('/onboarding/wo');
  });

  it('renders the skippable first_product card inside the saved-state six-step wizard with prototype labels and keyboard order', async () => {
    const user = userEvent.setup();
    renderProduct();

    expect(screen.getByRole('heading', { name: /onboarding wizard/i })).toBeInTheDocument();
    expect(screen.getByText(/6-step setup · target <15 minutes/i)).toBeInTheDocument();
    expect(screen.getByText(/state saved automatically/i)).toBeInTheDocument();
    expect(screen.getByText(/50% complete/i)).toBeInTheDocument();
    expect(screen.getByText(/Resume capability/i)).toBeInTheDocument();
    expect(screen.getByText(/onboarding_state\.current_step/i)).toBeInTheDocument();

    expect(stepperLabels()).toEqual([
      expect.stringMatching(/1.*✓.*Organization profile.*SET-001/i),
      expect.stringMatching(/2.*✓.*First warehouse.*SET-002/i),
      expect.stringMatching(/3.*✓.*First location.*SET-003/i),
      expect.stringMatching(/4.*First product.*SET-004/i),
      expect.stringMatching(/5.*First work order.*SET-005/i),
      expect.stringMatching(/6.*Completion.*SET-006/i),
    ]);
    expect(screen.getByRole('button', { name: /First product.*SET-004/i })).toHaveAttribute(
      'aria-current',
      'step',
    );

    const productStep = screen.getByRole('region', { name: /SET-004 · First product/i });
    expect(within(productStep).getByText(/SKU \+ BOM \(skippable · redirects to 03-TECHNICAL\)/i)).toBeInTheDocument();
    expect(within(productStep).getByText(/Soft redirect into the Technical module/i)).toBeInTheDocument();
    expect(within(productStep).getByText('📦')).toBeInTheDocument();
    expect(within(productStep).getByRole('heading', { name: /Create your first product/i })).toBeInTheDocument();
    expect(within(productStep).getByText(/Products live in/i)).toHaveTextContent(/03-TECHNICAL/);
    expect(within(productStep).getByText(/SKU \+ BOM/i)).toBeInTheDocument();
    expect(within(productStep).getByText(/D365 later/i)).toBeInTheDocument();
    expect(within(productStep).getByRole('button', { name: /Open product editor/i })).toBeInTheDocument();
    expect(within(productStep).getByText(/Optional — you can skip this step/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Skip this step →/i })).toBeInTheDocument();
    expect(screen.getByText(/Step 4 of 6 · 3 completed/i)).toBeInTheDocument();

    await user.tab();
    expect(screen.getByRole('button', { name: /restart/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /Skip this step →/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /Organization profile.*SET-001/i })).toHaveFocus();
  });

  it('calls skipOnboardingStep(4) and advances the wizard to SET-005 first work order', async () => {
    const user = userEvent.setup();
    const skipOnboardingStep = vi.fn().mockResolvedValue({
      ok: true,
      skippedStep: 4,
      nextStep: 'first_wo',
    } satisfies SkipOnboardingStepResult);
    renderProduct({ skipOnboardingStep });

    await user.click(screen.getByRole('button', { name: /Skip this step →/i }));

    expect(skipOnboardingStep).toHaveBeenCalledTimes(1);
    expect(skipOnboardingStep).toHaveBeenCalledWith(4);
    expect(await screen.findByRole('region', { name: /SET-005 · First work order/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /First work order.*SET-005/i })).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(screen.getByText(/Step 5 of 6 · 3 completed · 1 skipped/i)).toBeInTheDocument();
  });

  it('opens the product editor deep link with a return path to /onboarding/wo', async () => {
    const user = userEvent.setup();
    renderProduct();

    await user.click(screen.getByRole('button', { name: /Open product editor/i }));

    const href = lastPushedHref();
    expect(href).toMatch(/^\/products\/new\b/);
    expect(new URL(`http://monopilot.local${href}`).searchParams.get('returnTo')).toBe('/onboarding/wo');
    expect(routerPush).not.toHaveBeenCalledWith('/technical/products');
  });

  it('fails loudly for continue, loading, error, and permission-denied states instead of silently skipping UI parity', async () => {
    const user = userEvent.setup();
    const completeOnboardingStep = vi.fn().mockResolvedValue({
      ok: true,
      completedStep: 4,
      nextStep: 'first_wo',
    } satisfies CompleteOnboardingStepResult);
    renderProduct({ completeOnboardingStep });

    await user.click(screen.getByRole('button', { name: /Continue →/i }));
    expect(completeOnboardingStep).toHaveBeenCalledWith(4);
    expect(await screen.findByRole('region', { name: /SET-005 · First work order/i })).toBeInTheDocument();

    cleanup();
    const retryLoad = vi.fn();
    renderProduct({ state: 'loading', retryLoad });
    expect(screen.getByRole('status', { name: /loading onboarding product/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open product editor/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Skip this step/i })).toBeDisabled();

    cleanup();
    renderProduct({ state: 'error', retryLoad });
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load onboarding progress/i);
    await userEvent.click(screen.getByRole('button', { name: /Retry/i }));
    expect(retryLoad).toHaveBeenCalledTimes(1);

    cleanup();
    renderProduct({ state: 'permission_denied' });
    expect(screen.getByRole('alert')).toHaveTextContent(/settings\.onboarding\.write/i);
    expect(screen.queryByRole('button', { name: /Open product editor/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Skip this step/i })).not.toBeInTheDocument();
  });
});
