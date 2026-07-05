/**
 * L5 — releaseNpdProjectToFactory packaging gate (mocked org context).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireReleasePermission = vi.fn();
const materializeNpdBom = vi.fn();
const runReleasePreflight = vi.fn();

vi.mock('../../_lib/release-preflight', () => ({
  ReleasePreflightError: class ReleasePreflightError extends Error {
    status = 409;
    blockers = [];
  },
  requireReleasePermission,
  runReleasePreflight,
}));
vi.mock('../../../../../../lib/i18n/revalidate-localized', () => ({ revalidateLocalized: vi.fn() }));
vi.mock('../../../../pipeline/_actions/_lib/materialize-npd-bom', () => ({ materializeNpdBom }));

const PROJECT_ID = '22222222-2222-4222-8222-222222222222';

function mockClient(rowsBySql: Array<{ match: RegExp; rows: unknown[] }>) {
  return {
    query: vi.fn(async (sql: string) => {
      for (const entry of rowsBySql) {
        if (entry.match.test(sql)) return { rows: entry.rows };
      }
      return { rows: [] };
    }),
  };
}

describe('releaseNpdProjectToFactory — L5 packaging gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireReleasePermission.mockResolvedValue(undefined);
    materializeNpdBom.mockResolvedValue({ bomHeaderId: 'bom-1', yieldPromptRequired: false });
    runReleasePreflight.mockResolvedValue({
      projectId: PROJECT_ID,
      projectCode: 'NPD-1',
      productCode: 'FG-001',
      activeBomHeaderId: 'bom-1',
      activeFactorySpecId: 'spec-1',
    });
  });

  it('returns PACKAGING_UNLINKED before materialize', async () => {
    const client = mockClient([
      { match: /packaging_components/i, rows: [{ component_name: 'box 1' }] },
    ]);

    const { releaseNpdProjectToFactory } = await import('../release-npd-project-to-factory');
    const result = await releaseNpdProjectToFactory(
      { projectId: PROJECT_ID },
      { userId: 'user-1', orgId: 'org-1', client },
    );

    expect(result).toMatchObject({
      ok: false,
      error: 'PACKAGING_UNLINKED',
      status: 409,
      unlinkedComponents: ['box 1'],
      message: 'packaging components not linked to items: box 1',
    });
    expect(materializeNpdBom).not.toHaveBeenCalled();
  });
});
