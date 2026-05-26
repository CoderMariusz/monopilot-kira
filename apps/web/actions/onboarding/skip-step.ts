import { mutateOnboarding } from './advance';

export type SkipStepNumber = 4 | 5;

export type SkipStepResult =
  | { ok: true; skippedStep: 4; nextStep: 'first_wo' }
  | { ok: true; skippedStep: 5; nextStep: 'completion'; skippedSteps: number[] }
  | { ok: false; error: string };

export async function skipOnboardingStep(stepNumber: SkipStepNumber): Promise<SkipStepResult> {
  'use server';

  if (stepNumber !== 4 && stepNumber !== 5) {
    return { ok: false, error: 'invalid_step' };
  }
  const result = await mutateOnboarding('skip', { step: stepNumber });
  if (result.ok === false) {
    return { ok: false, error: result.error };
  }
  if (stepNumber === 4) {
    return { ok: true, skippedStep: 4, nextStep: 'first_wo' };
  }
  return {
    ok: true,
    skippedStep: 5,
    nextStep: 'completion',
    skippedSteps: result.data.state.skipped_steps ?? [],
  };
}
