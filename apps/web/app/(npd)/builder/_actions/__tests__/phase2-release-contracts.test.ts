import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  materializeNpdBom: vi.fn(),
  insertReleasedToFactoryEvent: vi.fn(),
  transitionFactorySpecToReleased: vi.fn(),
  upsertFactoryReleaseStatus: vi.fn(),
}));

vi.mock('../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));
vi.mock('../../../pipeline/_actions/_lib/materialize-npd-bom', () => ({
  materializeNpdBom: (...args: unknown[]) => mocks.materializeNpdBom(...args),
}));
vi.mock('../../../../../lib/technical/factory-release-persistence', () => ({
  RELEASED_TO_FACTORY_EVENT: 'fg.released_to_factory',
  insertReleasedToFactoryEvent: (...args: unknown[]) =>
    mocks.insertReleasedToFactoryEvent(...args),
  transitionFactorySpecToReleased: (...args: unknown[]) =>
    mocks.transitionFactorySpecToReleased(...args),
  upsertFactoryReleaseStatus: (...args: unknown[]) =>
    mocks.upsertFactoryReleaseStatus(...args),
}));

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ORG_ID = '33333333-3333-4333-8333-333333333333';
const BOM_ID = '44444444-4444-4444-8444-444444444444';
const SPEC_ID = '55555555-5555-4555-8555-555555555555';
const FORGED_SPEC_ID = '66666666-6666-4666-8666-666666666666';
const APPROVED_AT = '2026-07-30T12:00:00.000Z';

function normalized(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function context(specMatches: boolean) {
  return {
    userId: USER_ID,
    orgId: ORG_ID,
    client: {
      async query<T>(sql: string) {
        const query = normalized(sql);
        if (query.includes('from public.user_roles')) {
          return { rows: [{ ok: true }] as T[], rowCount: 1 };
        }
        if (query.includes('from public.packaging_components')) {
          return { rows: [] as T[], rowCount: 0 };
        }
        if (query.includes('from public.npd_projects')) {
          return {
            rows: [{
              id: PROJECT_ID,
              code: 'NPD-NSA-028',
              current_gate: 'G4',
              current_stage: 'approval',
              product_code: 'FG-NSA-028',
            }] as T[],
            rowCount: 1,
          };
        }
        if (query.includes('from public.risks')) {
          return { rows: [{ open_high_count: '0' }] as T[], rowCount: 1 };
        }
        if (query.includes('from public.bom_headers')) {
          return { rows: [{ id: BOM_ID, version: 3, line_count: '1' }] as T[], rowCount: 1 };
        }
        if (query.includes('select fs.approved_at::text as approved_at')) {
          return { rows: [{ approved_at: APPROVED_AT }] as T[], rowCount: 1 };
        }
        if (query.includes('from public.factory_specs') && query.includes('fs.id = $1::uuid')) {
          return { rows: (specMatches ? [{ id: SPEC_ID }] : []) as T[], rowCount: specMatches ? 1 : 0 };
        }
        return { rows: [] as T[], rowCount: 1 };
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.materializeNpdBom.mockResolvedValue({
    bomHeaderId: BOM_ID,
    productionCode: 'FG-NSA-028',
    yieldPromptRequired: false,
  });
  mocks.insertReleasedToFactoryEvent.mockResolvedValue(41);
  mocks.transitionFactorySpecToReleased.mockResolvedValue(undefined);
  mocks.upsertFactoryReleaseStatus.mockResolvedValue({
    release_status: 'released_to_factory',
    factory_available_at: APPROVED_AT,
    release_event_id: 41,
  });
});

describe('Phase 2 NPD release contracts', () => {
  it('NSA-028 rejects a forged factorySpecId before writes and accepts a fully matched spec', async () => {
    const { releaseNpdProjectToFactory } = await import('../release-npd-project-to-factory');

    await expect(
      releaseNpdProjectToFactory(
        { projectId: PROJECT_ID, activeFactorySpecId: FORGED_SPEC_ID },
        context(false),
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: 'PRECONDITION_BLOCKERS',
      status: 409,
      blockers: [expect.objectContaining({ code: 'FACTORY_SPEC_MISMATCH' })],
    });
    expect(mocks.materializeNpdBom).not.toHaveBeenCalled();
    expect(mocks.insertReleasedToFactoryEvent).not.toHaveBeenCalled();

    const accepted = await releaseNpdProjectToFactory(
      { projectId: PROJECT_ID, activeFactorySpecId: SPEC_ID },
      context(true),
    );
    expect(accepted).toMatchObject({
      ok: true,
      data: {
        projectId: PROJECT_ID,
        activeBomHeaderId: BOM_ID,
        activeFactorySpecId: SPEC_ID,
        releaseStatus: 'released_to_factory',
      },
    });
  });
});
