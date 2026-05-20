/**
 * Onboarding Server Actions (T2-api shape).
 *
 * Each action is a fail-closed `'use server'` wrapper that resolves the org
 * context via `withOrgContext`. The SET-* persistence layer is not finished
 * in this worktree, so every action returns the matching client's failure
 * shape (`PERSISTENCE_FAILED` or a stringly-typed equivalent) rather than
 * fabricating a success path.
 *
 * Production usage: imported by the onboarding RSC pages and passed as
 * Server Action props to the matching client islands. Tests render the
 * client islands directly with mocked actions and never touch this module.
 */

'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';

const FAILED_MESSAGE = 'Onboarding persistence is not wired yet in this build.';

async function probeOrgContext(): Promise<void> {
  // Verifies a real Supabase session + org_id are resolvable. Throws on
  // unauthenticated/session-less callers so the caller can return a typed
  // failure instead of pretending to persist.
  await withOrgContext(async () => null);
}

// SET-001 saveOrgProfile ────────────────────────────────────────────────────
type OrgProfileInput = {
  orgId: string;
  orgName: string;
  timezone: string;
  locale: string;
  currency: string;
  gs1Prefix: string;
};

type OrgProfileResult =
  | { ok: true; organization: never; onboardingState: never; redirectTo: never }
  | { ok: false; error: 'VALIDATION_FAILED' | 'PERSISTENCE_FAILED'; message?: string };

export async function saveOrgProfile(_input: OrgProfileInput): Promise<OrgProfileResult> {
  try {
    await probeOrgContext();
  } catch {
    return { ok: false, error: 'PERSISTENCE_FAILED', message: 'Onboarding session could not be resolved.' };
  }
  return { ok: false, error: 'PERSISTENCE_FAILED', message: FAILED_MESSAGE };
}

// SET-002 createFirstWarehouse ──────────────────────────────────────────────
type WarehouseType = 'finished' | 'raw' | 'wip' | 'quarantine';

type CreateFirstWarehouseInput = {
  orgId: string;
  name: string;
  code: string;
  type: WarehouseType;
  address?: string;
};

type CreateFirstWarehouseResult =
  | { ok: true; warehouse: never; organizationModules: never; nextStep: 'first_location' }
  | { ok: false; error: 'CODE_TAKEN' | 'VALIDATION_FAILED' | 'PERSISTENCE_FAILED'; message?: string };

export async function createFirstWarehouse(
  _input: CreateFirstWarehouseInput,
): Promise<CreateFirstWarehouseResult> {
  try {
    await probeOrgContext();
  } catch {
    return { ok: false, error: 'PERSISTENCE_FAILED', message: 'Onboarding session could not be resolved.' };
  }
  return { ok: false, error: 'PERSISTENCE_FAILED', message: FAILED_MESSAGE };
}

// SET-003 createFirstLocation ───────────────────────────────────────────────
type CreateFirstLocationInput = {
  orgId: string;
  warehouseCode: string;
  path: string;
  pathSegments: [string, string, string, string];
  level: 4;
  zone: string;
  binCode: string;
};

type CreateFirstLocationResult =
  | { ok: true; locationId: string; level: 4; path: string; nextStep: 'first_product' }
  | { ok: false; error: string };

export async function createFirstLocation(
  _input: CreateFirstLocationInput,
): Promise<CreateFirstLocationResult> {
  try {
    await probeOrgContext();
  } catch {
    return { ok: false, error: 'Onboarding session could not be resolved.' };
  }
  return { ok: false, error: FAILED_MESSAGE };
}

// SET-004 / SET-005 step transitions ────────────────────────────────────────
type StepNumber = 4 | 5;

type SkipResult4 = { ok: false; error: string } | { ok: true; skippedStep: 4; nextStep: 'first_wo' };
type SkipResult5 =
  | { ok: false; error: string }
  | { ok: true; skippedStep: 5; nextStep: 'completion'; skippedSteps: number[] };
type CompleteResult4 = { ok: false; error: string } | { ok: true; completedStep: 4; nextStep: 'first_wo' };
type CompleteResult5 = { ok: false; error: string } | { ok: true; completedStep: 5; nextStep: 'completion' };

export async function skipOnboardingProductStep(_step: 4): Promise<SkipResult4> {
  try {
    await probeOrgContext();
  } catch {
    return { ok: false, error: 'Onboarding session could not be resolved.' };
  }
  return { ok: false, error: FAILED_MESSAGE };
}

export async function completeOnboardingProductStep(_step: 4): Promise<CompleteResult4> {
  try {
    await probeOrgContext();
  } catch {
    return { ok: false, error: 'Onboarding session could not be resolved.' };
  }
  return { ok: false, error: FAILED_MESSAGE };
}

export async function skipOnboardingWorkOrderStep(_step: 5): Promise<SkipResult5> {
  try {
    await probeOrgContext();
  } catch {
    return { ok: false, error: 'Onboarding session could not be resolved.' };
  }
  return { ok: false, error: FAILED_MESSAGE };
}

export async function completeOnboardingWorkOrderStep(_step: 5): Promise<CompleteResult5> {
  try {
    await probeOrgContext();
  } catch {
    return { ok: false, error: 'Onboarding session could not be resolved.' };
  }
  return { ok: false, error: FAILED_MESSAGE };
}

// SET-005 markFirstWoCreated ────────────────────────────────────────────────
type MarkFirstWoCreatedInput = { orgId: string; workOrderId: string; createdAt: string };
type MarkFirstWoCreatedResult =
  | { ok: false; error: string }
  | {
      ok: true;
      workOrderId: string;
      firstWoAt: string;
      audit: { eventType: 'settings.onboarding.first_wo_created'; timeToFirstWoMinutes: number };
      nextStep: 'completion';
    };

export async function markFirstWoCreated(
  _input: MarkFirstWoCreatedInput,
): Promise<MarkFirstWoCreatedResult> {
  try {
    await probeOrgContext();
  } catch {
    return { ok: false, error: 'Onboarding session could not be resolved.' };
  }
  return { ok: false, error: FAILED_MESSAGE };
}

// SET-006 completeOnboarding ────────────────────────────────────────────────
type CompleteOnboardingInput = { orgId: string };
type CompleteOnboardingResult = {
  ok: boolean;
  onboardingCompletedAt?: string;
  redirectTo?: string;
  error?: string;
};

export async function completeOnboarding(
  _input: CompleteOnboardingInput,
): Promise<CompleteOnboardingResult> {
  try {
    await probeOrgContext();
  } catch {
    return { ok: false, error: 'Onboarding session could not be resolved.' };
  }
  return { ok: false, error: FAILED_MESSAGE };
}

// Re-exported for the deferred OnboardingStepKey contract.
export type { StepNumber };
