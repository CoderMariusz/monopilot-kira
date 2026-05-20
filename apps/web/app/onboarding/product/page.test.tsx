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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

type OnboardingProductPage = (props: OnboardingProductPageProps) => React.ReactNode | Promise<React.ReactNode>;

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

async function loadOnboardingProductPage(): Promise<OnboardingProductPage> {
  try {
    const pageModulePath = './_components/product-client';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    expect(mod.default, 'SET-004 product page must default-export a renderable React component').toEqual(
      expect.any(Function),
    );
    return mod.default as OnboardingProductPage;
  } catch {
    return function MissingOnboardingProductPage() {
      return React.createElement('main', { 'data-testid': 'missing-onboarding-product-page' });
    };
  }
}

async function renderProduct(overrides: Partial<OnboardingProductPageProps> = {}) {
  const Page = await loadOnboardingProductPage();
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

  if (Page.constructor.name === 'AsyncFunction') {
    const node = await Page(props);
    return { props, ...render(React.createElement(React.Fragment, null, node)) };
  }

  return {
    props,
    ...render(React.createElement(Page as React.ComponentType<OnboardingProductPageProps>, props)),
  };
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
  it('renders the skippable first_product card inside the saved-state six-step wizard with prototype labels and keyboard order', async () => {
    const user = userEvent.setup();
    await renderProduct();

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
    await renderProduct({ skipOnboardingStep });

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
    await renderProduct();

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
    await renderProduct({ completeOnboardingStep });

    await user.click(screen.getByRole('button', { name: /Continue →/i }));
    expect(completeOnboardingStep).toHaveBeenCalledWith(4);
    expect(await screen.findByRole('region', { name: /SET-005 · First work order/i })).toBeInTheDocument();

    cleanup();
    const retryLoad = vi.fn();
    await renderProduct({ state: 'loading', retryLoad });
    expect(screen.getByRole('status', { name: /loading onboarding product/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open product editor/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Skip this step/i })).toBeDisabled();

    cleanup();
    await renderProduct({ state: 'error', retryLoad });
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load onboarding progress/i);
    await userEvent.click(screen.getByRole('button', { name: /Retry/i }));
    expect(retryLoad).toHaveBeenCalledTimes(1);

    cleanup();
    await renderProduct({ state: 'permission_denied' });
    expect(screen.getByRole('alert')).toHaveTextContent(/settings\.onboarding\.write/i);
    expect(screen.queryByRole('button', { name: /Open product editor/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Skip this step/i })).not.toBeInTheDocument();
  });
});
