import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getWorkOrderDetail } from './get-work-order-detail';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WO_ID = 'a0000002-0000-4000-8000-000000000002';
const WIP_WO_ID = 'a0000002-0000-4000-8000-000000000003';
const DEP_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OUTPUT_CORRECTION_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

let client: QueryClient;

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('../../../../../../lib/production/start-wo', () => ({
  findOpenLineChangeover: vi.fn(async () => null),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeHeaderRow() {
  return {
    id: WO_ID,
    wo_number: 'E2E-A-C5-FG',
    product_id: '33333333-3333-4333-8333-333333333333',
    item_code: 'FG-CHAIN',
    product_name: 'Finished good',
    status: 'planned',
    production_line_id: null,
    line_code: null,
    line_name: null,
    planned_quantity: '50',
    uom: 'kg',
    bom_version: 1,
    has_allergen: false,
    scheduled_start_time: null,
    scheduled_end_time: null,
    started_at: null,
    completed_at: null,
    output_kg: '0',
    output_pct: '0',
    weight_mode: 'fixed',
    bom_type: 'forward',
    bom_header_id: null,
    over_production_flagged: false,
    over_production_flagged_at: null,
  };
}

beforeEach(() => {
  client = {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const n = normalize(sql);

      if (n.includes('from public.user_roles')) {
        return { rows: [{ ok: true }] as never[], rowCount: 1 };
      }
      if (n.includes('from public.work_orders w') && n.includes('where w.org_id = app.current_org_id()')) {
        return { rows: [makeHeaderRow()] as never[], rowCount: 1 };
      }
      if (n.includes('from public.wo_materials m')) {
        return { rows: [] as never[], rowCount: 0 };
      }
      if (n.includes('from public.wo_outputs o')) {
        return {
          rows: [
            {
              id: OUTPUT_CORRECTION_ID,
              output_type: 'primary',
              product_id: '33333333-3333-4333-8333-333333333333',
              product_code: 'FG-CHAIN',
              product_name: 'Finished good',
              batch_number: 'E2E-VOID-correction',
              qty_kg: '-0.95',
              uom: 'kg',
              qa_status: 'PENDING',
              lp_id: null,
              lp_number: null,
              expiry_date: null,
              correction_of_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
              is_corrected: false,
            },
          ] as never[],
          rowCount: 1,
        };
      }
      if (n.includes('from public.wo_dependencies d')) {
        expect(params).toEqual([WO_ID]);
        return {
          rows: [
            {
              id: DEP_ID,
              direction: 'upstream',
              related_wo_id: WIP_WO_ID,
              related_wo_number: 'E2E-A-C5-WIP',
              related_item_code: 'WIP-CHAIN',
              related_product_name: 'WIP intermediate',
              required_qty: '50.000',
              material_link: 'wip_output',
            },
          ] as never[],
          rowCount: 1,
        };
      }
      return { rows: [] as never[], rowCount: 0 };
    }),
  };
});

describe('getWorkOrderDetail', () => {
  it('marks LP-less pending output corrections as not QA-actionable (C091)', async () => {
    const result = await getWorkOrderDetail(WO_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');

    expect(result.data.outputs).toHaveLength(1);
    expect(result.data.outputs[0]).toEqual(
      expect.objectContaining({
        id: OUTPUT_CORRECTION_ID,
        lpId: null,
        qaActionsAvailable: false,
        qaStatus: 'PASSED',
      }),
    );
  });

  it('returns dependency rows with linked WO number and product identity (C093)', async () => {
    const result = await getWorkOrderDetail(WO_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');

    expect(result.data.dependencies).toEqual([
      {
        id: DEP_ID,
        direction: 'upstream',
        relatedWoId: WIP_WO_ID,
        relatedWoNumber: 'E2E-A-C5-WIP',
        relatedItemCode: 'WIP-CHAIN',
        relatedProductName: 'WIP intermediate',
        requiredQty: '50.000',
        materialLink: 'wip_output',
      },
    ]);

    const depSql = (client.query as ReturnType<typeof vi.fn>).mock.calls
      .map(([sql]) => normalize(String(sql)))
      .find((sql) => sql.includes('from public.wo_dependencies d'));
    expect(depSql).toContain('rw.wo_number');
    expect(depSql).toContain('ri.item_code');
  });
});
