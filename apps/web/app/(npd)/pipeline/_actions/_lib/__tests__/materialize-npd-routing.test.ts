import { describe, expect, it } from 'vitest';

import { materializeNpdRouting, type QueryClient } from '../materialize-npd-routing';

type QueryCall = { sql: string; params: readonly unknown[] };

type ClientOptions = {
  productionLineId?: string | null;
  itemId?: string | null;
  hasUnresolvedLine?: boolean;
  existingRoutingId?: string | null;
  existingRoutingStatus?: 'draft' | 'active' | 'approved' | null;
  existingRoutingSiteId?: string | null;
  routingDrifted?: boolean;
  expectedLineIds?: string[];
  lineSites?: Record<string, string | null>;
};

const DEFAULT_LINE = '22222222-2222-4222-8222-222222222222';
const SITE_1 = '11111111-1111-4111-8111-111111111111';

function makeClient(overrides?: ClientOptions): { client: QueryClient; calls: QueryCall[] } {
  const {
    productionLineId = DEFAULT_LINE,
    itemId = '11111111-1111-4111-8111-111111111111',
    hasUnresolvedLine = false,
    existingRoutingId = null,
    existingRoutingStatus = 'draft',
    existingRoutingSiteId = null,
    routingDrifted = false,
    expectedLineIds = [DEFAULT_LINE],
    lineSites = { [DEFAULT_LINE]: SITE_1 },
  } = overrides ?? {};
  const calls: QueryCall[] = [];
  const client: QueryClient = {
    async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []) {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });

      if (sql.includes('from public.npd_projects p') && sql.includes('left join public.items')) {
        return {
          rows: [{ item_id: itemId, production_line_id: productionLineId }],
        } as { rows: T[] };
      }
      if (sql.includes('has_unresolved')) {
        return { rows: [{ has_unresolved: hasUnresolvedLine }] } as { rows: T[] };
      }
      if (sql.includes("status = 'draft'") && sql.includes("origin_module = 'npd'")) {
        return {
          rows:
            existingRoutingId && existingRoutingStatus === 'draft'
              ? [{ id: existingRoutingId, status: 'draft', site_id: existingRoutingSiteId }]
              : [],
        } as { rows: T[] };
      }
      if (sql.includes("status in ('active', 'approved')") && sql.includes("origin_module = 'npd'")) {
        return {
          rows:
            existingRoutingId && (existingRoutingStatus === 'active' || existingRoutingStatus === 'approved')
              ? [{ id: existingRoutingId, status: existingRoutingStatus, site_id: existingRoutingSiteId }]
              : [],
        } as { rows: T[] };
      }
      if (sql.includes(') as drifted')) {
        return { rows: [{ drifted: routingDrifted }] } as { rows: T[] };
      }
      if (sql.includes('select line_id::text as line_id from expected')) {
        return {
          rows: expectedLineIds.map((line_id) => ({ line_id })),
        } as { rows: T[] };
      }
      if (sql.includes('from public.production_lines pl')) {
        const lineIds = params[0] as string[];
        return {
          rows: lineIds.map((id) => ({
            id,
            site_id: id in lineSites ? lineSites[id]! : SITE_1,
          })),
        } as { rows: T[] };
      }
      if (sql.includes('delete from public.routing_operations')) {
        return { rows: [] } as { rows: T[] };
      }
      if (sql.includes('update public.routings') && sql.includes('set site_id')) {
        return { rows: [], rowCount: 1 } as { rows: T[] };
      }
      if (sql.includes('count(*)::text as count')) return { rows: [{ count: '2' }] } as { rows: T[] };
      if (sql.includes('coalesce(max(version), 0) + 1')) return { rows: [{ next_version: 3 }] } as { rows: T[] };
      if (sql.includes('insert into public.routings')) {
        return { rows: [{ id: '33333333-3333-4333-8333-333333333333' }] } as { rows: T[] };
      }
      if (sql.includes('insert into public.routing_operations')) return { rows: [] } as { rows: T[] };

      throw new Error(`unexpected query: ${sql}`);
    },
  };
  return { client, calls };
}

describe('materializeNpdRouting', () => {
  it('materializes a draft NPD routing from a seeded process chain with crew, throughput-derived runtime, yield, setup, and per-op line fallback', async () => {
    const { client, calls } = makeClient();

    const result = await materializeNpdRouting(client, '44444444-4444-4444-8444-444444444444');

    expect(result).toEqual({ ok: true, routingId: '33333333-3333-4333-8333-333333333333' });

    const headerInsert = calls.find((call) => call.sql.includes('insert into public.routings'));
    expect(headerInsert?.sql).toContain('origin_module');
    expect(headerInsert?.sql).toContain("'npd'");
    expect(headerInsert?.params).toEqual(['11111111-1111-4111-8111-111111111111', 3, SITE_1]);

    const opInsert = calls.find((call) => call.sql.includes('insert into public.routing_operations'));
    expect(opInsert?.sql).toContain('row_number() over (order by wp.display_order asc');
    expect(opInsert?.sql).toContain('jsonb_build_object');
    expect(opInsert?.sql).toContain("'role_group'");
    expect(opInsert?.sql).toContain('coalesce(p.line_id, $3::uuid)');
    expect(opInsert?.params).toEqual([
      '44444444-4444-4444-8444-444444444444',
      '33333333-3333-4333-8333-333333333333',
      DEFAULT_LINE,
    ]);
  });

  it('returns no_line when the project has no default line and a process lacks line_id', async () => {
    const { client, calls } = makeClient({ productionLineId: null, hasUnresolvedLine: true });

    await expect(materializeNpdRouting(client, '44444444-4444-4444-8444-444444444444')).resolves.toEqual({
      ok: false,
      code: 'no_line',
    });
    expect(calls.some((call) => call.sql.includes('has_unresolved'))).toBe(true);
    expect(calls.some((call) => call.sql.includes('insert into public.routings'))).toBe(false);
  });

  it('returns cross_site_lines when expected operations mix site-assigned and org-wide lines', async () => {
    const lineA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const lineB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const { client } = makeClient({
      expectedLineIds: [lineA, lineB],
      lineSites: { [lineA]: SITE_1, [lineB]: null },
    });

    await expect(materializeNpdRouting(client, '44444444-4444-4444-8444-444444444444')).resolves.toEqual({
      ok: false,
      code: 'cross_site_lines',
    });
  });

  it('returns routing_exists when an npd routing already matches the current process chain', async () => {
    const existingId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const { client, calls } = makeClient({ existingRoutingId: existingId, routingDrifted: false });

    const result = await materializeNpdRouting(client, '44444444-4444-4444-8444-444444444444');

    expect(result).toEqual({ ok: false, code: 'routing_exists' });
    expect(calls.some((call) => call.sql.includes(') as drifted'))).toBe(true);
    expect(calls.some((call) => call.sql.includes('delete from public.routing_operations'))).toBe(false);
  });

  it('replaces routing operations in place only for a draft when process content drifted', async () => {
    const existingId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const { client, calls } = makeClient({
      existingRoutingId: existingId,
      existingRoutingStatus: 'draft',
      routingDrifted: true,
    });

    const result = await materializeNpdRouting(client, '44444444-4444-4444-8444-444444444444');

    expect(result).toEqual({ ok: true, routingId: existingId });
    expect(calls.some((call) => call.sql.includes('delete from public.routing_operations'))).toBe(true);
    expect(calls.some((call) => call.sql.includes('insert into public.routings'))).toBe(false);
  });

  it('creates a new draft version when an active routing drifted instead of mutating it', async () => {
    const activeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const { client, calls } = makeClient({
      existingRoutingId: activeId,
      existingRoutingStatus: 'active',
      existingRoutingSiteId: SITE_1,
      routingDrifted: true,
    });

    const result = await materializeNpdRouting(client, '44444444-4444-4444-8444-444444444444');

    expect(result).toEqual({ ok: true, routingId: '33333333-3333-4333-8333-333333333333' });
    expect(calls.some((call) => call.sql.includes('delete from public.routing_operations'))).toBe(false);
    expect(calls.some((call) => call.sql.includes('insert into public.routings'))).toBe(true);
    const draftLookup = calls.find((call) => call.sql.includes("status = 'draft'"));
    expect(draftLookup).toBeDefined();
    const activeLookup = calls.find((call) => call.sql.includes("status in ('active', 'approved')"));
    expect(activeLookup).toBeDefined();
  });
});
