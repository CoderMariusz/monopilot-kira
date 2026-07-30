import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductionActionError, type OrgContextLike, type QueryClient } from '../../shared';
import { registerOutput } from '../register-output';

const upsertWacMock = vi.hoisted(() => vi.fn());

vi.mock('../../../finance/upsert-wac', () => ({
  upsertWac: upsertWacMock,
}));

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SITE_ID = '22222222-2222-4222-8222-222222222223';
const WO_ID = '33333333-3333-4333-8333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-8444-444444444444';
const PARENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PARENT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OUTPUT_LP_ID = '99999999-9999-4999-8999-999999999999';
const OUTPUT_LP_ID_2 = '99999999-9999-4999-8999-999999999998';
const TX_ID = '55555555-5555-4555-8555-555555555555';
const TX_ID_2 = '55555555-5555-4555-8555-555555555556';

const BY_PRODUCT_ID = '55555555-5555-4555-8555-555555555555';
type ParentNet = { lp_id: string; net_qty: string; uom: string };
type ConsumptionRow = { lp_id: string; qty: string; uom: string };
type OutputRow = {
  id: string;
  lp_id?: string;
  qty_kg: string;
  uom?: string;
  correction_of_id: string | null;
};
type GenealogyEdge = { parent_lp_id: string; child_lp_id: string; qty: string; uom: string };

let client: QueryClient;
let consumptionRows: ConsumptionRow[];
let outputRows: OutputRow[];
let genealogyEdges: GenealogyEdge[];
let createdLpCounter: number;
let queryCalls: Array<{ sql: string; params: readonly unknown[] }>;

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').toLowerCase();
}

function parentNetRowsFromConsumption(): ParentNet[] {
  const byLp = new Map<string, { qty: number; uoms: Set<string> }>();
  for (const row of consumptionRows) {
    const entry = byLp.get(row.lp_id) ?? { qty: 0, uoms: new Set<string>() };
    entry.qty += Number(row.qty);
    entry.uoms.add(row.uom);
    byLp.set(row.lp_id, entry);
  }
  return [...byLp.entries()]
    .filter(([, entry]) => entry.qty > 0)
    .map(([lp_id, entry]) => ({
      lp_id,
      net_qty: entry.qty.toFixed(3),
      uom: [...entry.uoms].sort()[0]!,
    }));
}

function mixedUomParents(): Array<{ lp_id: string; uoms: string[] }> {
  const byLp = new Map<string, Set<string>>();
  for (const row of consumptionRows) {
    const uoms = byLp.get(row.lp_id) ?? new Set<string>();
    uoms.add(row.uom);
    byLp.set(row.lp_id, uoms);
  }
  return [...byLp.entries()]
    .filter(([, uoms]) => uoms.size > 1)
    .map(([lp_id, uoms]) => ({ lp_id, uoms: [...uoms].sort() }));
}

function makeCtx(): OrgContextLike {
  return { userId: USER_ID, orgId: ORG_ID, siteId: SITE_ID, client };
}

function reconcileGenealogy(): Array<{
  lp_id: string | null;
  consumption_uoms: string[] | null;
  output_uoms: string[] | null;
}> {
  const parentNetRows = parentNetRowsFromConsumption();
  const activeOutputs = outputRows
    .filter(
      (row) =>
        row.lp_id &&
        row.correction_of_id === null &&
        !outputRows.some((correction) => correction.correction_of_id === row.id),
    );
  const mixed = mixedUomParents()[0];
  const outputUoms = [...new Set(activeOutputs.map((row) => row.uom ?? 'kg'))].sort();
  const parentUomMismatch = parentNetRows.find(
    (parent) => outputUoms.length !== 1 || parent.uom !== outputUoms[0],
  );
  if (mixed || parentUomMismatch) {
    const parent = mixed ?? parentUomMismatch!;
    return [{
      lp_id: parent.lp_id,
      consumption_uoms: mixed?.uoms ?? [parentUomMismatch!.uom],
      output_uoms: outputUoms,
    }];
  }

  const totalOutput = activeOutputs.reduce((sum, row) => sum + Number(row.qty_kg), 0);
  const desired: GenealogyEdge[] = activeOutputs.flatMap((output) =>
    parentNetRows.map((parent) => ({
      child_lp_id: output.lp_id!,
      parent_lp_id: parent.lp_id,
      qty: Math.min(
        (Number(parent.net_qty) * Number(output.qty_kg)) / totalOutput,
        ['kg', 'g', 'lb'].includes(parent.uom) ? Number(output.qty_kg) : Number(parent.net_qty),
      ).toFixed(3),
      uom: parent.uom,
    })),
  );
  const activeChildIds = new Set(activeOutputs.map((output) => output.lp_id!));
  genealogyEdges = [
    ...genealogyEdges.filter(
      (edge) =>
        !activeChildIds.has(edge.child_lp_id) ||
        desired.some(
          (candidate) =>
            candidate.child_lp_id === edge.child_lp_id &&
            candidate.parent_lp_id === edge.parent_lp_id,
        ),
    ),
  ];
  for (const edge of desired) {
    const existing = genealogyEdges.find(
      (candidate) =>
        candidate.child_lp_id === edge.child_lp_id &&
        candidate.parent_lp_id === edge.parent_lp_id,
    );
    if (existing) Object.assign(existing, edge);
    else genealogyEdges.push(edge);
  }
  return [{ lp_id: null, consumption_uoms: null, output_uoms: null }];
}

function makeClient(): QueryClient {
  queryCalls = [];
  return {
    query: async (sql: string, params: readonly unknown[] = []) => {
      queryCalls.push({ sql, params });
      const n = normalize(sql);
      if (n.includes('allowed_products')) return { rows: [{ allowed: true }], rowCount: 1 };
      if (n.includes('from public.work_orders') && n.includes('wo_number')) {
        return {
          rows: [{ id: WO_ID, wo_number: 'WO-001', site_id: SITE_ID, uom: 'kg', uom_snapshot: null }],
          rowCount: 1,
        };
      }
      if (n.includes('from public.user_roles')) return { rows: [{ ok: true }], rowCount: 1 };
      if (n.includes('from public.items')) {
        const productId = String(params[0] ?? PRODUCT_ID);
        return {
          rows: [
            {
              id: productId,
              weight_mode: 'fixed',
              shelf_life_days: null,
              nominal_weight: null,
              variance_tolerance_pct: null,
              cost_per_kg: '2.500000',
            },
          ],
          rowCount: 1,
        };
      }
      if (n.includes('from public.wo_executions')) return { rows: [{ status: 'in_progress' }], rowCount: 1 };
      if (n.includes('pg_advisory_xact_lock') && n.includes('genealogy')) {
        return { rows: [{ pg_advisory_xact_lock: true }], rowCount: 1 };
      }
      if (n.includes('count(*)::text as seq')) return { rows: [{ seq: String(outputRows.length) }], rowCount: 1 };
      if (n.includes('with cfg as')) {
        return {
          rows: [
            {
              expected_input_kg: null,
              posted_consumption_kg: '0',
              effective_yield_pct: '100',
              block_pct: '0',
              warn: false,
              block: false,
            },
          ],
          rowCount: 1,
        };
      }
      if (n.includes('with material_wac as')) {
        return {
          rows: [{ material_cost: '10', prior_wac_booked: '0', output_baseline_kg: String(params[1] ?? '0') }],
          rowCount: 1,
        };
      }
      if (n.includes('with parent_net as') && n.includes('insert into public.lp_genealogy')) {
        const rows = reconcileGenealogy();
        return { rows, rowCount: rows.length };
      }
      if (n.startsWith('insert into public.wo_outputs')) {
        const qty = String(params[6] ?? '0');
        outputRows.push({
          id: `output-${outputRows.length + 1}`,
          qty_kg: qty,
          uom: String(params[7] ?? 'kg'),
          correction_of_id: null,
        });
        return {
          rows: [{ id: '66666666-6666-4666-8666-666666666666', lp_id: null, expiry_date: null }],
          rowCount: 1,
        };
      }
      if (n.includes('from public.warehouses')) {
        return {
          rows: [
            {
              id: '77777777-7777-4777-8777-777777777777',
              default_location_id: '88888888-8888-4888-8888-888888888888',
            },
          ],
          rowCount: 1,
        };
      }
      if (n.startsWith('insert into public.license_plates')) {
        createdLpCounter += 1;
        const lpId = createdLpCounter === 1 ? OUTPUT_LP_ID : OUTPUT_LP_ID_2;
        return { rows: [{ id: lpId }], rowCount: 1 };
      }
      if (n.includes('from public.license_plates') && n.includes('site_id')) {
        return {
          rows: [{ site_id: SITE_ID, location_id: '88888888-8888-4888-8888-888888888888' }],
          rowCount: 1,
        };
      }
      if (n.startsWith('insert into public.lp_genealogy')) {
        genealogyEdges.push({
          child_lp_id: String(params[0]),
          parent_lp_id: String(params[1]),
          qty: String(params[2]),
          uom: String(params[3]),
        });
        return { rows: [], rowCount: 1 };
      }
      if (n.startsWith('insert into public.stock_moves')) return { rows: [], rowCount: 1 };
      if (n.startsWith('insert into public.lp_state_history')) return { rows: [], rowCount: 1 };
      if (n.startsWith('update public.wo_outputs') && n.includes('set lp_id')) {
        const output = [...outputRows].reverse().find((row) => !row.lp_id);
        if (output) output.lp_id = String(params[1]);
        return { rows: [], rowCount: 1 };
      }
      if (n.startsWith('update public.wo_outputs')) return { rows: [], rowCount: 1 };
      if (n.startsWith('insert into public.outbox_events')) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  };
}

describe('registerOutput — genealogy net consumed qty (Wave 9 Bug 2)', () => {
  beforeEach(() => {
    consumptionRows = [
      { lp_id: PARENT_A, qty: '60.000', uom: 'kg' },
      { lp_id: PARENT_B, qty: '40.000', uom: 'kg' },
    ];
    outputRows = [];
    genealogyEdges = [];
    createdLpCounter = 0;
    client = makeClient();
    upsertWacMock.mockReset();
    upsertWacMock.mockResolvedValue(undefined);
  });

  it('writes per-parent genealogy qty from net consumed, not the full output qty', async () => {
    await registerOutput(makeCtx(), WO_ID, {
      transaction_id: TX_ID,
      output_type: 'primary',
      product_id: PRODUCT_ID,
      qty_kg: '100.000',
    });

    expect(genealogyEdges).toHaveLength(2);
    expect(genealogyEdges).toEqual(
      expect.arrayContaining([
        { child_lp_id: OUTPUT_LP_ID, parent_lp_id: PARENT_A, qty: '60.000', uom: 'kg' },
        { child_lp_id: OUTPUT_LP_ID, parent_lp_id: PARENT_B, qty: '40.000', uom: 'kg' },
      ]),
    );
  });

  it('excludes parents whose consumption was fully reversed (net <= 0)', async () => {
    consumptionRows = [{ lp_id: PARENT_B, qty: '40.000', uom: 'kg' }];
    genealogyEdges = [{
      child_lp_id: OUTPUT_LP_ID,
      parent_lp_id: PARENT_A,
      qty: '60.000',
      uom: 'kg',
    }];

    await registerOutput(makeCtx(), WO_ID, {
      transaction_id: TX_ID,
      output_type: 'primary',
      product_id: PRODUCT_ID,
      qty_kg: '40.000',
    });

    expect(genealogyEdges).toEqual([
      { child_lp_id: OUTPUT_LP_ID, parent_lp_id: PARENT_B, qty: '40.000', uom: 'kg' },
    ]);
  });

  it('allocates parent net consumption across two outputs without double-counting', async () => {
    consumptionRows = [{ lp_id: PARENT_A, qty: '100.000', uom: 'kg' }];

    await registerOutput(makeCtx(), WO_ID, {
      transaction_id: TX_ID,
      output_type: 'primary',
      product_id: PRODUCT_ID,
      qty_kg: '50.000',
    });
    await registerOutput(makeCtx(), WO_ID, {
      transaction_id: TX_ID_2,
      output_type: 'primary',
      product_id: PRODUCT_ID,
      qty_kg: '50.000',
    });

    const parentEdges = genealogyEdges.filter((edge) => edge.parent_lp_id === PARENT_A);
    expect(parentEdges).toHaveLength(2);
    expect(parentEdges.map((edge) => edge.qty)).toEqual(['50.000', '50.000']);
    const summed = parentEdges.reduce((sum, edge) => sum + Number(edge.qty), 0);
    expect(summed).toBe(100);
    expect(parentEdges.every((edge) => edge.uom === 'kg')).toBe(true);
  });

  it('excludes a corrected output from the denominator while retaining an ordinary output', async () => {
    consumptionRows = [{ lp_id: PARENT_A, qty: '100.000', uom: 'kg' }];
    outputRows = [
      { id: 'corrected-output', qty_kg: '100.000', correction_of_id: null },
      { id: 'void-output', qty_kg: '-100.000', correction_of_id: 'corrected-output' },
    ];

    await registerOutput(makeCtx(), WO_ID, {
      transaction_id: TX_ID,
      output_type: 'primary',
      product_id: PRODUCT_ID,
      qty_kg: '100.000',
    });
    expect(genealogyEdges.at(-1)?.qty).toBe('100.000');

    outputRows = [{
      id: 'ordinary-output',
      lp_id: OUTPUT_LP_ID_2,
      qty_kg: '100.000',
      correction_of_id: null,
    }];
    genealogyEdges = [];
    await registerOutput(makeCtx(), WO_ID, {
      transaction_id: TX_ID_2,
      output_type: 'primary',
      product_id: PRODUCT_ID,
      qty_kg: '100.000',
    });
    expect(genealogyEdges.at(-1)?.qty).toBe('50.000');
  });

  it('acquires a WO-level genealogy advisory lock before allocation', async () => {
    await registerOutput(makeCtx(), WO_ID, {
      transaction_id: TX_ID,
      output_type: 'primary',
      product_id: PRODUCT_ID,
      qty_kg: '10.000',
    });

    const lockCall = queryCalls.find(
      (call) => normalize(call.sql).includes('pg_advisory_xact_lock') && normalize(call.sql).includes('genealogy'),
    );
    expect(lockCall?.params).toEqual([WO_ID]);
  });

  it('rejects mixed parent-consumption UoM before writing genealogy', async () => {
    consumptionRows = [
      { lp_id: PARENT_A, qty: '30.000', uom: 'kg' },
      { lp_id: PARENT_A, qty: '20.000', uom: 'lb' },
    ];

    await expect(
      registerOutput(makeCtx(), WO_ID, {
        transaction_id: TX_ID,
        output_type: 'primary',
        product_id: PRODUCT_ID,
        qty_kg: '10.000',
      }),
    ).rejects.toMatchObject({
      name: 'ProductionActionError',
      code: 'uom_mismatch',
      details: expect.objectContaining({ lp_id: PARENT_A, uoms: ['kg', 'lb'] }),
    } satisfies Partial<ProductionActionError>);

    expect(genealogyEdges).toHaveLength(0);
  });

  it('caps parent attribution across different output types to remaining net consumption', async () => {
    consumptionRows = [{ lp_id: PARENT_A, qty: '50.000', uom: 'kg' }];

    await registerOutput(makeCtx(), WO_ID, {
      transaction_id: TX_ID,
      output_type: 'primary',
      product_id: PRODUCT_ID,
      qty_kg: '30.000',
    });
    await registerOutput(makeCtx(), WO_ID, {
      transaction_id: TX_ID_2,
      output_type: 'by_product',
      product_id: BY_PRODUCT_ID,
      qty_kg: '70.000',
    });

    const parentEdges = genealogyEdges.filter((edge) => edge.parent_lp_id === PARENT_A);
    expect(parentEdges).toHaveLength(2);
    const summed = parentEdges.reduce((sum, edge) => sum + Number(edge.qty), 0);
    expect(summed).toBe(50);
  });
});
