'use server';

import { saveOrgProfile as saveOrgProfileAction } from '../../actions/onboarding/save-org-profile';
import { createFirstWarehouse as createFirstWarehouseAction } from '../../actions/onboarding/create-first-warehouse';
import { createFirstLocation as createFirstLocationAction } from '../../actions/onboarding/create-first-location';
import { markFirstWoCreated as markFirstWoCreatedAction } from '../../actions/onboarding/mark-first-wo-created';
import { completeOnboarding as completeOnboardingAction } from '../../actions/onboarding/complete-onboarding';
import { skipOnboardingStep } from '../../actions/onboarding/skip-step';
import { completeOnboardingStep } from '../../actions/onboarding/complete-step';

type ProductSkipResult = { ok: true; skippedStep: 4; nextStep: 'first_wo' } | { ok: false; error: string };
type ProductCompleteResult = { ok: true; completedStep: 4; nextStep: 'first_wo' } | { ok: false; error: string };
type WorkOrderSkipResult =
  | { ok: true; skippedStep: 5; nextStep: 'completion'; skippedSteps: number[] }
  | { ok: false; error: string };
type WorkOrderCompleteResult = { ok: true; completedStep: 5; nextStep: 'completion' } | { ok: false; error: string };

export async function saveOrgProfile(input: Parameters<typeof saveOrgProfileAction>[0]) {
  return saveOrgProfileAction(input);
}

export async function createFirstWarehouse(input: Parameters<typeof createFirstWarehouseAction>[0]) {
  return createFirstWarehouseAction(input);
}

export async function createFirstLocation(input: Parameters<typeof createFirstLocationAction>[0]) {
  return createFirstLocationAction(input);
}

export async function markFirstWoCreated(input: Parameters<typeof markFirstWoCreatedAction>[0]) {
  return markFirstWoCreatedAction(input);
}

export async function completeOnboarding(input: Parameters<typeof completeOnboardingAction>[0]) {
  return completeOnboardingAction(input);
}

export async function skipOnboardingProductStep(step: 4): Promise<ProductSkipResult> {
  const result = await skipOnboardingStep(step);
  if (result.ok === false) return result;
  if (result.skippedStep !== 4) return { ok: false, error: 'unexpected_step_result' };
  return result;
}

export async function completeOnboardingProductStep(step: 4): Promise<ProductCompleteResult> {
  const result = await completeOnboardingStep(step);
  if (result.ok === false) return result;
  if (result.completedStep !== 4) return { ok: false, error: 'unexpected_step_result' };
  return result;
}

export async function skipOnboardingWorkOrderStep(step: 5): Promise<WorkOrderSkipResult> {
  const result = await skipOnboardingStep(step);
  if (result.ok === false) return result;
  if (result.skippedStep !== 5) return { ok: false, error: 'unexpected_step_result' };
  return result;
}

export async function completeOnboardingWorkOrderStep(step: 5): Promise<WorkOrderCompleteResult> {
  const result = await completeOnboardingStep(step);
  if (result.ok === false) return result;
  if (result.completedStep !== 5) return { ok: false, error: 'unexpected_step_result' };
  return result;
}
