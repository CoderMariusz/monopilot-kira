import { describe, expect, it } from 'vitest';

import { materializeNpdRouting, type QueryClient } from '../materialize-npd-routing';

type QueryCall = { sql: string; params: readonly unknown[] };

function makeClient(): { client: QueryClient; calls: QueryCall[] } {
  const calls: QueryCall[] = [];
  const client: QueryClient = {
    async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []) {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });

      if (sql.includes('from public.npd_projects p') && sql.includes('left join public.items')) {
        return {
          rows: [{ item_id: '11111111-1111-4111-8111-111111111111', production_line_id: '22222222-2222-4222-8222-222222222222' }],
        } as { rows: T[] };
      }
      if (sql.includes("origin_module = 'npd'")) return { rows: [] } as { rows: T[] };
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
  it('materializes a draft NPD routing from a seeded process chain with crew, throughput-derived runtime, and yield', async () => {
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
    expect(opInsert?.sql).toContain('round(3600::numeric / p.throughput_per_hour, 2)');
    expect(opInsert?.sql).toContain('coalesce(p.yield_pct, 100)');
    expect(opInsert?.params).toEqual([
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
      '22222222-2222-4222-8222-222222222222',
    ]);
  });

  it('returns no_line before creating anything when the NPD project has no production line', async () => {
    const calls: QueryCall[] = [];
    const client: QueryClient = {
      async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []) {
        calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
        return {
          rows: [{ item_id: '11111111-1111-4111-8111-111111111111', production_line_id: null }],
        } as { rows: T[] };
      },
    };

    await expect(materializeNpdRouting(client, '44444444-4444-4444-8444-444444444444')).resolves.toEqual({
      ok: false,
      code: 'no_line',
    });
    expect(calls).toHaveLength(1);
  });
});
