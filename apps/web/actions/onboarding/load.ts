import { withOrgContext } from '../../lib/auth/with-org-context';

type OnboardingStepKey =
  | 'org_profile'
  | 'first_warehouse'
  | 'first_location'
  | 'first_product'
  | 'first_wo'
  | 'completion';

const STEP_NUMBER_TO_KEY: Record<number, OnboardingStepKey> = {
  1: 'org_profile',
  2: 'first_warehouse',
  3: 'first_location',
  4: 'first_product',
  5: 'first_wo',
  6: 'completion',
};

export type LoadedOrganization = {
  id: string;
  name: string;
  timezone: string;
  locale: string;
  currency: string;
  gs1Prefix: string;
  onboardingCompletedAt: string | null;
  onboardingStartedAt: string | null;
};

export type LoadedOnboardingState = {
  currentStep: OnboardingStepKey;
  completedSteps: OnboardingStepKey[];
  skippedSteps: OnboardingStepKey[];
  skippedStepNumbers: number[];
  firstWoAt: string | null;
  savedAt: string;
};

export type LoadedWarehouse = {
  id: string;
  code: string;
  name: string;
};

export type LoadOnboardingContextResult =
  | {
      ok: true;
      organization: LoadedOrganization;
      onboardingState: LoadedOnboardingState;
      firstWarehouse: LoadedWarehouse | null;
    }
  | { ok: false; error: 'not_found' | 'forbidden' | 'persistence_failed'; message?: string };

type QueryResult<T> = { rows: T[]; rowCount: number };

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
};

type OrgContextLike = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type OrganizationRow = {
  id: string;
  name: string;
  timezone: string;
  locale: string;
  currency: string;
  gs1_prefix: string | null;
  onboarding_state: unknown;
  onboarding_completed_at: string | Date | null;
};

function toIsoOrNull(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === 'string') return value.length > 0 ? value : null;
  return null;
}

type WarehouseRow = {
  id: string;
  code: string;
  name: string;
};

export async function loadOnboardingContext(): Promise<LoadOnboardingContextResult> {
  'use server';

  try {
    return await withOrgContext<LoadOnboardingContextResult>(async (ctx): Promise<LoadOnboardingContextResult> => {
      const context = ctx as OrgContextLike;
      const orgRes = await context.client.query<OrganizationRow>(
        `select id, name, timezone, locale, currency, gs1_prefix, onboarding_state, onboarding_completed_at
           from public.organizations
          where id = app.current_org_id()
          limit 1`,
      );
      const orgRow = orgRes.rows[0];
      if (!orgRow) {
        return { ok: false, error: 'not_found' };
      }

      const whRes = await context.client.query<WarehouseRow>(
        `select id, code, name
           from public.warehouses
          where org_id = app.current_org_id()
          order by created_at asc nulls last, code asc
          limit 1`,
      );
      const whRow = whRes.rows[0];

      const state = normalizeOnboardingState(orgRow.onboarding_state);
      return {
        ok: true,
        organization: {
          id: orgRow.id,
          name: orgRow.name ?? '',
          timezone: orgRow.timezone ?? 'Europe/Warsaw',
          locale: orgRow.locale ?? 'pl',
          currency: orgRow.currency ?? 'GBP',
          gs1Prefix: orgRow.gs1_prefix ?? '',
          onboardingCompletedAt: toIsoOrNull(orgRow.onboarding_completed_at),
          onboardingStartedAt: state.startedAt,
        },
        onboardingState: {
          currentStep: state.currentStep,
          completedSteps: state.completedSteps,
          skippedSteps: state.skippedSteps,
          skippedStepNumbers: state.skippedStepNumbers,
          firstWoAt: state.firstWoAt,
          savedAt: state.lastActivityAt ?? '',
        },
        firstWarehouse: whRow ? { id: whRow.id, code: whRow.code, name: whRow.name } : null,
      };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

function normalizeOnboardingState(raw: unknown): {
  currentStep: OnboardingStepKey;
  completedSteps: OnboardingStepKey[];
  skippedSteps: OnboardingStepKey[];
  skippedStepNumbers: number[];
  firstWoAt: string | null;
  startedAt: string | null;
  lastActivityAt: string | null;
} {
  if (!isRecord(raw)) {
    return {
      currentStep: 'org_profile',
      completedSteps: [],
      skippedSteps: [],
      skippedStepNumbers: [],
      firstWoAt: null,
      startedAt: null,
      lastActivityAt: null,
    };
  }
  const currentStepNum = typeof raw.current_step === 'number' ? raw.current_step : 1;
  const completedNums = stepArray(raw.completed_steps);
  const skippedNums = stepArray(raw.skipped_steps);
  return {
    currentStep: STEP_NUMBER_TO_KEY[clampStep(currentStepNum)]!,
    completedSteps: completedNums.map((n) => STEP_NUMBER_TO_KEY[n]!).filter(Boolean),
    skippedSteps: skippedNums.map((n) => STEP_NUMBER_TO_KEY[n]!).filter(Boolean),
    skippedStepNumbers: skippedNums,
    firstWoAt: toIsoOrNull(raw.first_wo_at),
    startedAt: toIsoOrNull(raw.started_at),
    lastActivityAt: toIsoOrNull(raw.last_activity_at),
  };
}

function clampStep(value: number): number {
  if (!Number.isInteger(value)) return 1;
  return Math.min(6, Math.max(1, value));
}

function stepArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((step): step is number => typeof step === 'number' && Number.isInteger(step) && step >= 1 && step <= 6)
    .sort((a, b) => a - b);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
