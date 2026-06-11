import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the BOM component-line edit/delete Server Actions.
 *
 * Drives updateBomLine / deleteBomLine through a fake org-scoped query client
 * (no DB), asserting the editability guard (draft/in_review only), the forbidden
 * gate, and the delete renumbering pass that keeps line_no a dense 1..N sequence.
 */

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const HEADER_ID = '44444444-4444-4444-8444-444444444444';
const LINE_ID = '55555555-5555-4555-8555-555555555555';

type QueryCall = { sql: string; params: readonly unknown[] };

type FakeClient = {
  calls: QueryCall[];
  hasPermission: boolean;
  headerStatus: string | null; // null → header not found
  lineExists: boolean;
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const { runWithOrgContext, revalidatePath } = vi.hoisted(() => ({
  runWithOrgContext: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => runWithOrgContext(action)),
}));
vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => runWithOrgContext(action)),
}));

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(overrides: Partial<FakeClient> = {}): FakeClient {
  const client: FakeClient = {
    calls: [],
    hasPermission: true,
    headerStatus: 'draft',
    lineExists: true,
    async query(sql, params = []) {
      client.calls.push({ sql, params });
      const n = normalizeSql(sql);

      if (n.includes('from public.user_roles')) {
        return { rows: (client.hasPermission ? [{ ok: true }] : []) as never[], rowCount: client.hasPermission ? 1 : 0 };
      }
      if (n.startsWith('select id, product_id, status from public.bom_headers')) {
        return {
          rows: (client.headerStatus ? [{ id: HEADER_ID, product_id: 'FG-1', status: client.headerStatus }] : []) as never[],
          rowCount: client.headerStatus ? 1 : 0,
        };
      }
      if (n.includes('from public.bom_lines') && n.includes('id = $2::uuid') && n.startsWith('select')) {
        return {
          rows: (client.lineExists
            ? [{ id: LINE_ID, line_no: 2, component_code: 'RM-002', quantity: '1.000', uom: 'kg', manufacturing_operation_name: null }]
            : []) as never[],
          rowCount: client.lineExists ? 1 : 0,
        };
      }
      if (n.startsWith('update public.bom_lines') && n.includes('set quantity')) {
        return { rows: [] as never[], rowCount: 1 };
      }
      if (n.startsWith('delete from public.bom_lines')) {
        return { rows: [] as never[], rowCount: 1 };
      }
      if (n.startsWith('with ranked as')) {
        return { rows: [] as never[], rowCount: 2 };
      }
      if (n.startsWith('insert into public.audit_log')) {
        return { rows: [] as never[], rowCount: 1 };
      }
      return { rows: [] as never[], rowCount: 0 };
    },
    ...overrides,
  };
  return client;
}

let client: FakeClient;

function install(c: FakeClient): void {
  client = c;
  runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  );
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  install(makeClient());
});

describe('updateBomLine', () => {
  it('persists qty as a decimal string ::numeric and patches uom/notes on a draft header', async () => {
    const { updateBomLine } = await import('../line-actions');
    const res = await updateBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_ID, qty: '2.5', uom: 'g', notes: 'mix slowly' });
    expect(res).toEqual({ ok: true, data: { lineId: LINE_ID, bomHeaderId: HEADER_ID } });
    const upd = client.calls.find((c) => normalizeSql(c.sql).startsWith('update public.bom_lines') && normalizeSql(c.sql).includes('set quantity'));
    expect(upd).toBeDefined();
    expect(upd!.params).toEqual([HEADER_ID, LINE_ID, '2.5', 'g', 'mix slowly']);
  });

  it('refuses with bom_not_editable on an active version (clone-on-write red-line)', async () => {
    install(makeClient({ headerStatus: 'active' }));
    const { updateBomLine } = await import('../line-actions');
    const res = await updateBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_ID, qty: '2.5' });
    expect(res).toMatchObject({ ok: false, error: 'bom_not_editable' });
    expect(client.calls.some((c) => normalizeSql(c.sql).startsWith('update public.bom_lines'))).toBe(false);
  });

  it('refuses with bom_not_editable on a technical_approved version', async () => {
    install(makeClient({ headerStatus: 'technical_approved' }));
    const { updateBomLine } = await import('../line-actions');
    const res = await updateBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_ID, qty: '1' });
    expect(res).toMatchObject({ ok: false, error: 'bom_not_editable' });
  });

  it('returns forbidden without the bom.create permission', async () => {
    install(makeClient({ hasPermission: false }));
    const { updateBomLine } = await import('../line-actions');
    const res = await updateBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_ID, qty: '1' });
    expect(res).toEqual({ ok: false, error: 'forbidden' });
  });

  it('rejects a non-positive qty as invalid_input before any DB write', async () => {
    const { updateBomLine } = await import('../line-actions');
    const res = await updateBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_ID, qty: '0' });
    expect(res).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(client.calls.length).toBe(0);
  });
});

describe('deleteBomLine', () => {
  it('deletes the line then renumbers remaining lines into a dense sequence', async () => {
    const { deleteBomLine } = await import('../line-actions');
    const res = await deleteBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_ID });
    expect(res).toEqual({ ok: true, data: { lineId: LINE_ID, bomHeaderId: HEADER_ID } });
    const del = client.calls.findIndex((c) => normalizeSql(c.sql).startsWith('delete from public.bom_lines'));
    const renum = client.calls.findIndex((c) => normalizeSql(c.sql).startsWith('with ranked as'));
    expect(del).toBeGreaterThan(-1);
    expect(renum).toBeGreaterThan(del);
  });

  it('refuses delete with bom_not_editable on a superseded version', async () => {
    install(makeClient({ headerStatus: 'superseded' }));
    const { deleteBomLine } = await import('../line-actions');
    const res = await deleteBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_ID });
    expect(res).toMatchObject({ ok: false, error: 'bom_not_editable' });
    expect(client.calls.some((c) => normalizeSql(c.sql).startsWith('delete from public.bom_lines'))).toBe(false);
  });

  it('returns not_found when the line does not exist', async () => {
    install(makeClient({ lineExists: false }));
    const { deleteBomLine } = await import('../line-actions');
    const res = await deleteBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_ID });
    expect(res).toEqual({ ok: false, error: 'not_found' });
  });

  it('returns forbidden without permission', async () => {
    install(makeClient({ hasPermission: false }));
    const { deleteBomLine } = await import('../line-actions');
    const res = await deleteBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_ID });
    expect(res).toEqual({ ok: false, error: 'forbidden' });
  });
});
