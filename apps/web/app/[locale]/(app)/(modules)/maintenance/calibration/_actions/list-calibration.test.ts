import { describe, expect, it, vi } from 'vitest';

import { listCalibration } from './list-calibration';

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (
      action: (ctx: {
        client: {
          query: () => Promise<{ rows: [] }>;
        };
      }) => Promise<unknown>,
    ) =>
      action({
        client: {
          query: async () => ({ rows: [] }),
        },
      }),
  ),
}));

describe('listCalibration', () => {
  it('returns an array', async () => {
    await expect(listCalibration()).resolves.toEqual([]);
  });
});
