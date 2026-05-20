import { mutateOnboarding } from './advance';

export type CompleteStepNumber = 4 | 5;

export type CompleteStepResult =
  | { ok: true; completedStep: 4; nextStep: 'first_wo' }
  | { ok: true; completedStep: 5; nextStep: 'completion' }
  | { ok: false; error: string };

export async function completeOnboardingStep(stepNumber: CompleteStepNumber): Promise<CompleteStepResult> {
  'use server';

  if (stepNumber !== 4 && stepNumber !== 5) {
    return { ok: false, error: 'invalid_step' };
  }
  const result = await mutateOnboarding('advance', { step: stepNumber });
  if (result.ok === false) {
    return { ok: false, error: result.error };
  }
  if (stepNumber === 4) {
    return { ok: true, completedStep: 4, nextStep: 'first_wo' };
  }
  return { ok: true, completedStep: 5, nextStep: 'completion' };
}
