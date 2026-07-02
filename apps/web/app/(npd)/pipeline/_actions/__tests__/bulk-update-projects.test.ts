import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/i18n/revalidate-localized', () => ({ revalidatePath: vi.fn() }));

const { advanceProjectGateMock } = vi.hoisted(() => ({
  advanceProjectGateMock: vi.fn(),
}));

vi.mock('../advance-project-gate', () => ({
  advanceProjectGate: advanceProjectGateMock,
}));

vi.mock('../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({
      userId: '00000000-0000-4000-8000-0000000000aa',
      orgId: '00000000-0000-4000-8000-00000000000a',
      client: {
        query: async () => ({ rows: [], rowCount: 1 }),
      },
    }),
  ),
}));

import { bulkMoveGate } from '../bulk-update-projects';

const PROJECT_A = '00000000-0000-4000-8000-0000000000a1';
const PROJECT_B = '00000000-0000-4000-8000-0000000000b1';

describe('bulkMoveGate', () => {
  beforeEach(() => {
    advanceProjectGateMock.mockReset();
  });

  it('returns ok:false when a bulk move partially fails', async () => {
    advanceProjectGateMock
      .mockResolvedValueOnce({
        ok: true,
        data: { previousGate: 'G2', currentGate: 'G3' },
      })
      .mockResolvedValueOnce({
        ok: false,
        error: 'ADJACENCY_VIOLATION',
        status: 422,
      });

    const result = await bulkMoveGate({
      projectIds: [PROJECT_A, PROJECT_B],
      targetStage: 'packaging',
    });

    expect(result).toEqual({
      ok: false,
      error: 'PERSISTENCE_FAILED',
      status: 500,
      failed: [{ projectId: PROJECT_B, error: 'ADJACENCY_VIOLATION', status: 422 }],
    });
    expect(advanceProjectGateMock).toHaveBeenCalledTimes(2);
  });
});
