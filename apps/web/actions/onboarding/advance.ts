import { withOrgContext } from '../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../lib/i18n/revalidate-localized';

const TOTAL_STEPS = 6;
const REQUIRED_STEPS = new Set([1, 2, 3, 6]);
const OPTIONAL_STEPS = new Set([4, 5]);
const ONBOARDING_PERMISSION = 'settings.onboarding.complete';
const ONBOARDING_PATH = '/settings/onboarding';

export type OnboardingState = {
  current_step: number;
  completed_steps: number[];
  skipped_steps: number[];
  started_at?: string;
  last_activity_at?: string;
  first_wo_at?: string | null;
  time_to_first_wo_ms?: number | null;
};

export type OnboardingResult =
  | { ok: true; data: { state: OnboardingState } }
  | {
      ok: false;
      error:
        | 'invalid_input'
        | 'forbidden'
        | 'not_found'
        | 'invalid_step'
        | 'stale_step'
        | 'required_step'
        | 'illegal_jump'
        | 'persistence_failed';
      message?: string;
    };

type Transition = 'advance' | 'back' | 'skip' | 'jump' | 'restart' | 'first_wo';
type TransitionResult = { ok: true; state: OnboardingState } | Extract<OnboardingResult, { ok: false }>;

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
  onboarding_state: unknown;
};

const DEFAULT_STATE: OnboardingState = {
  current_step: 1,
  completed_steps: [],
  skipped_steps: [],
  first_wo_at: null,
};

export async function advanceOnboarding(rawInput: unknown = {}): Promise<OnboardingResult> {
  'use server';

  return mutateOnboarding('advance', rawInput);
}

export async function mutateOnboarding(transition: Transition, rawInput: unknown = {}): Promise<OnboardingResult> {
  try {
    return await withOrgContext<OnboardingResult>(async (ctx): Promise<OnboardingResult> => {
      const context = ctx as OrgContextLike;
      const authorized = await hasOnboardingPermission(context);
      if (!authorized) {
        return { ok: false, error: 'forbidden' };
      }

      const currentState = await readCurrentState(context.client);
      if (!currentState) {
        return { ok: false, error: 'not_found' };
      }

      const next = buildNextState(transition, currentState, rawInput);
      if (next.ok === false) return next;

      if (statesEqual(currentState, next.state)) {
        return { ok: true, data: { state: currentState } };
      }

      const persisted = await persistState(context.client, next.state);
      if (!persisted) {
        // 0 rows updated: the organization row vanished between readCurrentState
        // and the UPDATE. The write never landed — don't fabricate success from
        // the input state and don't emit audit/outbox for a transition that
        // didn't persist.
        return { ok: false, error: 'persistence_failed' };
      }
      await writeAuditLog(context, transition, currentState, persisted);
      await writeOutbox(context, transition, persisted);
      revalidateLocalized(ONBOARDING_PATH);
      return { ok: true, data: { state: persisted } };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

async function hasOnboardingPermission({ client, userId, orgId }: OrgContextLike): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or r.permissions ? $3
        )
      limit 1`,
    [userId, orgId, ONBOARDING_PERMISSION],
  );

  return rows.length > 0;
}

async function readCurrentState(client: QueryClient): Promise<OnboardingState | null> {
  const { rows } = await client.query<OrganizationRow>(
    `select onboarding_state
       from public.organizations
      where id = app.current_org_id()
      limit 1`,
  );
  const row = rows[0];
  if (!row) return null;
  return normalizeState(row.onboarding_state);
}

function buildNextState(
  transition: Transition,
  currentState: OnboardingState,
  rawInput: unknown,
): TransitionResult {
  const now = new Date().toISOString();

  if (transition === 'restart') {
    return {
      ok: true,
      state: {
        current_step: 1,
        completed_steps: [],
        skipped_steps: [],
        last_activity_at: now,
      },
    };
  }

  if (transition === 'first_wo') {
    const occurredAt = parseOccurredAt(rawInput) ?? now;
    if (currentState.first_wo_at) return { ok: true, state: currentState };
    const startedAt = currentState.started_at;
    const elapsedMs = startedAt ? Date.parse(occurredAt) - Date.parse(startedAt) : null;
    return {
      ok: true,
      state: {
        ...currentState,
        first_wo_at: occurredAt,
        last_activity_at: now,
        time_to_first_wo_ms:
          elapsedMs !== null && Number.isFinite(elapsedMs) && elapsedMs >= 0 ? elapsedMs : null,
      },
    };
  }

  const step = parseStep(rawInput);
  if (step === null || step < 1 || step > TOTAL_STEPS) {
    return { ok: false, error: 'invalid_step' };
  }

  if (transition === 'jump') {
    if (step !== currentState.current_step && !currentState.completed_steps.includes(step)) {
      return { ok: false, error: 'illegal_jump' };
    }
    return {
      ok: true,
      state: { ...currentState, current_step: step, last_activity_at: now },
    };
  }

  if (transition === 'skip') {
    if (REQUIRED_STEPS.has(step) || !OPTIONAL_STEPS.has(step)) {
      return { ok: false, error: 'required_step' };
    }
    if (step < currentState.current_step) {
      return { ok: false, error: 'stale_step' };
    }
    return {
      ok: true,
      state: {
        ...currentState,
        current_step: Math.max(currentState.current_step, step + 1),
        skipped_steps: addStep(currentState.skipped_steps, step),
        completed_steps: removeStep(currentState.completed_steps, step),
        last_activity_at: now,
      },
    };
  }

  if (step !== currentState.current_step) {
    return { ok: false, error: 'stale_step' };
  }

  if (transition === 'advance') {
    if (step >= TOTAL_STEPS) {
      return { ok: false, error: 'invalid_step' };
    }
    return {
      ok: true,
      state: {
        ...currentState,
        current_step: step + 1,
        completed_steps: addStep(currentState.completed_steps, step),
        skipped_steps: removeStep(currentState.skipped_steps, step),
        last_activity_at: now,
      },
    };
  }

  if (transition === 'back') {
    if (step <= 1) {
      return { ok: false, error: 'invalid_step' };
    }
    return {
      ok: true,
      state: {
        ...currentState,
        current_step: step - 1,
        last_activity_at: now,
      },
    };
  }

  return { ok: false, error: 'invalid_step' };
}

async function persistState(client: QueryClient, state: OnboardingState): Promise<OnboardingState | null> {
  const { rows } = await client.query<OrganizationRow>(
    `update public.organizations
        set onboarding_state = $1::jsonb,
            updated_at = now()
      where id = app.current_org_id()
      returning onboarding_state`,
    [JSON.stringify(state)],
  );

  const row = rows[0];
  // No row updated → the org was deleted mid-request. Signal a lost write so
  // the caller returns persistence_failed instead of echoing the input state.
  if (!row) return null;
  return normalizeState(row.onboarding_state ?? state);
}

async function writeAuditLog(
  { client, orgId, userId }: OrgContextLike,
  transition: Transition,
  beforeState: OnboardingState,
  afterState: OnboardingState,
): Promise<void> {
  await client.query(
    `insert into public.audit_log
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
     values ($1::uuid, $2::uuid, 'user', $3, 'onboarding_state', $1::uuid, $4::jsonb, $5::jsonb, 'standard')`,
    [
      orgId,
      userId,
      `onboarding.${transition}`,
      JSON.stringify(beforeState),
      JSON.stringify(afterState),
    ],
  );
}

async function writeOutbox(
  { client, orgId, userId }: OrgContextLike,
  transition: Transition,
  afterState: OnboardingState,
): Promise<void> {
  await client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values ($1::uuid, $2, 'organization', $1::uuid, $3::jsonb, 'settings-onboarding-v1')`,
    [
      orgId,
      transition === 'first_wo' ? 'onboarding.first_wo_recorded' : `onboarding.step.${transition}`,
      JSON.stringify({
        org_id: orgId,
        actor_user_id: userId,
        transition,
        state: afterState,
      }),
    ],
  );
}

function normalizeState(raw: unknown): OnboardingState {
  if (!isRecord(raw)) return { ...DEFAULT_STATE };
  return {
    current_step: clampStep(raw.current_step),
    completed_steps: normalizeStepArray(raw.completed_steps),
    skipped_steps: normalizeStepArray(raw.skipped_steps),
    started_at: typeof raw.started_at === 'string' ? raw.started_at : undefined,
    last_activity_at: typeof raw.last_activity_at === 'string' ? raw.last_activity_at : undefined,
    first_wo_at: typeof raw.first_wo_at === 'string' ? raw.first_wo_at : raw.first_wo_at === null ? null : undefined,
    time_to_first_wo_ms:
      typeof raw.time_to_first_wo_ms === 'number' && Number.isFinite(raw.time_to_first_wo_ms)
        ? raw.time_to_first_wo_ms
        : raw.time_to_first_wo_ms === null
        ? null
        : undefined,
  };
}

function parseStep(rawInput: unknown): number | null {
  if (!isRecord(rawInput)) return null;
  const step = rawInput.step;
  return typeof step === 'number' && Number.isInteger(step) ? step : null;
}

function parseOccurredAt(rawInput: unknown): string | null {
  if (!isRecord(rawInput)) return null;
  return typeof rawInput.occurredAt === 'string' && rawInput.occurredAt.length > 0 ? rawInput.occurredAt : null;
}

function clampStep(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return DEFAULT_STATE.current_step;
  return Math.min(TOTAL_STEPS, Math.max(1, value));
}

function normalizeStepArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter((step): step is number => typeof step === 'number' && Number.isInteger(step) && step >= 1 && step <= TOTAL_STEPS),
    ),
  ).sort((a, b) => a - b);
}

function addStep(steps: number[], step: number): number[] {
  return normalizeStepArray([...steps, step]);
}

function removeStep(steps: number[], step: number): number[] {
  return steps.filter((candidate) => candidate !== step);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function statesEqual(left: OnboardingState, right: OnboardingState): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
