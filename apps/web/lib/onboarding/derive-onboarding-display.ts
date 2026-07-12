export const ONBOARDING_TOTAL_STEPS = 6 as const;

/**
 * Single source of truth for onboarding progress UI.
 * When organizations.onboarding_completed_at is set, the org is fully complete —
 * never show partial step counters or percent that contradict it.
 */
export function deriveOnboardingDisplay(input: {
  onboardingCompletedAt: string | null;
  completedStepCount: number;
  totalSteps?: number;
}): {
  isComplete: boolean;
  completedCount: number;
  totalSteps: number;
  percentComplete: number;
} {
  const totalSteps = input.totalSteps ?? ONBOARDING_TOTAL_STEPS;
  if (input.onboardingCompletedAt) {
    return {
      isComplete: true,
      completedCount: totalSteps,
      totalSteps,
      percentComplete: 100,
    };
  }
  const completedCount = Math.min(Math.max(input.completedStepCount, 0), totalSteps);
  return {
    isComplete: false,
    completedCount,
    totalSteps,
    percentComplete: Math.round((completedCount / totalSteps) * 100),
  };
}
