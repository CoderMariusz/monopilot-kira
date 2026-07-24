import { beforeEach, describe, expect, it, vi } from 'vitest';

const projectId = '07100000-0000-4000-8000-000000000001';

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

const { calls, client } = vi.hoisted(() => {
  const queryCalls: Array<{ sql: string; params: readonly unknown[] }> = [];
  return {
    calls: queryCalls,
    client: {
      async query<T = Record<string, unknown>>(
        sql: string,
        params: readonly unknown[] = [],
      ): Promise<{ rows: T[] }> {
        queryCalls.push({ sql, params });
        const query = sql.replace(/\s+/g, ' ').trim().toLowerCase();
        let rows: unknown[] = [];
        if (query.includes('from public.npd_projects')) {
          rows = [{ product_code: 'FG-001', product_name: 'Flour loaf' }];
        } else if (
          query.includes('from public.technical_sensory_evaluations')
          && !query.includes('voided_at is null')
        ) {
          rows = [{
            id: 'sensory-voided-1',
            status: 'pass',
            panel_date: '2026-07-01',
            panelist_count: 3,
            benchmark_product_code: null,
            overall_score: '8.50',
          }];
        }
        return { rows: rows as T[] };
      },
    },
  };
});

vi.mock('../../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async (action: (ctx: unknown) => Promise<unknown>) =>
    action({
      orgId: '07100000-0000-4000-8000-0000000000aa',
      userId: '07100000-0000-4000-8000-0000000000bb',
      client,
    }),
}));

vi.mock('../../../../../../../../../lib/auth/has-permission', () => ({
  hasPermission: async () => true,
}));

const { getSensoryPanel } = await import('../getSensoryPanel');

beforeEach(() => {
  calls.length = 0;
});

describe('getSensoryPanel', () => {
  it('returns empty for a voided panel and resolves project subjects through npd_project_id', async () => {
    const result = await getSensoryPanel(projectId);

    expect(result).toEqual({ state: 'empty', data: null });
    const panelRead = calls.find((call) =>
      normalize(call.sql).includes('from public.technical_sensory_evaluations'),
    );
    expect(normalize(panelRead?.sql ?? '')).toContain('voided_at is null');
    expect(normalize(panelRead?.sql ?? '')).toContain('npd_project_id = $2::uuid');
    expect(panelRead?.params).toEqual(['FG-001', projectId]);
  });
});
