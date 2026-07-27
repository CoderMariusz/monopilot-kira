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

/** PF-R06-04: a 3-line BOM whose line_no the fake actually mutates, so the two-phase
 *  renumber is verified end-to-end (dense 1..N) rather than by SQL-string sniffing. */
const LINE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LINE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LINE_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

type FakeClient = {
  calls: QueryCall[];
  hasPermission: boolean;
  headerStatus: string | null; // null → header not found
  lineExists: boolean;
  /** Mutable line_no state driving the moveBomLine renumber assertions. */
  lines: Array<{ id: string; line_no: number }>;
  /** F7: how many bom_lines INSERT attempts raise 23505 before one succeeds. */
  failInsertsWith23505: number;
  /** deleteBomLine renumber: throw 23505 on the flip phase when true. */
  failRenumberFlipWith23505: boolean;
  /**
   * moveBomLine: simulate the id list going stale between the ordered read and the
   * staging UPDATE (a concurrent delete removed one of the ranked rows), so phase 1
   * touches fewer rows than were ranked.
   */
  staleReorderRows: number;
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
    lines: [
      { id: LINE_A, line_no: 1 },
      { id: LINE_B, line_no: 2 },
      { id: LINE_C, line_no: 3 },
    ],
    failInsertsWith23505: 0,
    failRenumberFlipWith23505: false,
    staleReorderRows: 0,
    async query(sql, params = []) {
      client.calls.push({ sql, params });
      const n = normalizeSql(sql);

      // moveBomLine — the ordered read of the whole header (line_no asc).
      if (n.startsWith('select id, line_no from public.bom_lines')) {
        const rows = [...client.lines]
          .sort((a, b) => a.line_no - b.line_no || a.id.localeCompare(b.id))
          .map((l) => ({ ...l }));
        return { rows: rows as never[], rowCount: rows.length };
      }
      // moveBomLine — phase 1: park the whole header in the 100001.. band.
      if (n.startsWith('update public.bom_lines bl') && n.includes('unnest(')) {
        const ids = params[1] as string[];
        const ranks = params[2] as number[];
        // A stale id list matches fewer rows than were ranked — exactly what a
        // concurrent delete leaves behind.
        const matched = ids.length - client.staleReorderRows;
        ids.slice(0, matched).forEach((id, i) => {
          const row = client.lines.find((l) => l.id === id);
          if (row) row.line_no = ranks[i]! + 100000;
        });
        return { rows: [] as never[], rowCount: matched };
      }

      if (n.includes('from public.user_roles')) {
        return { rows: (client.hasPermission ? [{ ok: true }] : []) as never[], rowCount: client.hasPermission ? 1 : 0 };
      }
      if (n.startsWith('select h.id, i.item_code as product_id, h.status from public.bom_headers')) {
        return {
          rows: (client.headerStatus ? [{ id: HEADER_ID, product_id: 'FG-1', status: client.headerStatus }] : []) as never[],
          rowCount: client.headerStatus ? 1 : 0,
        };
      }
      if (n.includes('from public.bom_lines') && n.includes('id = $2::uuid') && n.startsWith('select')) {
        return {
          rows: (client.lineExists
            ? [{ id: LINE_ID, line_no: 2, component_code: 'RM-002', quantity: '1.000', uom: 'kg', scrap_pct: '1.00', manufacturing_operation_name: null }]
            : []) as never[],
          rowCount: client.lineExists ? 1 : 0,
        };
      }
      if (n.startsWith('update public.bom_lines') && n.includes('set quantity')) {
        return { rows: [] as never[], rowCount: 1 };
      }
      // The row really leaves the header — otherwise the renumber below has nothing
      // to renumber and the "anti-regression" test degenerates into SQL-substring
      // sniffing that a broken rank mapping would still pass.
      if (n.startsWith('delete from public.bom_lines')) {
        client.lines = client.lines.filter((l) => l.id !== (params[1] as string));
        return { rows: [] as never[], rowCount: 1 };
      }
      // deleteBomLine renumber phase 1: rank the SURVIVORS by (line_no asc, id asc)
      // and park each at rank + 100000 — including the `bl.line_no <> ranked.rn +
      // 100000` no-op filter the statement carries, so rowCount is the real count.
      if (n.startsWith('with ranked as')) {
        const ranked = [...client.lines].sort((a, b) => a.line_no - b.line_no || a.id.localeCompare(b.id));
        let affected = 0;
        ranked.forEach((row, index) => {
          const parked = index + 1 + 100000;
          if (row.line_no !== parked) {
            row.line_no = parked;
            affected += 1;
          }
        });
        return { rows: [] as never[], rowCount: affected };
      }
      if (n.startsWith('update public.bom_lines') && n.includes('set line_no = line_no - 100000')) {
        if (client.failRenumberFlipWith23505) {
          const err = new Error('duplicate key value violates unique constraint "bom_lines_header_line_unique"') as Error & { code: string };
          err.code = '23505';
          throw err;
        }
        let affected = 0;
        for (const l of client.lines) {
          if (l.line_no > 100000) {
            l.line_no -= 100000;
            affected += 1;
          }
        }
        return { rows: [] as never[], rowCount: affected || 2 };
      }
      if (n.startsWith('insert into public.audit_log')) {
        return { rows: [] as never[], rowCount: 1 };
      }
      // addBomLine — V-TEC-13 cycle edges over the ACTIVE BOM graph (none).
      if (n.includes('as parent') && n.includes('as component')) {
        return { rows: [] as never[], rowCount: 0 };
      }
      // addBomLine — V-TEC-14 RM usability reads (item active, no spec, no allergens).
      if (n.startsWith('select id, item_type, status, updated_at from public.items')) {
        return {
          rows: [
            {
              id: '66666666-6666-4666-8666-666666666666',
              item_type: 'rm',
              status: 'active',
              updated_at: '2026-01-01T00:00:00Z',
            },
          ] as never[],
          rowCount: 1,
        };
      }
      if (n.includes('from public.item_allergen_profiles')) {
        return { rows: [] as never[], rowCount: 0 };
      }
      if (n.includes('reference"."manufacturingoperations')) {
        const names = (params[0] as string[] | undefined) ?? [];
        const known = new Set(['Mixing', 'Packing']);
        return {
          rows: names.filter((name) => known.has(name)).map((operation_name) => ({ operation_name })) as never[],
          rowCount: names.filter((name) => known.has(name)).length,
        };
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

  it('rejects an arbitrary manufacturing operation with V-TEC-63 and performs zero writes', async () => {
    const { addBomLine } = await import('../line-actions');
    const res = await addBomLine({ ...NEW_LINE, manufacturingOperationName: 'Totally-Fake-Op' });
    expect(res).toMatchObject({
      ok: false,
      error: 'validation_failed',
      code: 'V-TEC-63',
      message: expect.stringContaining('Totally-Fake-Op'),
    });
    expect(client.calls.some((c) => normalizeSql(c.sql).startsWith('insert into public.bom_lines'))).toBe(false);
    expect(client.calls.some((c) => normalizeSql(c.sql).startsWith('insert into public.audit_log'))).toBe(false);
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
  it('persists qty as a decimal string ::numeric and patches uom/operation on a draft header', async () => {
    const { updateBomLine } = await import('../line-actions');
    const res = await updateBomLine({
      bomHeaderId: HEADER_ID,
      lineId: LINE_ID,
      qty: '2.5',
      uom: 'g',
      manufacturingOperationName: 'Packing',
    });
    expect(res).toEqual({ ok: true, data: { lineId: LINE_ID, bomHeaderId: HEADER_ID } });
    const upd = client.calls.find((c) => normalizeSql(c.sql).startsWith('update public.bom_lines') && normalizeSql(c.sql).includes('set quantity'));
    expect(upd).toBeDefined();
    // scrapPct omitted → NULL, so `coalesce($6::numeric, scrap_pct)` leaves it alone.
    expect(upd!.params).toEqual([HEADER_ID, LINE_ID, '2.5', 'g', 'Packing', null]);
  });

  it('omits the manufacturing operation column when manufacturingOperationName is undefined', async () => {
    const { updateBomLine } = await import('../line-actions');
    const res = await updateBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_ID, qty: '2.5', uom: 'g' });
    expect(res).toEqual({ ok: true, data: { lineId: LINE_ID, bomHeaderId: HEADER_ID } });
    const upd = client.calls.find((c) => normalizeSql(c.sql).startsWith('update public.bom_lines') && normalizeSql(c.sql).includes('set quantity'));
    expect(upd).toBeDefined();
    expect(normalizeSql(upd!.sql)).not.toContain('manufacturing_operation_name');
    expect(upd!.params).toEqual([HEADER_ID, LINE_ID, '2.5', 'g', null]);
  });

  it('clears manufacturingOperationName to null when an empty string is provided', async () => {
    const { updateBomLine } = await import('../line-actions');
    const res = await updateBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_ID, qty: '2.5', manufacturingOperationName: '' });
    expect(res).toEqual({ ok: true, data: { lineId: LINE_ID, bomHeaderId: HEADER_ID } });
    const upd = client.calls.find((c) => normalizeSql(c.sql).startsWith('update public.bom_lines') && normalizeSql(c.sql).includes('set quantity'));
    expect(upd).toBeDefined();
    expect(normalizeSql(upd!.sql)).toContain('manufacturing_operation_name = $5');
    expect(upd!.params[4]).toBeNull();
  });

  it('sets manufacturingOperationName when provided', async () => {
    const { updateBomLine } = await import('../line-actions');
    const res = await updateBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_ID, qty: '2.5', manufacturingOperationName: 'Mixing' });
    expect(res).toEqual({ ok: true, data: { lineId: LINE_ID, bomHeaderId: HEADER_ID } });
    const upd = client.calls.find((c) => normalizeSql(c.sql).startsWith('update public.bom_lines') && normalizeSql(c.sql).includes('set quantity'));
    expect(upd).toBeDefined();
    expect(normalizeSql(upd!.sql)).toContain('manufacturing_operation_name = $5');
    expect(upd!.params[4]).toBe('Mixing');
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

  it('rejects an arbitrary manufacturing operation with V-TEC-63 and performs zero writes', async () => {
    const { updateBomLine } = await import('../line-actions');
    const res = await updateBomLine({
      bomHeaderId: HEADER_ID,
      lineId: LINE_ID,
      qty: '2.5',
      manufacturingOperationName: 'Totally-Fake-Op',
    });
    expect(res).toMatchObject({
      ok: false,
      error: 'validation_failed',
      code: 'V-TEC-63',
      message: expect.stringContaining('Totally-Fake-Op'),
    });
    expect(client.calls.some((c) => normalizeSql(c.sql).startsWith('update public.bom_lines'))).toBe(false);
  });

  // ── PF-R06-03 — scrap % is no longer write-once ─────────────────────────────
  it('persists an edited scrapPct in the UPDATE payload AND in the audit entry', async () => {
    const { updateBomLine } = await import('../line-actions');
    const res = await updateBomLine({
      bomHeaderId: HEADER_ID,
      lineId: LINE_ID,
      qty: '2.5',
      scrapPct: 4.25,
    });
    expect(res).toMatchObject({ ok: true });

    const upd = client.calls.find(
      (c) => normalizeSql(c.sql).startsWith('update public.bom_lines') && normalizeSql(c.sql).includes('set quantity'),
    );
    expect(upd).toBeDefined();
    expect(normalizeSql(upd!.sql)).toContain('scrap_pct = coalesce($5::numeric, scrap_pct)');
    expect(upd!.params[4]).toBe(4.25);

    const audit = client.calls.find((c) => normalizeSql(c.sql).startsWith('insert into public.audit_log'));
    expect(audit).toBeDefined();
    expect(JSON.parse(audit!.params[4] as string)).toMatchObject({ scrapPct: '1.00' });
    expect(JSON.parse(audit!.params[5] as string)).toMatchObject({ scrapPct: '4.25' });
  });

  it('leaves the stored scrap_pct alone (NULL param) when scrapPct is omitted', async () => {
    const { updateBomLine } = await import('../line-actions');
    await updateBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_ID, qty: '2.5' });
    const upd = client.calls.find(
      (c) => normalizeSql(c.sql).startsWith('update public.bom_lines') && normalizeSql(c.sql).includes('set quantity'),
    );
    expect(upd!.params[4]).toBeNull();
    const audit = client.calls.find((c) => normalizeSql(c.sql).startsWith('insert into public.audit_log'));
    // Audit carries the unchanged persisted value, not a fabricated 0.
    expect(JSON.parse(audit!.params[5] as string)).toMatchObject({ scrapPct: '1.00' });
  });

  it('accepts a scrapPct of 0 (coalesce must not treat it as "unset")', async () => {
    const { updateBomLine } = await import('../line-actions');
    const res = await updateBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_ID, qty: '2.5', scrapPct: 0 });
    expect(res).toMatchObject({ ok: true });
    const upd = client.calls.find(
      (c) => normalizeSql(c.sql).startsWith('update public.bom_lines') && normalizeSql(c.sql).includes('set quantity'),
    );
    expect(upd!.params[4]).toBe(0);
  });

  // PRECISION: bom_lines.scrap_pct is numeric(5,2) — a 3rd decimal used to be
  // SILENTLY rounded (2.3456 → 2.35). It is now refused explicitly.
  it('rejects a scrapPct with more than 2 decimals as invalid_input, before any DB call', async () => {
    const { updateBomLine } = await import('../line-actions');
    const res = await updateBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_ID, qty: '2.5', scrapPct: 2.3456 });
    expect(res).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(res).toMatchObject({ message: expect.stringContaining('2 decimal places') });
    expect(client.calls.length).toBe(0);
  });

  it('accepts exactly 2 decimals — 2.35 must not be lost to float dust', async () => {
    const { updateBomLine } = await import('../line-actions');
    const res = await updateBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_ID, qty: '2.5', scrapPct: 2.35 });
    expect(res).toMatchObject({ ok: true });
  });

  it('rejects a scrapPct above 100', async () => {
    const { updateBomLine } = await import('../line-actions');
    const res = await updateBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_ID, qty: '2.5', scrapPct: 101 });
    expect(res).toMatchObject({ ok: false, error: 'invalid_input' });
  });

  // V-TEC-11 used to fire only on create — an EDIT could raise scrap past the
  // threshold with no warning at all.
  it('returns the V-TEC-11 advisory when the edit raises scrap to >= 50% (warns, never blocks)', async () => {
    const { updateBomLine } = await import('../line-actions');
    const res = await updateBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_ID, qty: '2.5', scrapPct: 55 });
    expect(res).toEqual({
      ok: true,
      data: { lineId: LINE_ID, bomHeaderId: HEADER_ID },
      warnings: ['V-TEC-11'],
    });
  });

  it('omits warnings below the V-TEC-11 threshold', async () => {
    const { updateBomLine } = await import('../line-actions');
    const res = await updateBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_ID, qty: '2.5', scrapPct: 49.99 });
    expect(res).toEqual({ ok: true, data: { lineId: LINE_ID, bomHeaderId: HEADER_ID } });
  });
});

// ── PF-R06-04 — reorder ───────────────────────────────────────────────────────
describe('moveBomLine', () => {
  /** Current dense order of the fake header, by line_no. */
  function order(): Array<[string, number]> {
    return [...client.lines]
      .sort((a, b) => a.line_no - b.line_no)
      .map((l): [string, number] => [l.id, l.line_no]);
  }

  it('moves line 3 to position 1 (two "up" steps) leaving line_no exactly 1,2,3 — no gaps, no duplicates', async () => {
    const { moveBomLine } = await import('../line-actions');

    expect(await moveBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_C, direction: 'up' })).toMatchObject({ ok: true });
    expect(order()).toEqual([
      [LINE_A, 1],
      [LINE_C, 2],
      [LINE_B, 3],
    ]);

    expect(await moveBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_C, direction: 'up' })).toMatchObject({ ok: true });
    expect(order()).toEqual([
      [LINE_C, 1],
      [LINE_A, 2],
      [LINE_B, 3],
    ]);
  });

  it('moves a line down and stays dense', async () => {
    const { moveBomLine } = await import('../line-actions');
    await moveBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_A, direction: 'down' });
    expect(order()).toEqual([
      [LINE_B, 1],
      [LINE_A, 2],
      [LINE_C, 3],
    ]);
  });

  it('renumbers via the two-phase +100000 staging pass (non-deferrable unique + CHECK line_no > 0)', async () => {
    const { moveBomLine } = await import('../line-actions');
    await moveBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_C, direction: 'up' });

    const stage = client.calls.findIndex((c) => normalizeSql(c.sql).includes('unnest($2::uuid[], $3::int[])'));
    const flip = client.calls.findIndex((c) => normalizeSql(c.sql).includes('set line_no = line_no - 100000'));
    expect(stage).toBeGreaterThan(-1);
    expect(flip).toBeGreaterThan(stage);
    expect(normalizeSql(client.calls[stage]!.sql)).toContain('set line_no = target.rn + 100000');
    // Phase 1 stages the WHOLE header, which is what makes the bands disjoint.
    expect(client.calls[stage]!.params[1]).toHaveLength(3);
    expect(client.calls[stage]!.params[2]).toEqual([1, 2, 3]);
  });

  // ── Concurrency: the ordered read is the basis of the whole permutation ───────
  it('locks the lines it ranks (FOR UPDATE) so a concurrent mutation cannot stale the list', async () => {
    const { moveBomLine } = await import('../line-actions');
    await moveBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_C, direction: 'up' });
    const read = client.calls.find((c) => normalizeSql(c.sql).startsWith('select id, line_no from public.bom_lines'));
    expect(read).toBeDefined();
    expect(normalizeSql(read!.sql)).toContain('for update');
  });

  it('refuses (persistence_failed) instead of writing a gapped sequence when phase 1 misses a ranked row', async () => {
    // A concurrent deleteBomLine removed one of the rows we ranked: the staging
    // UPDATE now matches 2 of 3 ids. Flipping anyway used to land the survivors at
    // [2,3] — dense-looking to UNIQUE and CHECK, but a hole at line_no 1 — and the
    // audit claimed a deleted line had been moved.
    install(makeClient({ staleReorderRows: 1 }));
    const { moveBomLine } = await import('../line-actions');
    const res = await moveBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_C, direction: 'up' });
    expect(res).toMatchObject({ ok: false, error: 'persistence_failed' });
    // Phase 2 and the audit never run — the throw unwinds before them.
    expect(client.calls.some((c) => normalizeSql(c.sql).includes('set line_no = line_no - 100000'))).toBe(false);
    expect(client.calls.some((c) => normalizeSql(c.sql).startsWith('insert into public.audit_log'))).toBe(false);
  });

  it('refuses with bom_not_editable on an active version and writes nothing', async () => {
    install(makeClient({ headerStatus: 'active' }));
    const { moveBomLine } = await import('../line-actions');
    const res = await moveBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_C, direction: 'up' });
    expect(res).toMatchObject({ ok: false, error: 'bom_not_editable' });
    expect(client.calls.some((c) => normalizeSql(c.sql).startsWith('update public.bom_lines'))).toBe(false);
    expect(order()).toEqual([
      [LINE_A, 1],
      [LINE_B, 2],
      [LINE_C, 3],
    ]);
  });

  it('is a no-op at the edges rather than an error', async () => {
    const { moveBomLine } = await import('../line-actions');
    const res = await moveBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_A, direction: 'up' });
    expect(res).toMatchObject({ ok: true });
    expect(client.calls.some((c) => normalizeSql(c.sql).includes('set line_no = target.rn + 100000'))).toBe(false);
    expect(order()).toEqual([
      [LINE_A, 1],
      [LINE_B, 2],
      [LINE_C, 3],
    ]);
  });

  it('returns not_found for a line outside this header', async () => {
    const { moveBomLine } = await import('../line-actions');
    const res = await moveBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_ID, direction: 'up' });
    expect(res).toEqual({ ok: false, error: 'not_found' });
  });

  it('returns forbidden without the bom.create permission', async () => {
    install(makeClient({ hasPermission: false }));
    const { moveBomLine } = await import('../line-actions');
    const res = await moveBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_C, direction: 'up' });
    expect(res).toEqual({ ok: false, error: 'forbidden' });
  });

  it('rejects an unknown direction as invalid_input before any DB call', async () => {
    const { moveBomLine } = await import('../line-actions');
    const res = await moveBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_C, direction: 'sideways' });
    expect(res).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(client.calls.length).toBe(0);
  });

  it('writes a bom.line_moved audit entry with the before/after position', async () => {
    const { moveBomLine } = await import('../line-actions');
    await moveBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_C, direction: 'up' });
    const audit = client.calls.find((c) => normalizeSql(c.sql).startsWith('insert into public.audit_log'));
    expect(audit).toBeDefined();
    expect(audit!.params[2]).toBe('bom.line_moved');
    expect(JSON.parse(audit!.params[4] as string)).toEqual({ lineId: LINE_C, lineNo: 3 });
    expect(JSON.parse(audit!.params[5] as string)).toEqual({ lineId: LINE_C, lineNo: 2, direction: 'up' });
  });
});

describe('deleteBomLine', () => {
  /** Current dense order of the fake header, by line_no. */
  function order(): Array<[string, number]> {
    return [...client.lines]
      .sort((a, b) => a.line_no - b.line_no)
      .map((l): [string, number] => [l.id, l.line_no]);
  }

  // The point of the renumber is the RESULT, not the SQL text: deleting the middle
  // row must leave exactly the survivors at line_no 1..N. Asserting only that the
  // statements contain "+ 100000" lets a broken rank mapping pass untouched.
  it('leaves the surviving lines at a dense 1..N after deleting the middle row', async () => {
    const { deleteBomLine } = await import('../line-actions');
    const res = await deleteBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_B });
    expect(res).toEqual({ ok: true, data: { lineId: LINE_B, bomHeaderId: HEADER_ID } });
    expect(order()).toEqual([
      [LINE_A, 1],
      [LINE_C, 2],
    ]);
  });

  it('renumbers to a dense 1..N after deleting the FIRST row too', async () => {
    const { deleteBomLine } = await import('../line-actions');
    expect(await deleteBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_A })).toMatchObject({ ok: true });
    expect(order()).toEqual([
      [LINE_B, 1],
      [LINE_C, 2],
    ]);
  });

  it('deletes the line then renumbers remaining lines with a two-phase positive-offset staging pass', async () => {
    const { deleteBomLine } = await import('../line-actions');
    const res = await deleteBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_B });
    expect(res).toEqual({ ok: true, data: { lineId: LINE_B, bomHeaderId: HEADER_ID } });
    // Both phases ran and every survivor moved through the 100001.. band.
    expect(order()).toEqual([
      [LINE_A, 1],
      [LINE_C, 2],
    ]);
    const del = client.calls.findIndex((c) => normalizeSql(c.sql).startsWith('delete from public.bom_lines'));
    const stage = client.calls.findIndex((c) => normalizeSql(c.sql).startsWith('with ranked as'));
    const flip = client.calls.findIndex((c) => normalizeSql(c.sql).includes('set line_no = line_no - 100000'));
    expect(del).toBeGreaterThan(-1);
    expect(stage).toBeGreaterThan(del);
    expect(flip).toBeGreaterThan(stage);
    // Phase 1 uses + 100000 offset (CHECK > 0 satisfied; disjoint from 1..N target range).
    expect(normalizeSql(client.calls[stage]!.sql)).toContain('set line_no = ranked.rn + 100000');
    // Phase 2 subtracts the offset landing rows in 1..N; guard is > 100000 not < 0.
    expect(normalizeSql(client.calls[flip]!.sql)).toContain('line_no > 100000');
  });

  it('maps a renumber 23505 unique violation to invalid_input', async () => {
    install(makeClient({ failRenumberFlipWith23505: true }));
    const { deleteBomLine } = await import('../line-actions');
    const res = await deleteBomLine({ bomHeaderId: HEADER_ID, lineId: LINE_ID });
    expect(res).toEqual({ ok: false, error: 'invalid_input' });
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
