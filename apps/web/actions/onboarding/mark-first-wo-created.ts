import { mutateOnboarding } from './advance';

export type MarkFirstWoCreatedInput = {
  orgId: string;
  workOrderId: string;
  createdAt: string;
};

export type MarkFirstWoCreatedResult =
  | {
      ok: true;
      workOrderId: string;
      firstWoAt: string;
      audit: { eventType: 'settings.onboarding.first_wo_created'; timeToFirstWoMinutes: number };
      nextStep: 'completion';
    }
  | { ok: false; error: string };

export async function markFirstWoCreated(rawInput: MarkFirstWoCreatedInput): Promise<MarkFirstWoCreatedResult> {
  'use server';

  if (!rawInput || typeof rawInput !== 'object' || !rawInput.workOrderId || !rawInput.createdAt) {
    return { ok: false, error: 'invalid_input' };
  }
  const result = await mutateOnboarding('first_wo', { occurredAt: rawInput.createdAt });
  if (result.ok === false) {
    return { ok: false, error: result.error };
  }
  const state = result.data.state;
  const firstWoAt = state.first_wo_at ?? rawInput.createdAt;
  const minutes =
    typeof state.time_to_first_wo_ms === 'number'
      ? Math.max(0, Math.round(state.time_to_first_wo_ms / 60000))
      : 0;
  return {
    ok: true,
    workOrderId: rawInput.workOrderId,
    firstWoAt,
    audit: { eventType: 'settings.onboarding.first_wo_created', timeToFirstWoMinutes: minutes },
    nextStep: 'completion',
  };
}
