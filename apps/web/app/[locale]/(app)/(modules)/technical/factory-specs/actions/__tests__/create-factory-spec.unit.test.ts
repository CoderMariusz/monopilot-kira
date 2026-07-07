import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const FG_ITEM_ID = '33333333-3333-4333-8333-333333333333';
const SPEC_ID = '44444444-4444-4444-8444-444444444444';
const BOM_ID = '55555555-5555-4555-8555-555555555555';

const PRIOR_SPEC_ID = '66666666-6666-4666-8666-666666666666';

type QueryCall = { sql: string; params: readonly unknown[] };

type FakeClient = {
  calls: QueryCall[];
  hasPermission: boolean;
  item: { id: string; item_type: string } | null;
  spec: {
    id: string;
    status: string;
    fg_item_id: string;
    fg_item_code: string;
    bom_header_id: string | null;
    bom_version: number | null;
    approved_by?: string | null;
    approved_at?: string | null;
  } | null;
  bom: { id: string; product_id: string | null; version: number; status: string } | null;
  nextVersion: number;
  priorReleasedSpecId: string | null;
  fgNpdProjectId: string | null;
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const { runWithOrgContext, revalidatePath } = vi.hoisted(() => ({
  runWithOrgContext: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('../../../../../../../../lib/i18n/revalidate-localized', () => ({ revalidateLocalized: revalidatePath }));
vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => runWithOrgContext(action)),
}));
vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => runWithOrgContext(action)),
}));

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(overrides: Partial<Pick<FakeClient, 'hasPermission' | 'item' | 'spec' | 'bom' | 'nextVersion' | 'priorReleasedSpecId' | 'fgNpdProjectId'>> = {}): FakeClient {
  const client: FakeClient = {
    calls: [],
    hasPermission: overrides.hasPermission ?? true,
    item: overrides.item === undefined ? { id: FG_ITEM_ID, item_type: 'fg' } : overrides.item,
    spec:
      overrides.spec === undefined
        ? {
            id: SPEC_ID,
            status: 'draft',
            fg_item_id: FG_ITEM_ID,
            fg_item_code: 'FG5101',
            bom_header_id: BOM_ID,
            bom_version: 8,
            approved_by: USER_ID,
            approved_at: '2026-07-07T00:00:00.000Z',
          }
        : overrides.spec,
    bom:
      overrides.bom === undefined
        ? { id: BOM_ID, product_id: 'FG5101', version: 8, status: 'in_review' }
        : overrides.bom,
    nextVersion: overrides.nextVersion ?? 4,
    priorReleasedSpecId: overrides.priorReleasedSpecId ?? null,
    fgNpdProjectId: overrides.fgNpdProjectId ?? null,
    async query(sql, params = []) {
      client.calls.push({ sql, params });
      const normalized = normalizeSql(sql);

      if (normalized.includes('from public.user_roles')) {
        return { rows: (client.hasPermission ? [{ ok: true }] : []) as never[], rowCount: client.hasPermission ? 1 : 0 };
      }
      if (normalized.includes('from public.items') && normalized.includes('npd_project_id')) {
        return {
          rows: [{ npd_project_id: client.fgNpdProjectId }] as never[],
          rowCount: 1,
        };
      }
      if (normalized.includes('from public.items') && normalized.includes('id = $1::uuid')) {
        return { rows: (client.item ? [client.item] : []) as never[], rowCount: client.item ? 1 : 0 };
      }
      if (normalized.includes('from public.factory_specs fs') && normalized.includes('join public.items i')) {
        return { rows: (client.spec ? [client.spec] : []) as never[], rowCount: client.spec ? 1 : 0 };
      }
      if (normalized.includes('from public.bom_headers') && normalized.includes('id = $1::uuid')) {
        return { rows: (client.bom ? [client.bom] : []) as never[], rowCount: client.bom ? 1 : 0 };
      }
      if (normalized.includes('coalesce(max(version), 0) + 1')) {
        return { rows: [{ next_version: client.nextVersion }] as never[], rowCount: 1 };
      }
      if (normalized.includes('from public.factory_specs') && normalized.includes('status in (')) {
        const priorId = client.priorReleasedSpecId;
        return { rows: (priorId ? [{ id: priorId }] : []) as never[], rowCount: priorId ? 1 : 0 };
      }
      if (normalized.includes('from public.factory_specs') && normalized.includes('supersedes')) {
        const targetId = String(params?.[0] ?? '');
        const ok = targetId === PRIOR_SPEC_ID || targetId === SPEC_ID;
        return { rows: (ok ? [{ id: targetId }] : []) as never[], rowCount: ok ? 1 : 0 };
      }
      if (normalized.startsWith('insert into public.factory_specs')) {
        return { rows: [{ id: SPEC_ID }] as never[], rowCount: 1 };
      }
      if (normalized.startsWith('update public.factory_specs') && normalized.includes("set status = 'superseded'")) {
        return { rows: [] as never[], rowCount: 0 };
      }
      if (normalized.startsWith('update public.factory_specs') && normalized.includes("set status = 'released_to_factory'")) {
        const ok = client.spec?.status === 'approved_for_factory';
        if (ok && client.spec) client.spec = { ...client.spec, status: 'released_to_factory' };
        return { rows: (ok ? [{ id: client.spec?.id ?? SPEC_ID }] : []) as never[], rowCount: ok ? 1 : 0 };
      }
      if (normalized.startsWith('update public.factory_specs') && normalized.includes("set status = 'in_review'")) {
        const ok = client.spec?.status === 'draft';
        if (ok && client.spec) client.spec = { ...client.spec, status: 'in_review' };
        return { rows: (ok ? [{ id: client.spec?.id ?? SPEC_ID }] : []) as never[], rowCount: ok ? 1 : 0 };
      }
      if (normalized.startsWith('update public.factory_specs') && normalized.includes('set bom_header_id')) {
        const ok = client.spec != null && ['draft', 'in_review'].includes(client.spec.status);
        if (ok && client.spec && client.bom) {
          client.spec = { ...client.spec, bom_header_id: client.bom.id, bom_version: client.bom.version };
        }
        return { rows: (ok ? [{ id: client.spec?.id ?? SPEC_ID }] : []) as never[], rowCount: ok ? 1 : 0 };
      }
      if (normalized.startsWith('insert into public.audit_events')) {
        return { rows: [] as never[], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.outbox_events')) {
        return { rows: [{ id: 42 }] as never[], rowCount: 1 };
      }
      if (normalized.includes('from public.outbox_events') && normalized.includes('dedup_key')) {
        return { rows: [] as never[], rowCount: 0 };
      }
      if (normalized.startsWith('update public.factory_release_status')) {
        return { rows: [] as never[], rowCount: 1 };
      }

      throw new Error(`unhandled SQL: ${normalized}`);
    },
  };
  return client;
}

beforeEach(() => {
  vi.clearAllMocks();
  runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client: makeClient() }),
  );
});

describe('createFactorySpec', () => {
  it('inserts a draft factory_specs row under org context and writes audit_events', async () => {
    const client = makeClient({ nextVersion: 7 });
    runWithOrgContext.mockImplementationOnce(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );
    const { createFactorySpec } = await import('../create-factory-spec');

    const result = await createFactorySpec({
      fgItemId: FG_ITEM_ID,
      specCode: 'FS-FG5101',
      notes: 'Initial technical draft',
    });

    expect(result).toEqual({
      ok: true,
      data: { id: SPEC_ID, specCode: 'FS-FG5101', version: 7 },
    });
    expect(client.calls.some((call) => normalizeSql(call.sql).includes('app.current_org_id()'))).toBe(true);

    const insert = client.calls.find((call) => normalizeSql(call.sql).startsWith('insert into public.factory_specs'));
    expect(insert?.params).toEqual([FG_ITEM_ID, 'FS-FG5101', 7, 'Initial technical draft', USER_ID, null]);
    expect(normalizeSql(insert?.sql ?? '')).toContain("'draft'");
    expect(normalizeSql(insert?.sql ?? '')).toContain("'technical'");

    const audit = client.calls.find((call) => normalizeSql(call.sql).startsWith('insert into public.audit_events'));
    expect(audit?.params[0]).toBe(ORG_ID);
    expect(audit?.params[1]).toBe(USER_ID);
    expect(audit?.params[2]).toBe(SPEC_ID);
    expect(JSON.parse(String(audit?.params[3]))).toMatchObject({
      fgItemId: FG_ITEM_ID,
      specCode: 'FS-FG5101',
      version: 7,
      status: 'draft',
      source: 'technical',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/technical/factory-specs');
  });

  it('writes supersedes_factory_spec_id when cloning from a released predecessor', async () => {
    const client = makeClient({ nextVersion: 5, priorReleasedSpecId: PRIOR_SPEC_ID });
    runWithOrgContext.mockImplementationOnce(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );
    const { createFactorySpec } = await import('../create-factory-spec');

    const result = await createFactorySpec({
      fgItemId: FG_ITEM_ID,
      specCode: 'FS-FG5101-v5',
      supersedesSpecId: PRIOR_SPEC_ID,
    });

    expect(result.ok).toBe(true);
    const insert = client.calls.find((call) => normalizeSql(call.sql).startsWith('insert into public.factory_specs'));
    expect(insert?.params).toEqual([FG_ITEM_ID, 'FS-FG5101-v5', 5, null, USER_ID, PRIOR_SPEC_ID]);
  });

  it('auto-links supersedes_factory_spec_id from the latest released version for the FG', async () => {
    const client = makeClient({ nextVersion: 6, priorReleasedSpecId: PRIOR_SPEC_ID });
    runWithOrgContext.mockImplementationOnce(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );
    const { createFactorySpec } = await import('../create-factory-spec');

    await createFactorySpec({ fgItemId: FG_ITEM_ID, specCode: 'FS-FG5101-v6' });

    const insert = client.calls.find((call) => normalizeSql(call.sql).startsWith('insert into public.factory_specs'));
    expect(insert?.params[5]).toBe(PRIOR_SPEC_ID);
  });

  it('returns forbidden before insert when the approval/write permission is missing', async () => {
    const client = makeClient({ hasPermission: false });
    runWithOrgContext.mockImplementationOnce(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );
    const { createFactorySpec } = await import('../create-factory-spec');

    const result = await createFactorySpec({ fgItemId: FG_ITEM_ID, specCode: 'FS-FG5101' });

    expect(result).toEqual({ ok: false, error: 'forbidden' });
    expect(client.calls.some((call) => normalizeSql(call.sql).startsWith('insert into public.factory_specs'))).toBe(false);
  });

  it('rejects non-FG items before writing factory_specs', async () => {
    const client = makeClient({ item: { id: FG_ITEM_ID, item_type: 'rm' } });
    runWithOrgContext.mockImplementationOnce(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );
    const { createFactorySpec } = await import('../create-factory-spec');

    const result = await createFactorySpec({ fgItemId: FG_ITEM_ID, specCode: 'FS-RM3001' });

    expect(result).toEqual({
      ok: false,
      error: 'invalid_input',
      message: 'factory_specs must be anchored to an FG item',
    });
    expect(client.calls.some((call) => normalizeSql(call.sql).startsWith('insert into public.factory_specs'))).toBe(false);
  });
});

describe('factory spec review flow actions', () => {
  it('moves a draft factory_spec to in_review and audit-logs the transition', async () => {
    const client = makeClient({ spec: { ...makeClient().spec!, status: 'draft' } });
    runWithOrgContext.mockImplementationOnce(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );
    const { submitFactorySpecForReview } = await import('../factory-spec-flow');

    const result = await submitFactorySpecForReview({ specId: SPEC_ID });

    expect(result).toEqual({ ok: true, data: { specId: SPEC_ID, status: 'in_review' } });
    const update = client.calls.find((call) => normalizeSql(call.sql).startsWith('update public.factory_specs'));
    expect(normalizeSql(update?.sql ?? '')).toContain("status = 'draft'");
    expect(normalizeSql(update?.sql ?? '')).toContain('app.current_org_id()');
    const audit = client.calls.find((call) => String(call.params[2]) === 'factory_spec.submitted_for_review');
    expect(audit).toBeTruthy();
  });

  it('refuses submit for review when the spec is not draft', async () => {
    const client = makeClient({ spec: { ...makeClient().spec!, status: 'approved_for_factory' } });
    runWithOrgContext.mockImplementationOnce(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );
    const { submitFactorySpecForReview } = await import('../factory-spec-flow');

    const result = await submitFactorySpecForReview({ specId: SPEC_ID });

    expect(result).toEqual({
      ok: false,
      error: 'invalid_state',
      message: 'factory_spec is approved_for_factory; expected draft',
    });
    expect(client.calls.some((call) => normalizeSql(call.sql).startsWith('update public.factory_specs'))).toBe(false);
  });

  it('links a matching BOM header and snapshots bom_version on draft/in_review specs', async () => {
    const client = makeClient({ spec: { ...makeClient().spec!, status: 'in_review' } });
    runWithOrgContext.mockImplementationOnce(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );
    const { linkFactorySpecBom } = await import('../factory-spec-flow');

    const result = await linkFactorySpecBom({ specId: SPEC_ID, bomHeaderId: BOM_ID });

    expect(result).toEqual({
      ok: true,
      data: { specId: SPEC_ID, bomHeaderId: BOM_ID, bomVersion: 8, bomStatus: 'in_review' },
    });
    const update = client.calls.find((call) => normalizeSql(call.sql).startsWith('update public.factory_specs'));
    expect(update?.params).toEqual([SPEC_ID, BOM_ID, 8]);
    expect(normalizeSql(update?.sql ?? '')).toContain("status in ('draft', 'in_review')");
    const audit = client.calls.find((call) => String(call.params[2]) === 'factory_spec.bom_linked');
    expect(audit).toBeTruthy();
  });

  it('rejects BOM linking when bom_headers.product_id does not match the spec FG item code', async () => {
    const client = makeClient({
      spec: { ...makeClient().spec!, status: 'draft', fg_item_code: 'FG5101' },
      bom: { id: BOM_ID, product_id: 'FG9999', version: 2, status: 'draft' },
    });
    runWithOrgContext.mockImplementationOnce(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );
    const { linkFactorySpecBom } = await import('../factory-spec-flow');

    const result = await linkFactorySpecBom({ specId: SPEC_ID, bomHeaderId: BOM_ID });

    expect(result).toEqual({
      ok: false,
      error: 'product_mismatch',
      message: 'BOM product FG9999 does not match factory_spec FG FG5101',
    });
    expect(client.calls.some((call) => normalizeSql(call.sql).startsWith('update public.factory_specs'))).toBe(false);
  });
});

describe('releaseFactorySpecToFactory', () => {
  it('releases an approved_for_factory spec and emits fg.released_to_factory', async () => {
    const client = makeClient({
      spec: {
        id: SPEC_ID,
        status: 'approved_for_factory',
        fg_item_id: FG_ITEM_ID,
        fg_item_code: 'FG5101',
        bom_header_id: BOM_ID,
        bom_version: 8,
        approved_by: USER_ID,
        approved_at: '2026-07-07T00:00:00.000Z',
      },
    });
    runWithOrgContext.mockImplementationOnce(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );
    const { releaseFactorySpecToFactory } = await import('../factory-spec-flow');

    const result = await releaseFactorySpecToFactory({ specId: SPEC_ID });

    expect(result).toEqual({ ok: true, data: { specId: SPEC_ID, status: 'released_to_factory' } });
    expect(client.spec?.status).toBe('released_to_factory');
    const outbox = client.calls.find((call) => normalizeSql(call.sql).startsWith('insert into public.outbox_events'));
    expect(outbox?.params?.[0]).toBe('fg.released_to_factory');
    expect(outbox?.params?.[1]).toBe('FG5101');
    const audit = client.calls.find((call) => String(call.params[2]) === 'factory_spec.released_to_factory');
    expect(audit).toBeTruthy();
  });

  it('rejects release for NPD-backed FG items', async () => {
    const client = makeClient({
      fgNpdProjectId: '99999999-9999-4999-8999-999999999999',
      spec: {
        id: SPEC_ID,
        status: 'approved_for_factory',
        fg_item_id: FG_ITEM_ID,
        fg_item_code: 'FG5101',
        bom_header_id: BOM_ID,
        bom_version: 8,
        approved_by: USER_ID,
        approved_at: '2026-07-07T00:00:00.000Z',
      },
    });
    runWithOrgContext.mockImplementationOnce(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );
    const { releaseFactorySpecToFactory } = await import('../factory-spec-flow');

    const result = await releaseFactorySpecToFactory({ specId: SPEC_ID });

    expect(result).toEqual({
      ok: false,
      error: 'npd_handoff_required',
      message: 'NPD-backed specifications must be released via NPD Handoff',
    });
    expect(client.calls.some((call) => normalizeSql(call.sql).includes('released_to_factory'))).toBe(false);
  });

  it('rejects release when the spec is still draft', async () => {
    const client = makeClient({
      spec: {
        id: SPEC_ID,
        status: 'draft',
        fg_item_id: FG_ITEM_ID,
        fg_item_code: 'FG5101',
        bom_header_id: null,
        bom_version: null,
      },
    });
    runWithOrgContext.mockImplementationOnce(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );
    const { releaseFactorySpecToFactory } = await import('../factory-spec-flow');

    const result = await releaseFactorySpecToFactory({ specId: SPEC_ID });

    expect(result).toEqual({
      ok: false,
      error: 'invalid_state',
      message: 'factory_spec is draft; expected approved_for_factory',
    });
    expect(client.calls.some((call) => normalizeSql(call.sql).includes('released_to_factory'))).toBe(false);
  });

  it('rejects release when the paired BOM is missing', async () => {
    const client = makeClient({
      spec: {
        id: SPEC_ID,
        status: 'approved_for_factory',
        fg_item_id: FG_ITEM_ID,
        fg_item_code: 'FG5101',
        bom_header_id: null,
        bom_version: null,
        approved_by: USER_ID,
        approved_at: '2026-07-07T00:00:00.000Z',
      },
    });
    runWithOrgContext.mockImplementationOnce(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );
    const { releaseFactorySpecToFactory } = await import('../factory-spec-flow');

    const result = await releaseFactorySpecToFactory({ specId: SPEC_ID });

    expect(result).toEqual({
      ok: false,
      error: 'invalid_state',
      message: 'factory_spec has no paired BOM bundle',
    });
  });
});
