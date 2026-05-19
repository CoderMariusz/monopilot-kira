/**
 * @vitest-environment jsdom
 * T-041 / SET-001 — Onboarding organization profile step
 *
 * RED phase: RTL tests pin the production org_profile step behavior from
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

type OrgProfileInput = {
  orgId: string;
  orgName: string;
  timezone: string;
  locale: string;
  currency: string;
  gs1Prefix: string;
};

type OrgProfileResult =
  | {
      ok: true;
      organization: {
        id: string;
        name: string;
        timezone: string;
        locale: string;
        currency: string;
        gs1Prefix: string;
      };
      onboardingState: { current_step: 2; completed: ['org_profile']; skipped: OnboardingStepKey[] };
      redirectTo: '/onboarding/warehouse';
    }
  | { ok: false; error: 'VALIDATION_FAILED' | 'PERSISTENCE_FAILED'; field?: keyof OrgProfileInput; message?: string };

type OnboardingProfilePageProps = {
  organization: {
    id: string;
    name: string;
    timezone: string;
    locale: string;
    currency: string;
    gs1Prefix: string;
    onboardingCompletedAt: string | null;
  };
  onboardingState: {
    currentStep: 'org_profile';
    completedSteps: OnboardingStepKey[];
    skippedSteps: OnboardingStepKey[];
    savedAt: string;
  };
  state?: 'ready' | 'loading' | 'error' | 'permission_denied';
  saveOrgProfile: ReturnType<typeof vi.fn>;
  retryLoad?: ReturnType<typeof vi.fn>;
};

type OnboardingProfilePage = (
  props: OnboardingProfilePageProps,
) => React.ReactNode | Promise<React.ReactNode>;

const validResult: OrgProfileResult = {
  ok: true,
  organization: {
    id: 'org-apex',
    name: 'Apex Foods Sp. z o.o.',
    timezone: 'Europe/Warsaw',
    locale: 'pl-PL',
    currency: 'PLN',
    gs1Prefix: '5012345',
  },
  onboardingState: { current_step: 2, completed: ['org_profile'], skipped: [] },
  redirectTo: '/onboarding/warehouse',
};

const baseProps: OnboardingProfilePageProps = {
  organization: {
    id: 'org-apex',
    name: 'Apex Foods Sp. z o.o.',
    timezone: 'Europe/Warsaw',
    locale: 'pl-PL',
    currency: 'PLN',
    gs1Prefix: '5012345',
    onboardingCompletedAt: null,
  },
  onboardingState: {
    currentStep: 'org_profile',
    completedSteps: [],
    skippedSteps: [],
    savedAt: '2026-05-19T20:00:00.000Z',
  },
  state: 'ready',
  saveOrgProfile: vi.fn().mockResolvedValue(validResult),
  retryLoad: vi.fn(),
};

async function loadOnboardingProfilePage(): Promise<OnboardingProfilePage> {
  try {
    const pageModulePath = './page';
    const mod = await import(/* @vite-ignore */ pageModulePath);
    expect(mod.default, 'SET-001 profile page must default-export a renderable React component').toEqual(
      expect.any(Function),
    );
    return mod.default as OnboardingProfilePage;
  } catch {
    return function MissingOnboardingProfilePage() {
      return React.createElement('main', { 'data-testid': 'missing-onboarding-profile-page' });
    };
  }
}

async function renderProfile(overrides: Partial<OnboardingProfilePageProps> = {}) {
  const Page = await loadOnboardingProfilePage();
  const props: OnboardingProfilePageProps = {
    ...baseProps,
    ...overrides,
    organization: { ...baseProps.organization, ...overrides.organization },
    onboardingState: { ...baseProps.onboardingState, ...overrides.onboardingState },
    saveOrgProfile: overrides.saveOrgProfile ?? vi.fn().mockResolvedValue(validResult),
    retryLoad: overrides.retryLoad ?? vi.fn(),
  };

  if (Page.constructor.name === 'AsyncFunction') {
    const node = await Page(props);
    return { props, ...render(React.createElement(React.Fragment, null, node)) };
  }

  return {
    props,
    ...render(React.createElement(Page as React.ComponentType<OnboardingProfilePageProps>, props)),
  };
}

function stepperLabels() {
  const stepper = screen.getByRole('navigation', { name: /onboarding steps/i });
  return within(stepper).getAllByRole('button').map((button) => button.textContent?.replace(/\s+/g, ' ').trim());
}

afterEach(() => {
  cleanup();
  routerPush.mockReset();
  routerRefresh.mockReset();
  vi.clearAllMocks();
});

describe('SET-001 onboarding organization-profile prototype parity', () => {
  it('renders the org_profile stepper, launcher copy, fields, loading/error states, and focus order from the canonical onboarding prototype', async () => {
    const user = userEvent.setup();
    const retryLoad = vi.fn();
    await renderProfile({ retryLoad });

    expect(screen.getByRole('heading', { name: /onboarding wizard/i })).toBeInTheDocument();
    expect(screen.getByText(/6-step setup · target <15 minutes/i)).toBeInTheDocument();
    expect(screen.getByText(/state saved automatically/i)).toBeInTheDocument();
    expect(screen.getByText(/0% complete/i)).toBeInTheDocument();
    expect(screen.getByText(/SET-001 Wizard Launcher/i)).toBeInTheDocument();
    expect(screen.getByText(/onboarding_completed_at IS NULL/i)).toBeInTheDocument();
    expect(screen.getByText(/onboarding_state\.current_step/i)).toBeInTheDocument();

    expect(stepperLabels()).toEqual([
      '1 Organization profile SET-001',
      '2 First warehouse SET-002',
      '3 First location SET-003',
      '4 First product SET-004',
      '5 First work order SET-005',
      '6 Completion SET-006',
    ]);
    expect(screen.getByRole('button', { name: /Organization profile.*SET-001/i })).toHaveAttribute(
      'aria-current',
      'step',
    );

    const profileStep = screen.getByRole('region', { name: /SET-001 · Organization profile/i });
    expect(within(profileStep).getByText(/Name, timezone, locale, currency, logo/i)).toBeInTheDocument();
    expect(within(profileStep).getByText(/use these defaults across every module/i)).toBeInTheDocument();
    expect(within(profileStep).getByLabelText(/Organization name/i)).toHaveValue('Apex Foods Sp. z o.o.');
    expect(within(profileStep).getByRole('combobox', { name: /Timezone/i })).toHaveValue('Europe/Warsaw');
    expect(within(profileStep).getByRole('combobox', { name: /Locale/i })).toHaveValue('pl-PL');
    expect(within(profileStep).getByRole('combobox', { name: /Currency/i })).toHaveValue('PLN');
    expect(within(profileStep).getByLabelText(/GS1 Company Prefix/i)).toHaveValue('5012345');
    expect(within(profileStep).getByText(/Required before SSCC generation/i)).toBeInTheDocument();
    expect(within(profileStep).getByRole('button', { name: /Upload image/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Skip this step/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /← Back/i })).toBeDisabled();
    expect(screen.getByText(/Step 1 of 6 · 0 completed/i)).toBeInTheDocument();

    await user.tab();
    expect(screen.getByRole('button', { name: /Restart/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /Organization profile.*SET-001/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /First warehouse.*SET-002/i })).toHaveFocus();

    cleanup();
    await renderProfile({ state: 'loading', retryLoad });
    expect(screen.getByRole('status', { name: /loading onboarding profile/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue/i })).toBeDisabled();

    cleanup();
    await renderProfile({ state: 'error', retryLoad });
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load onboarding profile/i);
    await userEvent.click(screen.getByRole('button', { name: /Retry/i }));
    expect(retryLoad).toHaveBeenCalledTimes(1);

    cleanup();
    await renderProfile({ state: 'permission_denied' });
    expect(screen.getByRole('alert')).toHaveTextContent(/settings\.onboarding\.write/i);
    expect(screen.queryByRole('button', { name: /Continue/i })).not.toBeInTheDocument();
  });

  it('rejects an empty GS1 Company Prefix with the exact S-U2 Zod message and keeps the user on SET-001', async () => {
    const user = userEvent.setup();
    const saveOrgProfile = vi.fn().mockResolvedValue(validResult);
    await renderProfile({ saveOrgProfile });

    const gs1Prefix = screen.getByLabelText(/GS1 Company Prefix/i);
    await user.clear(gs1Prefix);
    await user.click(screen.getByRole('button', { name: /Continue →|Next/i }));

    expect(saveOrgProfile).not.toHaveBeenCalled();
    expect(screen.getByText('GS1 Company Prefix is required for SSCC generation')).toBeInTheDocument();
    expect(gs1Prefix).toHaveAttribute('aria-invalid', 'true');
    expect(gs1Prefix).toHaveFocus();
    expect(screen.getByRole('region', { name: /SET-001 · Organization profile/i })).toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('submits a valid profile through the Server Action contract, persists current_step=2, and routes to the warehouse step', async () => {
    const user = userEvent.setup();
    const saveOrgProfile = vi.fn().mockResolvedValue(validResult);
    await renderProfile({ saveOrgProfile });

    await user.clear(screen.getByLabelText(/Organization name/i));
    await user.type(screen.getByLabelText(/Organization name/i), 'Apex Foods Sp. z o.o.');
    await user.selectOptions(screen.getByRole('combobox', { name: /Timezone/i }), 'Europe/Warsaw');
    await user.selectOptions(screen.getByRole('combobox', { name: /Locale/i }), 'pl-PL');
    await user.selectOptions(screen.getByRole('combobox', { name: /Currency/i }), 'PLN');
    await user.clear(screen.getByLabelText(/GS1 Company Prefix/i));
    await user.type(screen.getByLabelText(/GS1 Company Prefix/i), '5012345');

    await user.click(screen.getByRole('button', { name: /Continue →|Next/i }));

    expect(saveOrgProfile).toHaveBeenCalledWith({
      orgId: 'org-apex',
      orgName: 'Apex Foods Sp. z o.o.',
      timezone: 'Europe/Warsaw',
      locale: 'pl-PL',
      currency: 'PLN',
      gs1Prefix: '5012345',
    } satisfies OrgProfileInput);
    expect(await screen.findByText(/onboarding_state\.current_step = 2/i)).toBeInTheDocument();
    expect(screen.getByText(/Organization profile saved/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /First warehouse.*SET-002/i })).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(routerPush).toHaveBeenCalledWith('/onboarding/warehouse');
  });
});
