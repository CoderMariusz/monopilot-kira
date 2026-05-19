import { mutateOnboarding, type OnboardingResult } from './advance';

export async function markFirstWorkOrderCreated(rawInput: unknown = {}): Promise<OnboardingResult> {
  'use server';

  return mutateOnboarding('first_wo', rawInput);
}
