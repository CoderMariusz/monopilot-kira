import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the BOM component-line add/edit/delete Server Actions.
 *
 * Drives addBomLine / updateBomLine / deleteBomLine through a fake org-scoped
 * query client (no DB), asserting the editability guard (draft/in_review only),
 * the forbidden gate, the F-B01 in-place APPEND (line_no = max + 1, NO new
 * bom_headers row), and the delete renumbering pass that keeps line_no a dense
 * 1..N sequence.
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
  /** F7: how many bom_lines INSERT attempts raise 23505 before one succeeds. */
  failInsertsWith23505: number;
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
    failInsertsWith23505: 0,
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
      // addBomLine — V-TEC-13 cycle edges over the ACTIVE BOM graph (none).
      if (n.includes('as parent') && n.includes('as component')) {
        return { rows: [] as never[], rowCount: 0 };
      }
      // addBomLine — V-TEC-14 RM usability reads (item active, no spec, no allergens).
      if (n.startsWith('select id, status, updated_at from public.items')) {
        return {
          rows: [{ id: '66666666-6666-4666-8666-666666666666', status: 'active', updated_at: '2026-01-01T00:00:00Z' }] as never[],
          rowCount: 1,
        };
      }
      if (n.includes('from public.supplier_specs') || n.includes('from public.item_allergen_profiles')) {
        return { rows: [] as never[], rowCount: 0 };
      }
      // F7 — savepoint fencing around the append attempt.
      if (n.startsWith('savepoint') || n.startsWith('release savepoint') || n.startsWith('rollback to savepoint')) {
        return { rows: [] as never[], rowCount: 0 };
      }
      // addBomLine — APPEND insert (line_no = max + 1 in-statement).
      if (n.startsWith('insert into public.bom_lines')) {
        if (client.failInsertsWith23505 > 0) {
          client.failInsertsWith23505 -= 1;
          const err = new Error('duplicate key value violates unique constraint "bom_lines_header_line_no_key"') as Error & { code: string };
          err.code = '23505';
          throw err;
        }
        return { rows: [{ id: '77777777-7777-4777-8777-777777777777', line_no: 3 }] as never[], rowCount: 1 };
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

describe('addBomLine (F-B01 — append in place, no version fork)', () => {
  const NEW_LINE = {
    bomHeaderId: HEADER_ID,
    itemId: '66666666-6666-4666-8666-666666666666',
    componentCode: 'RM-003',
    componentType: 'RM' as const,
    quantity: 0.25,
    uom: 'kg',
    scrapPct: 1,
    manufacturingOperationName: 'Mixing',
  };

  it('appends the line to the existing draft header (line_no = max + 1) and writes NO new bom_headers row', async () => {
    const { addBomLine } = await import('../line-actions');
    const res = await addBomLine(NEW_LINE);
    expect(res).toEqual({
      ok: true,
      data: { lineId: '77777777-7777-4777-8777-777777777777', bomHeaderId: HEADER_ID },
    });
    const ins = client.calls.find((c) => normalizeSql(c.sql).startsWith('insert into public.bom_lines'));
    expect(ins).toBeDefined();
    // The single statement computes line_no = coalesce(max(line_no),0)+1 — no read-modify race.
    expect(normalizeSql(ins!.sql)).toContain('coalesce((select max(line_no)');
    expect(ins!.params).toEqual([HEADER_ID, NEW_LINE.itemId, 'RM-003', 'RM', 0.25, 'kg', 1, 'Mixing']);
    // NO version fork: nothing ever inserts into bom_headers.
    expect(client.calls.some((c) => normalizeSql(c.sql).startsWith('insert into public.bom_headers'))).toBe(false);
  });

  it('refuses with bom_not_editable on an active version (append never mutates released rows)', async () => {
    install(makeClient({ headerStatus: 'active' }));
    const { addBomLine } = await import('../line-actions');
    const res = await addBomLine(NEW_LINE);
    expect(res).toMatchObject({ ok: false, error: 'bom_not_editable' });
    expect(client.calls.some((c) => normalizeSql(c.sql).startsWith('insert into public.bom_lines'))).toBe(false);
  });

  it('rejects a self-referencing component with V-TEC-13', async () => {
    const { addBomLine } = await import('../line-actions');
    const res = await addBomLine({ ...NEW_LINE, componentCode: 'FG-1' }); // header.product_id = FG-1
    expect(res).toMatchObject({ ok: false, error: 'validation_failed', code: 'V-TEC-13' });
    expect(client.calls.some((c) => normalizeSql(c.sql).startsWith('insert into public.bom_lines'))).toBe(false);
  });

  it('returns forbidden without the bom.create permission', async () => {
    install(makeClient({ hasPermission: false }));
    const { addBomLine } = await import('../line-actions');
    const res = await addBomLine(NEW_LINE);
    expect(res).toEqual({ ok: false, error: 'forbidden' });
  });

  it('rejects a non-positive quantity as invalid_input before any DB call', async () => {
    const { addBomLine } = await import('../line-actions');
    const res = await addBomLine({ ...NEW_LINE, quantity: 0 });
    expect(res).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(client.calls.length).toBe(0);
  });

  // ── F7 (W9 cross-review MEDIUM) — append race: retry ONCE on 23505 ──────────
  it('F7: retries ONCE when the first append loses the line_no race (23505) and succeeds', async () => {
    install(makeClient({ failInsertsWith23505: 1 }));
    const { addBomLine } = await import('../line-actions');
    const res = await addBomLine(NEW_LINE);
    expect(res).toEqual({
      ok: true,
      data: { lineId: '77777777-7777-4777-8777-777777777777', bomHeaderId: HEADER_ID },
    });
    const sqls = client.calls.map((c) => normalizeSql(c.sql));
    // Exactly TWO insert attempts (the loser + the single retry recomputing max+1).
    expect(sqls.filter((s) => s.startsWith('insert into public.bom_lines'))).toHaveLength(2);
    // The failed attempt is fenced: savepoint → (23505) → rollback to savepoint,
    // so the surrounding org-context transaction is NOT left aborted (25P02).
    const firstInsert = sqls.findIndex((s) => s.startsWith('insert into public.bom_lines'));
    expect(sqls[firstInsert - 1]).toBe('savepoint bom_line_append');
    expect(sqls[firstInsert + 1]).toBe('rollback to savepoint bom_line_append');
    // The winning attempt releases its savepoint.
    expect(sqls).toContain('release savepoint bom_line_append');
  });

  it('F7: a second consecutive 23505 fails with persistence_failed (no third attempt)', async () => {
    install(makeClient({ failInsertsWith23505: 2 }));
    const { addBomLine } = await import('../line-actions');
    const res = await addBomLine(NEW_LINE);
    expect(res).toMatchObject({ ok: false, error: 'persistence_failed' });
    const inserts = client.calls.filter((c) => normalizeSql(c.sql).startsWith('insert into public.bom_lines'));
    expect(inserts).toHaveLength(2); // one retry, never a third
  });
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

  it('omits the notes column when notes is undefined', async () => {
    const { updateBomLine } = await import('../line-actions');
    const res = await updateBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_ID, qty: '2.5', uom: 'g' });
    expect(res).toEqual({ ok: true, data: { lineId: LINE_ID, bomHeaderId: HEADER_ID } });
    const upd = client.calls.find((c) => normalizeSql(c.sql).startsWith('update public.bom_lines') && normalizeSql(c.sql).includes('set quantity'));
    expect(upd).toBeDefined();
    expect(normalizeSql(upd!.sql)).not.toContain('manufacturing_operation_name');
    expect(upd!.params).toEqual([HEADER_ID, LINE_ID, '2.5', 'g']);
  });

  it('clears notes to null when notes is an empty string', async () => {
    const { updateBomLine } = await import('../line-actions');
    const res = await updateBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_ID, qty: '2.5', notes: '' });
    expect(res).toEqual({ ok: true, data: { lineId: LINE_ID, bomHeaderId: HEADER_ID } });
    const upd = client.calls.find((c) => normalizeSql(c.sql).startsWith('update public.bom_lines') && normalizeSql(c.sql).includes('set quantity'));
    expect(upd).toBeDefined();
    expect(normalizeSql(upd!.sql)).toContain('manufacturing_operation_name = $5');
    expect(upd!.params[4]).toBeNull();
  });

  it('sets notes to a non-empty string when provided', async () => {
    const { updateBomLine } = await import('../line-actions');
    const res = await updateBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_ID, qty: '2.5', notes: 'some text' });
    expect(res).toEqual({ ok: true, data: { lineId: LINE_ID, bomHeaderId: HEADER_ID } });
    const upd = client.calls.find((c) => normalizeSql(c.sql).startsWith('update public.bom_lines') && normalizeSql(c.sql).includes('set quantity'));
    expect(upd).toBeDefined();
    expect(normalizeSql(upd!.sql)).toContain('manufacturing_operation_name = $5');
    expect(upd!.params[4]).toBe('some text');
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
