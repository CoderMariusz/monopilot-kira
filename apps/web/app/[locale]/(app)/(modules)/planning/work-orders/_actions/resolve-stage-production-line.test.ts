import { describe, expect, it, vi } from 'vitest';

import { loadStageProductionLineIds } from './resolve-stage-production-line';
import type { OrgActionContext } from './shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const FG_ITEM_ID = '44444444-4444-4444-8444-444444444444';
const SITE_ID = '88888888-8888-4888-8888-888888888888';
const WIP_ITEM_A = '55555555-5555-4555-8555-555555555555';
const WIP_ITEM_B = '66666666-6666-4666-8666-666666666666';
const WIP_ITEM_C = '77777777-7777-4777-8777-777777777777';
const LINE_ROUTING = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LINE_WIP_ITEM = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const LINE_WIP_DEF = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LINE_FG_PROCESS = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const LINE_PROJECT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeCtx(query: OrgActionContext['client']['query']): OrgActionContext {
  return { userId: USER_ID, orgId: ORG_ID, client: { query } };
}

describe('loadStageProductionLineIds SQL', () => {
  it('joins all three process resolution paths with FG last-op ordering', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await loadStageProductionLineIds(makeCtx(query), FG_ITEM_ID, SITE_ID, [
      { itemId: WIP_ITEM_A, isFg: false },
      { itemId: FG_ITEM_ID, isFg: true },
    ]);

    const sql = normalizeSql(String(query.mock.calls[0]?.[0] ?? ''));
    expect(sql).toContain('wp.wip_item_id = s.item_id');
    expect(sql).toContain('wd.item_id = s.item_id');
    expect(sql).toContain('pd.item_id = s.item_id');
    expect(sql).toContain('wip_item_line.line_id');
    expect(sql).toContain('wip_def_line.line_id');
    expect(sql).toContain('fg_process_line.line_id');
    expect(sql).toContain('ro.op_no * case when s.is_fg then -1 else 1 end');
    expect(sql).toContain('wp.display_order desc, wp.created_at desc, wp.id desc');
    expect(sql).toContain('not s.is_fg');
    expect(sql).toContain('and s.is_fg');
    expect(sql).toContain('pl_site.site_id = $4::uuid');
  });
});

describe('loadStageProductionLineIds query behavior', () => {
  it('resolves WIP child via npd_wip_processes.wip_item_id (first op)', async () => {
    const query = vi.fn(async (sql: string, params: readonly unknown[]) => {
      expect(normalizeSql(sql)).toContain('wp.wip_item_id = s.item_id');
      expect(params).toEqual([[WIP_ITEM_A], [false], FG_ITEM_ID, SITE_ID]);
      return { rows: [{ item_id: WIP_ITEM_A, production_line_id: LINE_WIP_ITEM }] };
    });

    const lines = await loadStageProductionLineIds(makeCtx(query), FG_ITEM_ID, SITE_ID, [
      { itemId: WIP_ITEM_A, isFg: false },
    ]);

    expect(lines.get(WIP_ITEM_A)).toBe(LINE_WIP_ITEM);
  });

  it('resolves WIP child via wip_definitions.item_id when wip_item_id path is empty', async () => {
    const query = vi.fn(async (sql: string, params: readonly unknown[]) => {
      expect(normalizeSql(sql)).toContain('wd.item_id = s.item_id');
      expect(params).toEqual([[WIP_ITEM_B], [false], FG_ITEM_ID, SITE_ID]);
      return { rows: [{ item_id: WIP_ITEM_B, production_line_id: LINE_WIP_DEF }] };
    });

    const lines = await loadStageProductionLineIds(makeCtx(query), FG_ITEM_ID, SITE_ID, [
      { itemId: WIP_ITEM_B, isFg: false },
    ]);

    expect(lines.get(WIP_ITEM_B)).toBe(LINE_WIP_DEF);
  });

  it('resolves FG root via prod_detail/npd_wip_processes chain (last op)', async () => {
    const query = vi.fn(async (sql: string, params: readonly unknown[]) => {
      expect(normalizeSql(sql)).toContain('pd.item_id = s.item_id');
      expect(normalizeSql(sql)).toContain('wp.display_order desc, wp.created_at desc, wp.id desc');
      expect(params).toEqual([[FG_ITEM_ID], [true], FG_ITEM_ID, SITE_ID]);
      return { rows: [{ item_id: FG_ITEM_ID, production_line_id: LINE_FG_PROCESS }] };
    });

    const lines = await loadStageProductionLineIds(makeCtx(query), FG_ITEM_ID, SITE_ID, [
      { itemId: FG_ITEM_ID, isFg: true },
    ]);

    expect(lines.get(FG_ITEM_ID)).toBe(LINE_FG_PROCESS);
  });

  it('falls back to project default for FG when routing and process paths miss', async () => {
    const query = vi.fn(async (sql: string, params: readonly unknown[]) => {
      expect(normalizeSql(sql)).toContain('project_line.production_line_id');
      expect(params).toEqual([[FG_ITEM_ID], [true], FG_ITEM_ID, SITE_ID]);
      return { rows: [{ item_id: FG_ITEM_ID, production_line_id: LINE_PROJECT }] };
    });

    const lines = await loadStageProductionLineIds(makeCtx(query), FG_ITEM_ID, SITE_ID, [
      { itemId: FG_ITEM_ID, isFg: true },
    ]);

    expect(lines.get(FG_ITEM_ID)).toBe(LINE_PROJECT);
  });

  it('maps representative rows for all three join paths in one batch', async () => {
    const query = vi.fn(async (sql: string, params: readonly unknown[]) => {
      const normalized = normalizeSql(sql);
      expect(normalized).toContain('wp.wip_item_id = s.item_id');
      expect(normalized).toContain('wd.item_id = s.item_id');
      expect(normalized).toContain('pd.item_id = s.item_id');
      expect(params).toEqual([[WIP_ITEM_A, WIP_ITEM_C, FG_ITEM_ID], [false, false, true], FG_ITEM_ID, SITE_ID]);
      return {
        rows: [
          { item_id: WIP_ITEM_A, production_line_id: LINE_WIP_ITEM },
          { item_id: WIP_ITEM_C, production_line_id: LINE_WIP_DEF },
          { item_id: FG_ITEM_ID, production_line_id: LINE_FG_PROCESS },
        ],
      };
    });

    const lines = await loadStageProductionLineIds(makeCtx(query), FG_ITEM_ID, SITE_ID, [
      { itemId: WIP_ITEM_A, isFg: false },
      { itemId: WIP_ITEM_C, isFg: false },
      { itemId: FG_ITEM_ID, isFg: true },
    ]);

    expect(lines.get(WIP_ITEM_A)).toBe(LINE_WIP_ITEM);
    expect(lines.get(WIP_ITEM_C)).toBe(LINE_WIP_DEF);
    expect(lines.get(FG_ITEM_ID)).toBe(LINE_FG_PROCESS);
  });

  it('prefers routing line over process and project fallbacks', async () => {
    const query = vi.fn(async (sql: string, params: readonly unknown[]) => {
      expect(normalizeSql(sql)).toContain('routing_line.line_id');
      expect(params).toEqual([[WIP_ITEM_A, FG_ITEM_ID], [false, true], FG_ITEM_ID, SITE_ID]);
      return {
        rows: [
          { item_id: WIP_ITEM_A, production_line_id: LINE_ROUTING },
          { item_id: FG_ITEM_ID, production_line_id: LINE_ROUTING },
        ],
      };
    });

    const lines = await loadStageProductionLineIds(makeCtx(query), FG_ITEM_ID, SITE_ID, [
      { itemId: WIP_ITEM_A, isFg: false },
      { itemId: FG_ITEM_ID, isFg: true },
    ]);

    expect(lines.get(WIP_ITEM_A)).toBe(LINE_ROUTING);
    expect(lines.get(FG_ITEM_ID)).toBe(LINE_ROUTING);
  });
});
