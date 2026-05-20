import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { _withOrgContextRunner, _revalidatePath } = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
  _revalidatePath: vi.fn(),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) =>
    _withOrgContextRunner(action),
  ),
}));

vi.mock('next/cache', () => ({
  revalidatePath: _revalidatePath,
}));

const repoRoot = resolve(__dirname, '../../../..');
const advancePath = resolve(repoRoot, 'apps/web/actions/onboarding/advance.ts');
const backPath = resolve(repoRoot, 'apps/web/actions/onboarding/back.ts');
const skipPath = resolve(repoRoot, 'apps/web/actions/onboarding/skip.ts');
const jumpPath = resolve(repoRoot, 'apps/web/actions/onboarding/jump.ts');
const restartPath = resolve(repoRoot, 'apps/web/actions/onboarding/restart.ts');
const firstWoPath = resolve(repoRoot, 'apps/web/actions/onboarding/first-wo.ts');

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const STARTED_AT = '2026-05-19T08:15:00.000Z';
const FIRST_WO_AT = '2026-05-19T08:30:00.000Z';

type OnboardingState = {
  current_step: number;
  completed_steps: number[];
  skipped_steps: number[];
  started_at?: string;
  last_activity_at?: string;
  first_wo_at?: string | null;
  time_to_first_wo_ms?: number | null;
};

type OnboardingResult =
  | { ok: true; data: { state: OnboardingState } }
  | { ok: false; error: string; message?: string };

type QueryCall = { sql: string; params: unknown[] };
type FakeClient = {
  state: OnboardingState;
  calls: QueryCall[];
  auditLog: QueryCall[];
  outboxEvents: QueryCall[];
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

type ActionModule<Name extends string> = Record<Name, (input?: Record<string, unknown>) => Promise<OnboardingResult>>;

let currentClient: FakeClient;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  currentClient = makeClient({
    current_step: 1,
    completed_steps: [],
    skipped_steps: [],
    started_at: STARTED_AT,
    last_activity_at: STARTED_AT,
    first_wo_at: null,
  });
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, sessionToken: 'onboarding-session', client: currentClient }),
  );
});

describe('onboarding state machine Server Actions (T-037 PRD §14.3 / S-U4)', () => {
  it('advances, backs up, and restarts by persisting the canonical onboarding_state shape through withOrgContext', async () => {
    const { advanceOnboarding } = await loadAction(advancePath, 'advanceOnboarding');
    const { backOnboarding } = await loadAction(backPath, 'backOnboarding');
    const { restartOnboarding } = await loadAction(restartPath, 'restartOnboarding');

    const advanced = await advanceOnboarding({ step: 1 });
    expect(advanced).toEqual({
      ok: true,
      data: { state: expect.objectContaining({ current_step: 2, completed_steps: [1], skipped_steps: [] }) },
    });
    expect(currentClient.state).toEqual(
      expect.objectContaining({ current_step: 2, completed_steps: [1], skipped_steps: [] }),
    );

    const backedUp = await backOnboarding({ step: 2 });
    expect(backedUp).toEqual({
      ok: true,
      data: { state: expect.objectContaining({ current_step: 1, completed_steps: [1], skipped_steps: [] }) },
    });

    const restarted = await restartOnboarding();
    expect(restarted).toEqual({
      ok: true,
      data: { state: expect.objectContaining({ current_step: 1, completed_steps: [], skipped_steps: [] }) },
    });
    expect(_withOrgContextRunner).toHaveBeenCalledTimes(3);
    expect(updateCalls(), 'advance/back/restart must update organizations.onboarding_state').toHaveLength(3);
  });

  it('Skip on an optional future step from a different current_step (AC1: current=3, skip(4) → current=5, skipped=[4], completed unchanged) and rejects required-step skip', async () => {
    const { skipOnboarding } = await loadAction(skipPath, 'skipOnboarding');

    // AC1 verbatim: current_step=3 and skipOnboardingStep(4) — completed unchanged, skipped=[4], current advances to 5.
    currentClient.state = { current_step: 3, completed_steps: [1, 2], skipped_steps: [], first_wo_at: null };
    const skippedFromBefore = await skipOnboarding({ step: 4 });
    expect(skippedFromBefore).toEqual({
      ok: true,
      data: { state: expect.objectContaining({ current_step: 5, completed_steps: [1, 2], skipped_steps: [4] }) },
    });

    currentClient.calls = [];
    currentClient.state = { current_step: 4, completed_steps: [1, 2, 3], skipped_steps: [], first_wo_at: null };
    const skippedOptional = await skipOnboarding({ step: 4 });
    expect(skippedOptional).toEqual({
      ok: true,
      data: { state: expect.objectContaining({ current_step: 5, completed_steps: [1, 2, 3], skipped_steps: [4] }) },
    });

    currentClient.calls = [];
    currentClient.state = { current_step: 3, completed_steps: [1, 2], skipped_steps: [], first_wo_at: null };
    const skippedRequired = await skipOnboarding({ step: 3 });
    expect(skippedRequired).toEqual({ ok: false, error: 'required_step' });
    expect(updateCalls(), 'required steps 1, 2, 3, and 6 must never be skipped or persisted').toHaveLength(0);

    currentClient.calls = [];
    currentClient.state = { current_step: 5, completed_steps: [1, 2, 3, 4], skipped_steps: [], first_wo_at: null };
    const skippedPast = await skipOnboarding({ step: 4 });
    expect(skippedPast).toEqual({ ok: false, error: 'stale_step' });
    expect(updateCalls(), 'skip cannot target an already-passed step').toHaveLength(0);
  });

  it('rejects illegal Stepper jumps and persists first_wo_at + time_to_first_wo KPI snapshot', async () => {
    const { jumpOnboarding } = await loadAction(jumpPath, 'jumpOnboarding');
    const { markFirstWorkOrderCreated } = await loadAction(firstWoPath, 'markFirstWorkOrderCreated');

    currentClient.state = { current_step: 4, completed_steps: [1, 2, 3], skipped_steps: [], first_wo_at: null };
    const legalJump = await jumpOnboarding({ step: 2 });
    expect(legalJump).toEqual({
      ok: true,
      data: { state: expect.objectContaining({ current_step: 2, completed_steps: [1, 2, 3], skipped_steps: [] }) },
    });

    currentClient.calls = [];
    currentClient.state = { current_step: 4, completed_steps: [1, 2, 3], skipped_steps: [], first_wo_at: null };
    const illegalJump = await jumpOnboarding({ step: 6 });
    expect(illegalJump).toEqual({ ok: false, error: 'illegal_jump' });
    expect(updateCalls(), 'jump may target only the current or already-completed steps').toHaveLength(0);

    currentClient.calls = [];
    currentClient.state = {
      current_step: 5,
      completed_steps: [1, 2, 3, 4],
      skipped_steps: [],
      started_at: STARTED_AT,
      first_wo_at: null,
    };
    const firstWo = await markFirstWorkOrderCreated({ occurredAt: FIRST_WO_AT });
    expect(firstWo.ok).toBe(true);
    if (firstWo.ok) {
      // first_wo_at persisted and KPI snapshot (time_to_first_wo_ms = first_wo_at - started_at) is computed and stored.
      expect(firstWo.data.state.first_wo_at).toBe(FIRST_WO_AT);
      const expectedMs = new Date(FIRST_WO_AT).getTime() - new Date(STARTED_AT).getTime();
      expect(firstWo.data.state.time_to_first_wo_ms).toBe(expectedMs);
    }
    expect(currentClient.state.first_wo_at).toBe(FIRST_WO_AT);
    expect(currentClient.state.time_to_first_wo_ms).toBe(
      new Date(FIRST_WO_AT).getTime() - new Date(STARTED_AT).getTime(),
    );
    expect(updateCalls(), 'first WO success callback must persist organizations.onboarding_state').toHaveLength(1);
  });

  it('every onboarding state mutation emits audit_log + outbox events within the same withOrgContext transaction', async () => {
    const { advanceOnboarding } = await loadAction(advancePath, 'advanceOnboarding');
    const { markFirstWorkOrderCreated } = await loadAction(firstWoPath, 'markFirstWorkOrderCreated');

    currentClient.state = {
      current_step: 1,
      completed_steps: [],
      skipped_steps: [],
      started_at: STARTED_AT,
      first_wo_at: null,
    };
    const advanced = await advanceOnboarding({ step: 1 });
    expect(advanced.ok).toBe(true);
    expect(currentClient.auditLog.length, 'advance must write to audit_log').toBeGreaterThanOrEqual(1);
    expect(currentClient.outboxEvents.length, 'advance must emit an outbox event').toBeGreaterThanOrEqual(1);

    currentClient.calls = [];
    currentClient.auditLog = [];
    currentClient.outboxEvents = [];
    currentClient.state = {
      current_step: 5,
      completed_steps: [1, 2, 3, 4],
      skipped_steps: [],
      started_at: STARTED_AT,
      first_wo_at: null,
    };
    const firstWo = await markFirstWorkOrderCreated({ occurredAt: FIRST_WO_AT });
    expect(firstWo.ok).toBe(true);
    expect(currentClient.auditLog.length, 'first_wo callback must write to audit_log').toBeGreaterThanOrEqual(1);
    expect(currentClient.outboxEvents.length, 'first_wo callback must emit an outbox event').toBeGreaterThanOrEqual(1);

    const outboxEventTypes = currentClient.outboxEvents.map((call) => callBlob(call));
    expect(outboxEventTypes.some((blob) => blob.includes('onboarding'))).toBe(true);
  });

  it('production sources are free of test-coupling hacks (no fixture mutation helpers, no test-only branches in production)', () => {
    const sources = [
      readFileSync(advancePath, 'utf8'),
      readFileSync(backPath, 'utf8'),
      readFileSync(skipPath, 'utf8'),
      readFileSync(jumpPath, 'utf8'),
      readFileSync(restartPath, 'utf8'),
      readFileSync(firstWoPath, 'utf8'),
    ];
    for (const src of sources) {
      expect(src).not.toMatch(/UnitTest|UnitTestFake|FakeClient|FakeMigration|fixture\b/i);
      expect(src).not.toMatch(/compatibility token|V-SET-\d+ tests?|TASK-\d+/i);
    }
  });
});

async function loadAction<Name extends string>(path: string, exportName: Name): Promise<ActionModule<Name>> {
  expect(existsSync(path), `${path.replace(`${repoRoot}/`, '')} must exist and export ${exportName}(input)`).toBe(true);
  const mod = (await import(path)) as Partial<ActionModule<Name>>;
  if (typeof mod[exportName] !== 'function') {
    expect.fail(`${path.replace(`${repoRoot}/`, '')} must export ${exportName}(input)`);
  }
  return mod as ActionModule<Name>;
}

function makeClient(initialState: OnboardingState): FakeClient {
  const client: FakeClient = {
    state: structuredClone(initialState),
    calls: [],
    auditLog: [],
    outboxEvents: [],
    async query(sql: string, params: unknown[] = []) {
      client.calls.push({ sql: normalizeSql(sql), params });
      const normalized = normalizeSql(sql);

      if (normalized.includes('from public.user_roles') || normalized.includes('from public.roles')) {
        return { rows: [{ ok: true, code: 'admin', permission: 'settings.onboarding.complete' }], rowCount: 1 };
      }

      if (normalized.includes('from public.organizations')) {
        return {
          rows: [{ id: ORG_ID, onboarding_state: structuredClone(client.state), onboarding_completed_at: null }],
          rowCount: 1,
        };
      }

      if (normalized.includes('update public.organizations')) {
        const stateParam = extractStateParam(params);
        if (stateParam) {
          client.state = { ...stateParam };
        }
        return {
          rows: [{ id: ORG_ID, onboarding_state: structuredClone(client.state), onboarding_completed_at: null }],
          rowCount: 1,
        };
      }

      if (normalized.includes('insert into public.audit_log')) {
        client.auditLog.push({ sql: normalized, params });
        return { rows: [], rowCount: 1 };
      }

      if (normalized.includes('insert into public.outbox_events')) {
        client.outboxEvents.push({ sql: normalized, params });
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}

function extractStateParam(params: unknown[]): OnboardingState | null {
  for (const param of params) {
    if (isOnboardingState(param)) return structuredClone(param);
    if (typeof param === 'string') {
      try {
        const parsed = JSON.parse(param) as unknown;
        if (isOnboardingState(parsed)) return structuredClone(parsed);
      } catch {
        // not JSON state
      }
    }
  }
  return null;
}

function isOnboardingState(value: unknown): value is OnboardingState {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as OnboardingState).current_step === 'number' &&
    Array.isArray((value as OnboardingState).completed_steps) &&
    Array.isArray((value as OnboardingState).skipped_steps)
  );
}

function updateCalls(): QueryCall[] {
  return currentClient.calls.filter((call) => call.sql.includes('update public.organizations'));
}

function callBlob(call: QueryCall): string {
  return `${call.sql} ${JSON.stringify(call.params)}`;
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}
