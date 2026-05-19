import { existsSync } from 'node:fs';
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
const NOW = '2026-05-19T08:30:00.000Z';

type OnboardingState = {
  current_step: number;
  completed_steps: number[];
  skipped_steps: number[];
  started_at?: string;
  last_activity_at?: string;
  first_wo_at?: string | null;
};

type OnboardingResult =
  | { ok: true; data: { state: OnboardingState } }
  | { ok: false; error: string; message?: string };

type QueryCall = { sql: string; params: unknown[] };
type FakeClient = {
  state: OnboardingState;
  calls: QueryCall[];
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
    started_at: '2026-05-19T08:15:00.000Z',
    last_activity_at: '2026-05-19T08:15:00.000Z',
    first_wo_at: null,
  });
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, sessionToken: 'onboarding-session', client: currentClient }),
  );
});

describe('onboarding state machine Server Actions (TASK-000172/T-037 RED)', () => {
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

  it('allows Skip only on optional steps 4 and 5 and rejects required-step skip before any write', async () => {
    const { skipOnboarding } = await loadAction(skipPath, 'skipOnboarding');

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
  });

  it('rejects illegal Stepper jumps and first-wo callback persists first_wo_at for KPI measurement', async () => {
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

    currentClient.state = { current_step: 5, completed_steps: [1, 2, 3, 4], skipped_steps: [], first_wo_at: null };
    const firstWo = await markFirstWorkOrderCreated({ occurredAt: NOW });
    expect(firstWo).toEqual({
      ok: true,
      data: { state: expect.objectContaining({ first_wo_at: NOW }) },
    });
    expect(currentClient.state.first_wo_at).toBe(NOW);
    expect(updateCalls(), 'first WO success callback must persist organizations.onboarding_state.first_wo_at').toHaveLength(1);
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
    async query(sql: string, params: unknown[] = []) {
      client.calls.push({ sql: normalizeSql(sql), params });
      const normalized = normalizeSql(sql);

      if (normalized.includes('from public.user_roles') || normalized.includes('from public.roles')) {
        return { rows: [{ ok: true, code: 'admin', permission: 'settings.onboarding.manage' }], rowCount: 1 };
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
        } else if (normalized.includes('first_wo_at')) {
          client.state = { ...client.state, first_wo_at: extractIsoParam(params) ?? NOW, last_activity_at: NOW };
        }
        return {
          rows: [{ id: ORG_ID, onboarding_state: structuredClone(client.state), onboarding_completed_at: null }],
          rowCount: 1,
        };
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

function extractIsoParam(params: unknown[]): string | null {
  return params.find((param): param is string => typeof param === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(param)) ?? null;
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

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}
