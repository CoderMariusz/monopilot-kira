import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG_ID = '22222222-2222-4222-8222-222222222222';

type QueryCall = { sql: string; params: readonly unknown[] };
type FakeClient = {
  calls: QueryCall[];
  onboardingState: Record<string, unknown>;
  query: <T = Record<string, unknown>>(sql: string, params?: readonly unknown[]) => Promise<{ rows: T[]; rowCount: number }>;
};

const { runWithOrgContext, revalidatePathMock } = vi.hoisted(() => ({
  runWithOrgContext: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock('../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => runWithOrgContext(action)),
}));

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock('../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: revalidatePathMock,
}));

function makeClient(initialState: Record<string, unknown> = {}): FakeClient {
  const client: FakeClient = {
    calls: [],
    onboardingState: initialState,
    async query(sql, params = []) {
      client.calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (normalized.startsWith('select onboarding_state from public.organizations')) {
        return { rows: [{ onboarding_state: client.onboardingState }] as never[], rowCount: 1 };
      }

      if (normalized.startsWith('update public.organizations set onboarding_state')) {
        const rawState = params[1];
        client.onboardingState = typeof rawState === 'string' ? JSON.parse(rawState) : {};
        return { rows: [] as never[], rowCount: 1 };
      }

      throw new Error(`Unhandled SQL: ${normalized}`);
    },
  };
  return client;
}

async function withFakeOrg<T>(client: FakeClient, action: () => Promise<T>, orgId = ORG_ID): Promise<T> {
  runWithOrgContext.mockImplementation(async (callback: (ctx: unknown) => Promise<unknown>) =>
    callback({ orgId, client }),
  );
  return action();
}

describe('onboarding data/flow wiring contract', () => {
  beforeEach(() => {
    vi.resetModules();
    runWithOrgContext.mockReset();
    revalidatePathMock.mockReset();
  });

  it('returns exactly 6 real onboarding steps from organization onboarding_state', async () => {
    const client = makeClient({ completed_steps: [1], skipped_steps: [4] });
    const mod = await import('../lib/onboarding/get-onboarding-state');

    const state = await withFakeOrg(client, () => mod.getOnboardingState(ORG_ID));

    expect(state.totalSteps).toBe(6);
    expect(state.steps).toHaveLength(6);
    expect(state.steps.map((step) => step.id)).toEqual([
      'org_profile',
      'warehouse',
      'location',
      'product',
      'workorder',
      'completion',
    ]);
    expect(state.steps.map((step) => step.status)).toEqual([
      'completed',
      'current',
      'not_started',
      'skipped',
      'not_started',
      'not_started',
    ]);
    expect(state.currentStepId).toBe('warehouse');
    expect(state.completedCount).toBe(1);
    expect(state.allComplete).toBe(false);
    expect(client.calls[0]?.sql).toContain('public.organizations');
    expect(client.calls[0]?.params).toEqual([ORG_ID]);

    const crossOrg = await withFakeOrg(client, () => mod.getOnboardingState(OTHER_ORG_ID));
    expect(crossOrg.completedCount).toBe(0);
  });

  it('persists completed/skipped steps and advances current step from real storage', async () => {
    const client = makeClient({});
    const actions = await import('../lib/onboarding/actions');
    const loader = await import('../lib/onboarding/get-onboarding-state');

    const completed = await withFakeOrg(client, () => actions.markStepComplete(ORG_ID, 'org_profile'));
    const skipped = await withFakeOrg(client, () => actions.markStepSkipped(ORG_ID, 'product'));
    const current = await withFakeOrg(client, () => actions.getCurrentStep(ORG_ID));
    const state = await withFakeOrg(client, () => loader.getOnboardingState(ORG_ID));

    expect(completed).toEqual({ success: true });
    expect(skipped).toEqual({ success: true });
    expect(current).toBe('warehouse');
    expect(state.completedCount).toBe(1);
    expect(state.steps.find((step) => step.id === 'org_profile')).toMatchObject({ status: 'completed' });
    expect(state.steps.find((step) => step.id === 'product')).toMatchObject({ status: 'skipped' });
    expect(client.onboardingState).toMatchObject({
      current_step: 2,
      completed_steps: [1],
      skipped_steps: [4],
    });

    const sql = client.calls.map((call) => call.sql.replace(/\s+/g, ' ').trim()).join('\n');
    expect(sql).toContain('select onboarding_state from public.organizations');
    expect(sql).toContain('update public.organizations set onboarding_state');
    expect(client.calls.every((call) => call.params.includes(ORG_ID))).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith('/settings/onboarding');
  });

  it('reports allComplete true when all 6 steps are completed', async () => {
    const client = makeClient({});
    const actions = await import('../lib/onboarding/actions');
    const loader = await import('../lib/onboarding/get-onboarding-state');

    for (const stepId of ['org_profile', 'warehouse', 'location', 'product', 'workorder', 'completion'] as const) {
      const result = await withFakeOrg(client, () => actions.markStepComplete(ORG_ID, stepId));
      expect(result).toEqual({ success: true });
    }

    const state = await withFakeOrg(client, () => loader.getOnboardingState(ORG_ID));
    const current = await withFakeOrg(client, () => actions.getCurrentStep(ORG_ID));

    expect(state.completedCount).toBe(6);
    expect(state.allComplete).toBe(true);
    expect(state.currentStepId).toBeNull();
    expect(current).toBeNull();
    expect(state.steps.every((step) => step.status === 'completed')).toBe(true);
  });
});
