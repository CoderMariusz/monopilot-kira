/**
 * PF-R06-07 (server half) — listRoutingItems must return the SITE identity of
 * every production line.
 *
 * The picker used to load `id, code, name` for every active line in the org.
 * Line codes repeat across plants (LINE01 exists in every site), so the operator
 * could not tell which physical plant owned a line — and the list offered lines
 * that V-TEC-64 then rejected on save.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SITE_1 = '33333333-3333-4333-8333-333333333333';

type QueryCall = { sql: string; params: readonly unknown[] };

const runWithOrgContext = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => runWithOrgContext(action)),
}));
vi.mock('../shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shared')>();
  return { ...actual, hasPermission: vi.fn(async () => true) };
});

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient() {
  const calls: QueryCall[] = [];
  const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
    calls.push({ sql, params });
    const n = normalizeSql(sql);
    if (n.includes('from public.items')) {
      return { rows: [{ id: 'item-1', item_code: 'FG-1', name: 'Sausage' }], rowCount: 1 };
    }
    if (n.includes('from public.production_lines')) {
      return {
        rows: [
          // Same code in two plants — the exact ambiguity the audit reported.
          { id: 'l1', code: 'LINE01', name: 'Packing', site_id: SITE_1, site_code: 'WAW', site_name: 'Warsaw Plant' },
          { id: 'l2', code: 'LINE01', name: 'Packing', site_id: 'site-2', site_code: 'KRK', site_name: 'Krakow Plant' },
          // Org-wide line: no site. Must survive the join (LEFT, never INNER).
          { id: 'l3', code: 'LINE09', name: 'Shared', site_id: null, site_code: null, site_name: null },
        ],
        rowCount: 3,
      };
    }
    if (n.includes('"reference"."manufacturingoperations"')) {
      return { rows: [{ operation_name: 'Cutting' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
  return { calls, query };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('PF-R06-07 — listRoutingItems line options carry site identity', () => {
  it('returns siteId / siteCode / siteName for every line', async () => {
    const client = makeClient();
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );

    const { listRoutingItems } = await import('../list-routing-items');
    const result = await listRoutingItems();

    expect(result.state).toBe('ready');
    expect(result.lines).toEqual([
      { id: 'l1', code: 'LINE01', name: 'Packing', siteId: SITE_1, siteCode: 'WAW', siteName: 'Warsaw Plant' },
      { id: 'l2', code: 'LINE01', name: 'Packing', siteId: 'site-2', siteCode: 'KRK', siteName: 'Krakow Plant' },
      { id: 'l3', code: 'LINE09', name: 'Shared', siteId: null, siteCode: null, siteName: null },
    ]);
  });

  it('resolves the site with a LEFT join so org-wide lines are not dropped', async () => {
    const client = makeClient();
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );

    const { listRoutingItems } = await import('../list-routing-items');
    await listRoutingItems();

    const linesQuery = client.calls.find((c) => normalizeSql(c.sql).includes('from public.production_lines'));
    expect(linesQuery).toBeDefined();
    const sql = normalizeSql(linesQuery!.sql);
    expect(sql).toContain('left join public.sites');
    expect(sql).not.toContain('inner join public.sites');
    // still org-scoped + active-only
    expect(sql).toContain('pl.org_id = app.current_org_id()');
    expect(sql).toContain("pl.status = 'active'");
  });

  // R-8 — the picker is narrowed to the routing's site by the edit modal, so a
  // global cap applied BEFORE that narrowing truncated the wrong end: an org
  // whose alphabetically earlier sites filled the first 200 rows left a routing
  // pinned to a later site with an empty line picker and no way to edit it.
  it('does not cap the line list — a site whose lines fall past the cap loses its whole picker', async () => {
    const client = makeClient();
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );

    const { listRoutingItems } = await import('../list-routing-items');
    await listRoutingItems();

    const linesQuery = client.calls.find((c) => normalizeSql(c.sql).includes('from public.production_lines'));
    expect(linesQuery).toBeDefined();
    expect(normalizeSql(linesQuery!.sql)).not.toContain('limit');
    expect(linesQuery!.params ?? []).toHaveLength(0);
  });
});
