import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const FG_ITEM_ID = '33333333-3333-4333-8333-333333333333';
const SPEC_ID = '44444444-4444-4444-8444-444444444444';
const BOM_ID = '55555555-5555-4555-8555-555555555555';

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
  } | null;
  bom: { id: string; product_id: string | null; version: number; status: string } | null;
  nextVersion: number;
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

function makeClient(overrides: Partial<Pick<FakeClient, 'hasPermission' | 'item' | 'spec' | 'bom' | 'nextVersion'>> = {}): FakeClient {
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
            bom_header_id: null,
            bom_version: null,
          }
        : overrides.spec,
    bom:
      overrides.bom === undefined
        ? { id: BOM_ID, product_id: 'FG5101', version: 8, status: 'in_review' }
        : overrides.bom,
    nextVersion: overrides.nextVersion ?? 4,
    async query(sql, params = []) {
      client.calls.push({ sql, params });
      const normalized = normalizeSql(sql);

      if (normalized.includes('from public.user_roles')) {
        return { rows: (client.hasPermission ? [{ ok: true }] : []) as never[], rowCount: client.hasPermission ? 1 : 0 };
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
      if (normalized.startsWith('insert into public.factory_specs')) {
        return { rows: [{ id: SPEC_ID }] as never[], rowCount: 1 };
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
    expect(insert?.params).toEqual([FG_ITEM_ID, 'FS-FG5101', 7, 'Initial technical draft', USER_ID]);
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
