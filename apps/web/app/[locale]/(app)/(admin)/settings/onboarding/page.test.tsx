/**
 * @vitest-environment jsdom
 * Wave 5 (Class D build-now) — /settings/onboarding entry-point panel.
 *
 * The dead SettingsRouteStub is replaced with a real entry point that reads the
 * org's REAL onboarding state via loadOnboardingContext and links to the
 * onboarding wizard. Proves: no stub, real state surfaced, working launch link.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadOnboardingContext: vi.fn(),
}));

vi.mock('../../../../../../actions/onboarding/load', () => ({
  loadOnboardingContext: mocks.loadOnboardingContext,
}));

async function renderPage() {
  const mod = (await import(/* @vite-ignore */ './page')) as { default: (p: { params: Promise<{ locale: string }> }) => Promise<React.ReactNode> };
  const node = await mod.default({ params: Promise.resolve({ locale: 'en' }) });
  return render(<>{node}</>);
}

afterEach(() => cleanup());

describe('/settings/onboarding entry-point panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadOnboardingContext.mockReset();
  });

  it('renders a real entry-point panel (not the SettingsRouteStub) linking to the onboarding wizard', async () => {
    mocks.loadOnboardingContext.mockResolvedValue({
      ok: true,
      organization: { id: 'o1', name: 'Apex', onboardingCompletedAt: null, onboardingStartedAt: '2026-06-01T00:00:00.000Z' },
      onboardingState: { currentStep: 'first_warehouse', completedSteps: ['org_profile'], skippedSteps: [], skippedStepNumbers: [], firstWoAt: null, savedAt: '2026-06-01T00:00:00.000Z' },
      firstWarehouse: null,
    });

    const { container } = await renderPage();

    expect(mocks.loadOnboardingContext, 'panel must read real onboarding state').toHaveBeenCalled();
    expect(container.querySelector('[data-testid^="settings-route-stub-"]')).toBeNull();
    expect(screen.getByTestId('settings-onboarding-panel')).toBeInTheDocument();

    const launch = screen.getByTestId('onboarding-launch') as HTMLAnchorElement;
    expect(launch).toHaveAttribute('href', '/en/onboarding/profile');

    // Real progress derived from completedSteps (1 of 6), in-progress status.
    expect(screen.getByTestId('onboarding-progress')).toHaveTextContent('1 / 6');
    expect(screen.getByTestId('onboarding-status')).toHaveTextContent(/in progress/i);
  });

  it('reflects a completed onboarding state from real data', async () => {
    mocks.loadOnboardingContext.mockResolvedValue({
      ok: true,
      organization: { id: 'o1', name: 'Apex', onboardingCompletedAt: '2026-06-02T00:00:00.000Z', onboardingStartedAt: '2026-06-01T00:00:00.000Z' },
      onboardingState: { currentStep: 'completion', completedSteps: ['org_profile', 'first_warehouse', 'first_location', 'first_product', 'first_wo', 'completion'], skippedSteps: [], skippedStepNumbers: [], firstWoAt: null, savedAt: '2026-06-02T00:00:00.000Z' },
      firstWarehouse: null,
    });

    await renderPage();

    expect(screen.getByTestId('onboarding-status')).toHaveTextContent(/complete/i);
    expect(screen.getByTestId('onboarding-progress')).toHaveTextContent('6 / 6');
  });

  it('does not fabricate state when onboarding context is unavailable', async () => {
    mocks.loadOnboardingContext.mockResolvedValue({ ok: false, error: 'forbidden' });
    const { container } = await renderPage();

    expect(container.querySelector('[data-testid^="settings-route-stub-"]')).toBeNull();
    expect(screen.getByTestId('settings-onboarding-panel')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-progress')).toHaveTextContent('—');
  });
});
