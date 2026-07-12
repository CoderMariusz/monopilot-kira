import { describe, expect, it } from 'vitest';

import { deriveOnboardingDisplay, ONBOARDING_TOTAL_STEPS } from './derive-onboarding-display';

describe('deriveOnboardingDisplay', () => {
  it('treats onboarding_completed_at as fully complete even when step JSON is partial', () => {
    const display = deriveOnboardingDisplay({
      onboardingCompletedAt: '2026-07-12T00:00:00.000Z',
      completedStepCount: 3,
      totalSteps: ONBOARDING_TOTAL_STEPS,
    });

    expect(display).toEqual({
      isComplete: true,
      completedCount: 6,
      totalSteps: 6,
      percentComplete: 100,
    });
  });

  it('derives partial progress only when onboarding is not completed', () => {
    const display = deriveOnboardingDisplay({
      onboardingCompletedAt: null,
      completedStepCount: 3,
      totalSteps: ONBOARDING_TOTAL_STEPS,
    });

    expect(display).toEqual({
      isComplete: false,
      completedCount: 3,
      totalSteps: 6,
      percentComplete: 50,
    });
  });
});
