import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  hasPermission: vi.fn(),
}));

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: (action: (ctx: unknown) => Promise<unknown>) =>
    action({
      userId: '11111111-1111-4111-8111-111111111111',
      client: { query: mocks.query },
    }),
}));
vi.mock('../../../../../../../lib/auth/has-permission', () => ({
  hasPermission: (...args: unknown[]) => mocks.hasPermission(...args),
}));

const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const VERSION_ID = '33333333-3333-4333-8333-333333333333';
const FORMULATION_ID = '44444444-4444-4444-8444-444444444444';

const scenario = {
  missingCostCount: 0,
};

function draft() {
  return {
    formulation_id: FORMULATION_ID,
    version_id: VERSION_ID,
    state: 'draft',
    product_code: null,
    actual_total_pct: '100.00',
    missing_cost_count: scenario.missingCostCount,
    missing_nutrition_target_count: 0,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  scenario.missingCostCount = 0;
  mocks.hasPermission.mockResolvedValue(true);
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes('from public.formulations f')) return { rows: [draft()], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });
});

describe('Phase 2 NPD formulation contracts', () => {
  it('NSA-029 rejects lock without npd.formulation.lock and allows it with the permission', async () => {
    const { lockVersion } = await import('../lock-version');

    mocks.hasPermission.mockResolvedValueOnce(false);
    await expect(lockVersion({ projectId: PROJECT_ID, versionId: VERSION_ID })).resolves.toEqual({
      ok: false,
      error: 'forbidden',
    });
    expect(mocks.query).not.toHaveBeenCalled();

    mocks.hasPermission.mockResolvedValue(true);
    await expect(lockVersion({ projectId: PROJECT_ID, versionId: VERSION_ID })).resolves.toMatchObject({
      ok: true,
      data: { formulationId: FORMULATION_ID, versionId: VERSION_ID },
    });
  });

  it('NSA-033 rejects a missing ingredient cost and locks when every cost exists', async () => {
    const { lockVersion } = await import('../lock-version');

    scenario.missingCostCount = 1;
    await expect(lockVersion({ projectId: PROJECT_ID, versionId: VERSION_ID })).resolves.toEqual({
      ok: false,
      error: 'MISSING_COST',
    });
    expect(mocks.query).toHaveBeenCalledTimes(1);

    mocks.query.mockClear();
    scenario.missingCostCount = 0;
    await expect(lockVersion({ projectId: PROJECT_ID, versionId: VERSION_ID })).resolves.toMatchObject({
      ok: true,
      data: { formulationId: FORMULATION_ID, versionId: VERSION_ID },
    });
  });
});
