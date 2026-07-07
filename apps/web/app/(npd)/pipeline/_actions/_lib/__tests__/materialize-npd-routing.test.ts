import { describe, expect, it } from 'vitest';

import { materializeNpdRouting, type QueryClient } from '../materialize-npd-routing';

type QueryCall = { sql: string; params: readonly unknown[] };

type ClientOptions = {
  productionLineId?: string | null;
  itemId?: string | null;
  hasUnresolvedLine?: boolean;
  existingRoutingId?: string | null;
  routingDrifted?: boolean;
};

function makeClient(overrides?: ClientOptions): { client: QueryClient; calls: QueryCall[] } {
  const {
    productionLineId = '22222222-2222-4222-8222-222222222222',
    itemId = '11111111-1111-4111-8111-111111111111',
    hasUnresolvedLine = false,
    existingRoutingId = null,
    routingDrifted = false,
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
      if (sql.includes("origin_module = 'npd'")) {
        return {
          rows: existingRoutingId ? [{ id: existingRoutingId }] : [],
        } as { rows: T[] };
      }
      if (sql.includes(') as drifted')) {
        return { rows: [{ drifted: routingDrifted }] } as { rows: T[] };
      }
      if (sql.includes('delete from public.routing_operations')) {
        return { rows: [] } as { rows: T[] };
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
    expect(headerInsert?.params).toEqual(['11111111-1111-4111-8111-111111111111', 3]);

    const opInsert = calls.find((call) => call.sql.includes('insert into public.routing_operations'));
    expect(opInsert?.sql).toContain('row_number() over (order by wp.display_order asc');
    expect(opInsert?.sql).toContain('jsonb_build_object');
    expect(opInsert?.sql).toContain("'role_group'");
    expect(opInsert?.sql).toContain('coalesce(p.line_id, $3::uuid)');
    expect(opInsert?.sql).toContain('greatest(0, round(coalesce(p.duration_hours, 0) * 60))::integer');
    expect(opInsert?.sql).toContain('nullif(p.setup_cost, 0)');
    expect(opInsert?.sql).toContain('round(3600::numeric / p.throughput_per_hour, 2)');
    expect(opInsert?.sql).toContain('coalesce(p.yield_pct, 100)');
    expect(opInsert?.params).toEqual([
      '44444444-4444-4444-8444-444444444444',
      '33333333-3333-4333-8333-333333333333',
      '22222222-2222-4222-8222-222222222222',
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

  it('succeeds when every process has line_id even if the project has no default line', async () => {
    const { client, calls } = makeClient({ productionLineId: null, hasUnresolvedLine: false });

    const result = await materializeNpdRouting(client, '44444444-4444-4444-8444-444444444444');

    expect(result).toEqual({ ok: true, routingId: '33333333-3333-4333-8333-333333333333' });
    const opInsert = calls.find((call) => call.sql.includes('insert into public.routing_operations'));
    expect(opInsert?.sql).toContain('coalesce(p.line_id, $3::uuid)');
    expect(opInsert?.params[2]).toBeNull();
  });

  it('falls back to the project production line when a process line_id is null', async () => {
    const { client, calls } = makeClient({ productionLineId: '22222222-2222-4222-8222-222222222222' });

    await materializeNpdRouting(client, '44444444-4444-4444-8444-444444444444');

    const opInsert = calls.find((call) => call.sql.includes('insert into public.routing_operations'));
    expect(opInsert?.sql).toContain('coalesce(p.line_id, $3::uuid)');
    expect(opInsert?.params[2]).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('returns routing_exists when an npd routing already matches the current process chain', async () => {
    const existingId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const { client, calls } = makeClient({ existingRoutingId: existingId, routingDrifted: false });

    const result = await materializeNpdRouting(client, '44444444-4444-4444-8444-444444444444');

    expect(result).toEqual({ ok: false, code: 'routing_exists' });
    expect(calls.some((call) => call.sql.includes(') as drifted'))).toBe(true);
    expect(calls.some((call) => call.sql.includes('delete from public.routing_operations'))).toBe(false);
    expect(calls.some((call) => call.sql.includes('insert into public.routing_operations'))).toBe(false);
  });

  it('replaces routing operations in place when process content drifted since the last materialize', async () => {
    const existingId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const { client, calls } = makeClient({ existingRoutingId: existingId, routingDrifted: true });

    const result = await materializeNpdRouting(client, '44444444-4444-4444-8444-444444444444');

    expect(result).toEqual({ ok: true, routingId: existingId });
    expect(calls.some((call) => call.sql.includes('delete from public.routing_operations'))).toBe(true);
    const opInsert = calls.find((call) => call.sql.includes('insert into public.routing_operations'));
    expect(opInsert?.params).toEqual([
      '44444444-4444-4444-8444-444444444444',
      existingId,
      '22222222-2222-4222-8222-222222222222',
    ]);
    expect(calls.some((call) => call.sql.includes('insert into public.routings'))).toBe(false);
  });
});
