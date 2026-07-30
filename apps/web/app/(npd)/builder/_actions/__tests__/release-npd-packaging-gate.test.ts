/**
 * L5 — releaseNpdProjectToFactory packaging gate (mocked org context).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireReleasePermission = vi.fn();
const materializeNpdBom = vi.fn();
const runReleasePreflight = vi.fn();
const insertReleasedToFactoryEvent = vi.fn();
const transitionFactorySpecToReleased = vi.fn();
const upsertFactoryReleaseStatus = vi.fn();

vi.mock('../../_lib/release-preflight', () => ({
  ReleasePreflightError: class ReleasePreflightError extends Error {
    constructor(
      public blockers: Array<{ code: string; message: string }> = [],
      public status = 409,
    ) {
      super('PRECONDITION_BLOCKERS');
    }
  },
  requireReleasePermission,
  runReleasePreflight,
}));
vi.mock('../../../../../lib/i18n/revalidate-localized', () => ({ revalidateLocalized: vi.fn() }));
vi.mock('../../../pipeline/_actions/_lib/materialize-npd-bom', () => ({ materializeNpdBom }));
vi.mock('../../../../../lib/technical/factory-release-persistence', () => ({
  RELEASED_TO_FACTORY_EVENT: 'fg.released_to_factory',
  insertReleasedToFactoryEvent,
  transitionFactorySpecToReleased,
  upsertFactoryReleaseStatus,
}));

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
      factorySpecApprovedAt: '2026-07-30T08:00:00.000Z',
    });
    insertReleasedToFactoryEvent.mockResolvedValue(1);
    transitionFactorySpecToReleased.mockResolvedValue(undefined);
    upsertFactoryReleaseStatus.mockResolvedValue({
      release_status: 'released_to_factory',
      factory_available_at: '2026-07-30T08:00:00.000Z',
      release_event_id: 1,
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

  it('runs preflight before materialization so missing release evidence cannot auto-heal', async () => {
    const { ReleasePreflightError } = await import('../../_lib/release-preflight');
    const blocker = new ReleasePreflightError([
      { code: 'ACTIVE_SHARED_BOM_REQUIRED', message: 'Factory release requires an active shared BOM.' },
      { code: 'FACTORY_SPEC_REQUIRED', message: 'Factory release requires Technical factory_spec evidence.' },
    ]);
    runReleasePreflight.mockRejectedValue(blocker);

    const client = mockClient([]);
    const { releaseNpdProjectToFactory } = await import('../release-npd-project-to-factory');
    const result = await releaseNpdProjectToFactory(
      { projectId: PROJECT_ID },
      { userId: 'user-1', orgId: 'org-1', client },
    );

    expect(result).toMatchObject({
      ok: false,
      error: 'PRECONDITION_BLOCKERS',
      status: 409,
      blockers: [
        { code: 'ACTIVE_SHARED_BOM_REQUIRED' },
        { code: 'FACTORY_SPEC_REQUIRED' },
      ],
    });
    expect(materializeNpdBom).not.toHaveBeenCalled();
  });

  it('still materializes and releases when preflight finds valid BOM and spec evidence', async () => {
    runReleasePreflight
      .mockResolvedValueOnce({
        projectId: PROJECT_ID,
        projectCode: 'NPD-1',
        productCode: 'FG-001',
        activeBomHeaderId: 'bom-1',
        activeFactorySpecId: 'spec-1',
        factorySpecApprovedAt: '2026-07-30T08:00:00.000Z',
      })
      .mockResolvedValueOnce({
        projectId: PROJECT_ID,
        projectCode: 'NPD-1',
        productCode: 'FG-001',
        activeBomHeaderId: 'bom-2',
        activeFactorySpecId: 'spec-2',
        factorySpecApprovedAt: '2026-07-30T08:01:00.000Z',
      });
    materializeNpdBom.mockResolvedValue({
      bomHeaderId: 'bom-2',
      productionCode: 'FG-001',
      yieldPromptRequired: false,
    });

    const client = mockClient([]);
    const { releaseNpdProjectToFactory } = await import('../release-npd-project-to-factory');
    const result = await releaseNpdProjectToFactory(
      { projectId: PROJECT_ID },
      { userId: 'user-1', orgId: 'org-1', client },
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        projectId: PROJECT_ID,
        activeBomHeaderId: 'bom-2',
        activeFactorySpecId: 'spec-2',
      },
    });
    expect(runReleasePreflight.mock.invocationCallOrder[0]).toBeLessThan(
      materializeNpdBom.mock.invocationCallOrder[0],
    );
    expect(materializeNpdBom.mock.invocationCallOrder[0]).toBeLessThan(
      runReleasePreflight.mock.invocationCallOrder[1],
    );
  });
});
