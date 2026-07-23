import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const FG_ITEM_ID = '33333333-3333-4333-8333-333333333333';
const SPEC_ID = '44444444-4444-4444-8444-444444444444';
const NEW_SPEC_ID = '55555555-5555-4555-8555-555555555555';
const BOM_ID = '66666666-6666-4666-8666-666666666666';

type QueryCall = { sql: string; params: readonly unknown[] };

const runWithOrgContext = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('../_actions/revalidate', () => ({ safeRevalidatePath: vi.fn() }));
vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => runWithOrgContext(action)),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

type SpecState = {
  id: string;
  status: string;
  fg_item_id: string;
  spec_code: string;
  version: number;
  source: string;
  bom_header_id: string | null;
  bom_version: number | null;
  notes: string | null;
};

function makeClient(options: {
  spec: SpecState;
  signedApproval?: boolean;
  woRef?: boolean;
  releaseRef?: boolean;
  supersedeRef?: boolean;
}): { calls: QueryCall[]; query: ReturnType<typeof vi.fn> } {
  const calls: QueryCall[] = [];
  const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
    calls.push({ sql, params });
    const n = normalize(sql);

    if (n.includes('from public.user_roles')) {
      return { rows: [{ ok: true }], rowCount: 1 };
    }
    if (n.includes('from public.factory_specs fs') && n.includes('for update')) {
      return { rows: [options.spec], rowCount: 1 };
    }
    if (n.includes('from public.e_sign_log') && n.includes('select exists')) {
      return { rows: [{ exists: options.signedApproval ?? false }], rowCount: 1 };
    }
    if (n.includes('from public.work_orders') && n.includes('active_factory_spec_id')) {
      return { rows: options.woRef ? [{ id: 'wo-1' }] : [], rowCount: options.woRef ? 1 : 0 };
    }
    if (n.includes('from public.factory_release_status') && n.includes('active_factory_spec_id')) {
      return {
        rows: options.releaseRef ? [{ product_code: 'FG-1' }] : [],
        rowCount: options.releaseRef ? 1 : 0,
      };
    }
    if (n.includes('supersedes_factory_spec_id = $1::uuid')) {
      return { rows: options.supersedeRef ? [{ id: 'newer-spec' }] : [], rowCount: options.supersedeRef ? 1 : 0 };
    }
    if (n.startsWith('update public.factory_specs') && n.includes('spec_code = $2')) {
      return { rows: [], rowCount: 1 };
    }
    if (n.startsWith('delete from public.factory_specs')) {
      return { rows: [], rowCount: 1 };
    }
    if (n.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 0 };
    if (n.includes('coalesce(max(version), 0) + 1')) {
      return { rows: [{ next_version: options.spec.version + 1 }], rowCount: 1 };
    }
    if (n.startsWith('insert into public.factory_specs')) {
      return { rows: [{ id: NEW_SPEC_ID }], rowCount: 1 };
    }
    if (n.startsWith('update public.factory_specs') && n.includes("set status = 'archived'")) {
      return { rows: [], rowCount: 1 };
    }
    if (n.startsWith('insert into public.audit_events')) {
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unhandled SQL: ${n}`);
  });
  return { calls, query };
}

const baseSpec: SpecState = {
  id: SPEC_ID,
  status: 'draft',
  fg_item_id: FG_ITEM_ID,
  spec_code: 'FS-FG1',
  version: 1,
  source: 'technical',
  bom_header_id: null,
  bom_version: null,
  notes: 'Initial notes',
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('factory-spec lifecycle (C049)', () => {
  it('updateFactorySpec persists draft edits', async () => {
    const client = makeClient({ spec: baseSpec });
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );

    const { updateFactorySpec } = await import('../factory-spec-lifecycle');
    const result = await updateFactorySpec({
      specId: SPEC_ID,
      specCode: 'FS-FG1-REV',
      notes: 'Updated shelf-life notes',
    });

    expect(result).toEqual({ ok: true, data: { id: SPEC_ID } });
    expect(client.calls.some((call) => normalize(call.sql).includes('spec_code = $2'))).toBe(true);
  });

  it('updateFactorySpec creates a new in-review revision so an existing e-sign cannot approve edited content', async () => {
    const client = makeClient({
      spec: {
        ...baseSpec,
        status: 'in_review',
        bom_header_id: BOM_ID,
        bom_version: 8,
      },
      signedApproval: true,
    });
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );

    const { updateFactorySpec } = await import('../factory-spec-lifecycle');
    const result = await updateFactorySpec({
      specId: SPEC_ID,
      specCode: 'FS-FG1-REV',
      notes: 'Content changed after the first approval',
    });

    expect(result).toEqual({ ok: true, data: { id: NEW_SPEC_ID } });
    expect(client.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sql: expect.stringMatching(/from public\.e_sign_log/i),
          params: ['tech.fa.release', `${SPEC_ID}:${BOM_ID}:approve`],
        }),
        expect.objectContaining({
          sql: expect.stringMatching(/insert into public\.factory_specs/i),
          params: [
            SPEC_ID,
            'FS-FG1-REV',
            2,
            'Content changed after the first approval',
            USER_ID,
          ],
        }),
        expect.objectContaining({
          sql: expect.stringMatching(/set status = 'archived'/i),
          params: [SPEC_ID],
        }),
      ]),
    );
    expect(client.calls.some((call) => normalize(call.sql).includes('spec_code = $2'))).toBe(false);
  });

  it('saveFactorySpecVersion archives source and inserts next draft version', async () => {
    const client = makeClient({ spec: { ...baseSpec, status: 'in_review' } });
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );

    const { saveFactorySpecVersion } = await import('../factory-spec-lifecycle');
    const result = await saveFactorySpecVersion({
      specId: SPEC_ID,
      specCode: 'FS-FG1',
      notes: 'Carried notes',
      changeReason: 'Corrected review notes before approval',
    });

    expect(result).toEqual({ ok: true, data: { id: NEW_SPEC_ID, version: 2 } });
    expect(client.calls.some((call) => normalize(call.sql).startsWith('insert into public.factory_specs'))).toBe(true);
    expect(client.calls.some((call) => normalize(call.sql).includes("set status = 'archived'"))).toBe(true);
  });

  it('saveFactorySpecVersion blocks versioning a signed in-review specification', async () => {
    const client = makeClient({
      spec: {
        ...baseSpec,
        status: 'in_review',
        bom_header_id: BOM_ID,
        bom_version: 8,
      },
      signedApproval: true,
    });
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );

    const { saveFactorySpecVersion } = await import('../factory-spec-lifecycle');
    const result = await saveFactorySpecVersion({
      specId: SPEC_ID,
      specCode: 'FS-FG1-REV',
      notes: 'Content changed after the first approval',
      changeReason: 'Corrected signed specification content',
    });

    expect(result).toEqual({
      ok: false,
      error: 'invalid_state',
      message: 'Signed in-review specifications must be edited to create a new in-review revision',
    });
    expect(client.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sql: expect.stringMatching(/from public\.e_sign_log/i),
          params: ['tech.fa.release', `${SPEC_ID}:${BOM_ID}:approve`],
        }),
      ]),
    );
    expect(client.calls.some((call) => normalize(call.sql).includes('pg_advisory_xact_lock'))).toBe(false);
    expect(client.calls.some((call) => normalize(call.sql).startsWith('insert into public.factory_specs'))).toBe(false);
    expect(client.calls.some((call) => normalize(call.sql).includes("set status = 'archived'"))).toBe(false);
  });

  it('deleteFactorySpec blocks when referenced by a work order snapshot', async () => {
    const client = makeClient({ spec: baseSpec, woRef: true });
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );

    const { deleteFactorySpec } = await import('../factory-spec-lifecycle');
    const result = await deleteFactorySpec({ specId: SPEC_ID });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('referenced');
    expect(result.message).toMatch(/work order/i);
    expect(client.calls.some((call) => normalize(call.sql).startsWith('delete from public.factory_specs'))).toBe(false);
  });

  it('deleteFactorySpec removes an unused draft', async () => {
    const client = makeClient({ spec: baseSpec });
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );

    const { deleteFactorySpec } = await import('../factory-spec-lifecycle');
    const result = await deleteFactorySpec({ specId: SPEC_ID });

    expect(result).toEqual({ ok: true, data: { id: SPEC_ID } });
    expect(client.calls.some((call) => normalize(call.sql).startsWith('delete from public.factory_specs'))).toBe(true);
  });
});
