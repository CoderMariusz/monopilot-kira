import { withOrgContext } from '../auth/with-org-context';
import type { OnboardingState, OnboardingStep, OnboardingStepId, OnboardingStepStatus } from './types';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};

type OrgContextLike = {
  orgId: string;
  client: QueryClient;
};

type OrganizationOnboardingRow = {
  onboarding_state: unknown;
};

type PersistedOnboardingState = {
  completedSteps: number[];
  skippedSteps: number[];
};

const TOTAL_STEPS = 6 as const;

export const ONBOARDING_STEP_DEFINITIONS: ReadonlyArray<{
  id: OnboardingStepId;
  label: string;
  order: number;
}> = [
  { id: 'org_profile', label: 'Organization profile', order: 1 },
  { id: 'warehouse', label: 'Warehouse', order: 2 },
  { id: 'location', label: 'Location', order: 3 },
  { id: 'product', label: 'Product', order: 4 },
  { id: 'workorder', label: 'Work order', order: 5 },
  { id: 'completion', label: 'Completion', order: 6 },
];

export const STEP_ID_TO_ORDER: Record<OnboardingStepId, number> = ONBOARDING_STEP_DEFINITIONS.reduce(
  (acc, step) => ({ ...acc, [step.id]: step.order }),
  {} as Record<OnboardingStepId, number>,
);

export async function getOnboardingState(orgId: string): Promise<OnboardingState> {
  return withOrgContext<OnboardingState>(async (ctx): Promise<OnboardingState> => {
    const context = ctx as OrgContextLike;
    if (context.orgId !== orgId) return toOnboardingState({ completedSteps: [], skippedSteps: [] });

    const { rows } = await context.client.query<OrganizationOnboardingRow>(
      `select onboarding_state
         from public.organizations
        where id = $1::uuid
        limit 1`,
      [orgId],
    );

    return toOnboardingState(normalizePersistedState(rows[0]?.onboarding_state));
  });
}

export function toOnboardingState(state: PersistedOnboardingState): OnboardingState {
  const completed = new Set(state.completedSteps);
  const skipped = new Set(state.skippedSteps);
  const currentDefinition =
    ONBOARDING_STEP_DEFINITIONS.find((step) => !completed.has(step.order) && !skipped.has(step.order)) ?? null;
  const currentStepId = currentDefinition?.id ?? null;

  const steps: OnboardingStep[] = ONBOARDING_STEP_DEFINITIONS.map((step) => ({
    ...step,
    status: stepStatus(step.order, step.id, completed, skipped, currentStepId),
  }));

  const completedCount = steps.filter((step) => step.status === 'completed').length;

  return {
    steps,
    currentStepId,
    completedCount,
    totalSteps: TOTAL_STEPS,
    allComplete: completedCount === TOTAL_STEPS,
  };
}

export function normalizePersistedState(raw: unknown): PersistedOnboardingState {
  if (!isRecord(raw)) return { completedSteps: [], skippedSteps: [] };
  return {
    completedSteps: normalizeStepArray(raw.completed_steps),
    skippedSteps: normalizeStepArray(raw.skipped_steps),
  };
}

function stepStatus(
  order: number,
  id: OnboardingStepId,
  completed: ReadonlySet<number>,
  skipped: ReadonlySet<number>,
  currentStepId: OnboardingStepId | null,
): OnboardingStepStatus {
  if (completed.has(order)) return 'completed';
  if (skipped.has(order)) return 'skipped';
  if (id === currentStepId) return 'current';
  return 'not_started';
}

function normalizeStepArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.filter((step): step is number => Number.isInteger(step) && step >= 1 && step <= TOTAL_STEPS)),
  ).sort((a, b) => a - b);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
