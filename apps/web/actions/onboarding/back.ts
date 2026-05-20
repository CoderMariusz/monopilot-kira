import { mutateOnboarding, type OnboardingResult } from './advance';

export async function backOnboarding(rawInput: unknown = {}): Promise<OnboardingResult> {
  'use server';

  return mutateOnboarding('back', rawInput);
}
