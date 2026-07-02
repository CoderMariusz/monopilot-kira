import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * listPlatformAuditPage reader contract (R-C1 fix, item 1 + 3):
 *   - no count(*) total — windows by fetching PLATFORM_AUDIT_PAGE_SIZE + 1 rows
 *   - hasNext = fetched rows.length > pageSize (extra row is trimmed off)
 *   - page clamped to >= 1
 *   - page size is the constant only (no widenable caller parameter)
 *   - newest-first ORDER BY with the stable (pa.id) tiebreaker
 *   - assertPlatformAdmin runs before any query
 */

const USER_ID = '11111111-1111-4111-8111-111111111111';

type QueryCall = { sql: string; params: readonly unknown[] };

const state = vi.hoisted(() => ({
  ownerCalls: [] as QueryCall[],
  // Rows the mocked owner pool returns for the audit SELECT.
  auditRows: [] as Record<string, unknown>[],
  assertCalled: 0,
  assertBeforeQuery: false,
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Build n synthetic audit rows (id 1..n), newest occurred_at first. */
function makeRows(n: number): Record<string, unknown>[] {
  return Array.from({ length: n }, (_v, i) => ({
    id: String(i + 1),
    occurred_at: `2026-07-02T00:00:${String(i).padStart(2, '0')}.000Z`,
    actor_email: `a${i}@x.test`,
    action: 'platform.admin.added',
    target_slug: null,
    target_id: null,
    reason: null,
    metadata: null,
  }));
}

vi.mock('../auth/supabase-server', () => ({
  getCachedUser: vi.fn(async () => ({ data: { user: { id: USER_ID } }, error: null })),
}));

vi.mock('../auth/with-org-context', () => ({
  getOwnerPool: vi.fn(() => ({
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      state.ownerCalls.push({ sql, params });
      const text = normalize(sql);
      if (text.startsWith('select') && text.includes('from app.platform_audit')) {
        return { rows: state.auditRows, rowCount: state.auditRows.length };
      }
      return { rows: [], rowCount: 0 };
    }),
  })),
}));

vi.mock('./platform-context', () => ({
  assertPlatformAdmin: vi.fn(async () => {
    state.assertCalled += 1;
    // No owner query may run before the guard resolves.
    state.assertBeforeQuery = state.ownerCalls.length === 0;
  }),
}));

beforeEach(() => {
  state.ownerCalls = [];
  state.auditRows = [];
  state.assertCalled = 0;
  state.assertBeforeQuery = false;
  vi.clearAllMocks();
});

describe('listPlatformAuditPage', () => {
  it('exposes a fixed page size of 50', async () => {
    const { PLATFORM_AUDIT_PAGE_SIZE } = await import('./queries');
    expect(PLATFORM_AUDIT_PAGE_SIZE).toBe(50);
  });

  it('asserts platform admin before running any query', async () => {
    const { listPlatformAuditPage } = await import('./queries');
    await listPlatformAuditPage(1);
    expect(state.assertCalled).toBe(1);
    expect(state.assertBeforeQuery).toBe(true);
  });

  it('fetches pageSize + 1 rows (limit 51) at the page offset', async () => {
    const { listPlatformAuditPage } = await import('./queries');
    state.auditRows = makeRows(10);
    await listPlatformAuditPage(3);

    const auditCall = state.ownerCalls.find((c) => normalize(c.sql).includes('from app.platform_audit'));
    expect(auditCall).toBeDefined();
    // limit = pageSize + 1, offset = (page - 1) * pageSize.
    expect(auditCall?.params).toEqual([51, 100]);
  });

  it('never emits a count(*) total query', async () => {
    const { listPlatformAuditPage } = await import('./queries');
    await listPlatformAuditPage(1);
    expect(state.ownerCalls.some((c) => normalize(c.sql).includes('count(*)'))).toBe(false);
  });

  it('orders newest-first with the stable id tiebreaker', async () => {
    const { listPlatformAuditPage } = await import('./queries');
    await listPlatformAuditPage(1);
    const auditCall = state.ownerCalls.find((c) => normalize(c.sql).includes('from app.platform_audit'));
    expect(normalize(auditCall?.sql ?? '')).toContain('order by pa.occurred_at desc, pa.id desc');
  });

  it('sets hasNext=true and trims the extra row when a full+1 page is returned', async () => {
    const { listPlatformAuditPage } = await import('./queries');
    state.auditRows = makeRows(51); // pageSize + 1
    const result = await listPlatformAuditPage(1);

    expect(result.hasNext).toBe(true);
    expect(result.entries).toHaveLength(50);
    expect(result.page).toBe(1);
    // The trimmed row is the 51st (id 51) — last kept entry is id 50.
    expect(result.entries.at(-1)?.id).toBe('pa-50');
    // Contract no longer carries total / totalPages / pageSize.
    expect(result).not.toHaveProperty('total');
    expect(result).not.toHaveProperty('totalPages');
    expect(result).not.toHaveProperty('pageSize');
  });

  it('sets hasNext=false when exactly pageSize rows are returned', async () => {
    const { listPlatformAuditPage } = await import('./queries');
    state.auditRows = makeRows(50);
    const result = await listPlatformAuditPage(1);

    expect(result.hasNext).toBe(false);
    expect(result.entries).toHaveLength(50);
  });

  it('sets hasNext=false and returns the partial page when fewer than pageSize rows exist', async () => {
    const { listPlatformAuditPage } = await import('./queries');
    state.auditRows = makeRows(7);
    const result = await listPlatformAuditPage(1);

    expect(result.hasNext).toBe(false);
    expect(result.entries).toHaveLength(7);
  });

  it('clamps a page below 1 to page 1 (offset 0)', async () => {
    const { listPlatformAuditPage } = await import('./queries');
    const result = await listPlatformAuditPage(0);

    expect(result.page).toBe(1);
    const auditCall = state.ownerCalls.find((c) => normalize(c.sql).includes('from app.platform_audit'));
    expect(auditCall?.params).toEqual([51, 0]);
  });

  it('clamps a negative page to page 1', async () => {
    const { listPlatformAuditPage } = await import('./queries');
    const result = await listPlatformAuditPage(-9);
    expect(result.page).toBe(1);
  });
});
