import { mutateOnboarding, type OnboardingResult } from './advance';

export async function jumpOnboarding(rawInput: unknown = {}): Promise<OnboardingResult> {
  'use server';

  return mutateOnboarding('jump', rawInput);
}
