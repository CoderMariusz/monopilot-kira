/**
 * @vitest-environment jsdom
 * T-046 / SET-006 — Onboarding completion
 *
 * RED phase: specifies the production completion step from
 * prototypes/design/Monopilot Design System/settings/onboarding-screens.jsx:7-238.
 * Missing production modules render an empty placeholder so RED reports behavior
 * assertion failures, not module-resolution noise.
 */

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const routerPush = vi.fn();
const routerRefresh = vi.fn();
const usePathnameMock = vi.fn(() => '/en/onboarding/complete');

vi.mock('next/navigation', () => ({
  redirect: (href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  },
  usePathname: usePathnameMock,
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

type CompleteOnboardingResult = {
  ok: boolean;
  onboardingCompletedAt?: string;
  redirectTo?: string;
  error?: string;
};

type OnboardingCompletionPageProps = {
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
  state?: 'ready' | 'loading' | 'error';
  completeOnboarding: ReturnType<typeof vi.fn>;
  retryLoad?: ReturnType<typeof vi.fn>;
};

type OnboardingCompletionPage = (
  props: OnboardingCompletionPageProps,
) => React.ReactNode | Promise<React.ReactNode>;

const baseProps: OnboardingCompletionPageProps = {
  organization: {
    id: 'org-apex',
    name: 'Apex Foods Sp. z o.o.',
    onboardingCompletedAt: null,
  },
  onboardingState: {
    currentStep: 'completion',
    completedSteps: ['org_profile', 'first_warehouse', 'first_location', 'first_product', 'first_wo'],
    skippedSteps: ['first_product'],
    savedAt: '2026-05-19T20:45:00.000Z',
  },
  state: 'ready',
  completeOnboarding: vi.fn().mockResolvedValue({
    ok: true,
    onboardingCompletedAt: '2026-05-19T21:00:00.000Z',
    redirectTo: '/settings/users',
  } satisfies CompleteOnboardingResult),
  retryLoad: vi.fn(),
};

async function loadOnboardingCompletionPage(): Promise<OnboardingCompletionPage> {
  try {
    const pageModulePath = './_components/complete-client';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    expect(mod.default, 'SET-006 completion page must default-export a renderable React component').toEqual(
      expect.any(Function),
    );
    return mod.default as OnboardingCompletionPage;
  } catch {
    return function MissingOnboardingCompletionPage() {
      return React.createElement('main', { 'data-testid': 'missing-onboarding-completion-page' });
    };
  }
}

async function renderCompletion(overrides: Partial<OnboardingCompletionPageProps> = {}) {
  const Page = await loadOnboardingCompletionPage();
  const props: OnboardingCompletionPageProps = {
    ...baseProps,
    ...overrides,
    organization: { ...baseProps.organization, ...overrides.organization },
    onboardingState: { ...baseProps.onboardingState, ...overrides.onboardingState },
    completeOnboarding: overrides.completeOnboarding ?? vi.fn().mockResolvedValue({
      ok: true,
      onboardingCompletedAt: '2026-05-19T21:00:00.000Z',
      redirectTo: '/settings/users',
    } satisfies CompleteOnboardingResult),
    retryLoad: overrides.retryLoad ?? vi.fn(),
  };

  if (Page.constructor.name === 'AsyncFunction') {
    const node = await Page(props);
    return { props, ...render(React.createElement(React.Fragment, null, node)) };
  }

  return {
    props,
    ...render(React.createElement(Page as React.ComponentType<OnboardingCompletionPageProps>, props)),
  };
}

function stepperLabels() {
  return screen.getAllByRole('button', { name: /SET-00[1-6]/ }).map((button) => button.textContent);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  usePathnameMock.mockReturnValue('/en/onboarding/complete');
});

describe('SET-006 onboarding completion prototype parity', () => {
  it('renders the completion celebration inside the six-step wizard with saved-state/resume progress and keyboard order', async () => {
    const user = userEvent.setup();
    await renderCompletion();

    expect(screen.getByRole('heading', { name: /onboarding wizard/i })).toBeInTheDocument();
    expect(screen.getByText(/6-step setup · target <15 minutes/i)).toBeInTheDocument();
    expect(screen.getByText(/state saved automatically/i)).toBeInTheDocument();
    expect(screen.getByText(/83% complete/i)).toBeInTheDocument();
    expect(screen.getByText(/Resume capability/i)).toBeInTheDocument();
    expect(screen.getByText(/onboarding_state\.current_step/i)).toBeInTheDocument();

    expect(stepperLabels()).toEqual([
      expect.stringMatching(/1.*✓.*Organization profile.*SET-001/i),
      expect.stringMatching(/2.*✓.*First warehouse.*SET-002/i),
      expect.stringMatching(/3.*✓.*First location.*SET-003/i),
      expect.stringMatching(/4.*✓.*First product.*SET-004/i),
      expect.stringMatching(/5.*✓.*First work order.*SET-005/i),
      expect.stringMatching(/6.*Completion.*SET-006/i),
    ]);
    expect(screen.getByRole('button', { name: /Completion.*SET-006/i })).toHaveAttribute(
      'aria-current',
      'step',
    );

    const completion = screen.getByRole('region', { name: /SET-006 · Completion/i });
    expect(within(completion).getByText('🎉')).toBeInTheDocument();
    expect(within(completion).getByRole('heading', { name: /you're live on monopilot/i })).toBeInTheDocument();
    expect(
      within(completion).getByText(/organizations\.onboarding_completed_at.*timestamp recorded/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Step 6 of 6 · 5 completed · 1 skipped/i)).toBeInTheDocument();

    await user.tab();
    expect(screen.getByRole('button', { name: /restart/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /Organization profile.*SET-001/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /First warehouse.*SET-002/i })).toHaveFocus();
  });

  it('supports back/continue/skip wizard state transitions around the skippable first-WO step', async () => {
    const user = userEvent.setup();
    await renderCompletion();

    await user.click(screen.getByRole('button', { name: /← Back/i }));
    const firstWo = screen.getByRole('region', { name: /SET-005 · First work order/i });
    expect(within(firstWo).getByRole('heading', { name: /schedule your first work order/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Skip this step →/i })).toBeInTheDocument();
    expect(screen.getByText(/Step 5 of 6 · 5 completed · 1 skipped/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Continue →/i }));
    expect(screen.getByRole('region', { name: /SET-006 · Completion/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /← Back/i }));
    await user.click(screen.getByRole('button', { name: /Skip this step →/i }));
    expect(screen.getByRole('region', { name: /SET-006 · Completion/i })).toBeInTheDocument();
    expect(screen.getByText(/Step 6 of 6 · 5 completed · 1 skipped/i)).toBeInTheDocument();
  });

  it('renders exactly the amended next-step card links and completes onboarding via the Server Action before routing to admin', async () => {
    const user = userEvent.setup();
    const completeOnboarding = vi.fn().mockResolvedValue({
      ok: true,
      onboardingCompletedAt: '2026-05-19T21:00:00.000Z',
      redirectTo: '/settings/users',
    } satisfies CompleteOnboardingResult);
    await renderCompletion({ completeOnboarding });

    const cards = screen.getAllByRole('link', { name: /Module toggles|Schema browser|Rules registry/i });
    expect(cards).toHaveLength(3);
    expect(screen.getByRole('link', { name: /Module toggles/i })).toHaveAttribute('href', '/admin/features');
    expect(screen.getByRole('link', { name: /Schema browser/i })).toHaveAttribute('href', '/admin/schema');
    expect(screen.getByRole('link', { name: /Rules registry/i })).toHaveAttribute('href', '/admin/rules');
    expect(screen.queryByRole('link', { name: /products|planning/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Finish onboarding/i }));

    expect(completeOnboarding).toHaveBeenCalledWith({ orgId: 'org-apex' });
    expect(await screen.findByText(/onboarding completed/i)).toBeInTheDocument();
    expect(screen.getByText(/2026-05-19T21:00:00.000Z/i)).toBeInTheDocument();
    expect(routerRefresh).toHaveBeenCalledTimes(1);
    expect(routerPush).toHaveBeenCalledWith('/en/settings/users');
    expect(routerPush).not.toHaveBeenCalledWith('/admin');
    expect(routerPush).not.toHaveBeenCalledWith('/onboarding');
  });

  it('fails loudly for loading and error states instead of silently skipping unverified UI parity', async () => {
    const retryLoad = vi.fn();
    await renderCompletion({ state: 'loading', retryLoad });

    expect(screen.getByRole('status', { name: /loading onboarding completion/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Finish onboarding/i })).toBeDisabled();

    cleanup();
    await renderCompletion({ state: 'error', retryLoad });

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load onboarding progress/i);
    await userEvent.click(screen.getByRole('button', { name: /Retry/i }));
    expect(retryLoad).toHaveBeenCalledTimes(1);
  });
});
