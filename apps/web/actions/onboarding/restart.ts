import { mutateOnboarding, type OnboardingResult } from './advance';

export async function restartOnboarding(rawInput: unknown = {}): Promise<OnboardingResult> {
  'use server';

  return mutateOnboarding('restart', rawInput);
}
