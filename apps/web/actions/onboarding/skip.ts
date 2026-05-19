import { mutateOnboarding, type OnboardingResult } from './advance';

export async function skipOnboarding(rawInput: unknown = {}): Promise<OnboardingResult> {
  'use server';

  return mutateOnboarding('skip', rawInput);
}
