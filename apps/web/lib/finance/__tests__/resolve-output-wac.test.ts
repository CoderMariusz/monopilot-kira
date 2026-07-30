import { describe, expect, it } from 'vitest';

import { resolveOutputWacContribution } from '../resolve-output-wac';

const WO_ID = '33333333-3333-4333-8333-333333333333';
const CONSUMPTION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMPONENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(handlers: {
  unCostedLines?: Array<{ consumption_id: string; component_id: string; qty: string; uom: string }>;
  costGate?: {
    wacValue: string;
    wacAvgCost: string;
    historyCost: string | null;
    itemCost: string | null;
  };
  materialCost?: string;
  priorWacBooked?: string;
  outputBaselineKg?: string;
  computedCostPerKg?: string | null;
  computedOutputValue?: string | null;
  standardOutputValue?: string;
}) {
  const calls: string[] = [];
  const queries: Array<{ sql: string; params: readonly unknown[] }> = [];
  return {
    calls,
    queries,
    query: async (sql: string, params: readonly unknown[] = []) => {
      const n = normalize(sql);
      calls.push(n);
      queries.push({ sql: n, params });
      if (n.includes('select c.id::text as consumption_id')) {
        if (handlers.costGate) {
          const stampOnly =
            n.includes("nullif(trim(c.ext_jsonb->>'wac_value'), '')") &&
            !n.includes('item_cost_history');
          const unCosted = stampOnly && Number(handlers.costGate.wacValue) <= 0;
          const rows = unCosted
            ? [{
                consumption_id: CONSUMPTION_ID,
                component_id: COMPONENT_ID,
                qty: '60',
                uom: 'kg',
              }]
            : [];
          return { rows, rowCount: rows.length };
        }
        return {
          rows: handlers.unCostedLines ?? [],
          rowCount: (handlers.unCostedLines ?? []).length,
        };
      }
      if (n.includes('with material_wac as')) {
        return {
          rows: [
            {
              material_cost: handlers.materialCost ?? '0',
              prior_wac_booked: handlers.priorWacBooked ?? '0',
              output_baseline_kg: handlers.outputBaselineKg ?? String(params[1] ?? '0'),
            },
          ],
          rowCount: 1,
        };
      }
      if (n.includes('select case') && n.includes('cost_per_kg')) {
        return {
          rows: [
            {
              cost_per_kg: handlers.computedCostPerKg ?? null,
              output_value: handlers.computedOutputValue ?? null,
            },
          ],
          rowCount: 1,
        };
      }
      if (n.startsWith('select ($1::numeric * $2::numeric)::text as output_value')) {
        return {
          rows: [{
            output_value:
              handlers.standardOutputValue ??
              String(Number(params[0]) * Number(params[1])),
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

describe('resolveOutputWacContribution', () => {
  it('uses WO computed material cost per kg when consumption value exists', async () => {
    const client = makeClient({
      materialCost: '500',
      outputBaselineKg: '100',
      computedCostPerKg: '5',
      computedOutputValue: '55',
    });

    const result = await resolveOutputWacContribution(client, {
      woId: WO_ID,
      qtyKg: '11',
      standardCostPerKg: '2.50',
    });

    expect(result).toEqual({
      applied: true,
      deltaQtyKg: '11',
      deltaValue: '55',
      costPerKg: '5',
      source: 'wo_computed',
    });
  });

  it('falls back to standard cost when WO has no computed material cost', async () => {
    const client = makeClient({
      materialCost: '0',
      outputBaselineKg: '11',
      standardOutputValue: '27.5',
    });

    const result = await resolveOutputWacContribution(client, {
      woId: WO_ID,
      qtyKg: '11',
      standardCostPerKg: '2.50',
    });

    expect(result).toEqual({
      applied: true,
      deltaQtyKg: '11',
      deltaValue: '27.5',
      costPerKg: '2.50',
      source: 'standard',
    });
  });

  it('reports un_costed consumption lines instead of silently understating WO cost', async () => {
    const client = makeClient({
      unCostedLines: [
        {
          consumption_id: CONSUMPTION_ID,
          component_id: COMPONENT_ID,
          qty: '5',
          uom: 'pallet',
        },
      ],
    });

    const result = await resolveOutputWacContribution(client, {
      woId: WO_ID,
      qtyKg: '11',
      standardCostPerKg: '2.50',
    });

    expect(result).toEqual({
      applied: false,
      excluded: 'un_costed',
      unCostedLines: [
        {
          consumptionId: CONSUMPTION_ID,
          componentId: COMPONENT_ID,
          qty: '5',
          uom: 'pallet',
        },
      ],
    });
  });

  it('skips WAC when neither WO computed cost nor standard cost exists', async () => {
    const client = makeClient({
      materialCost: '0',
      outputBaselineKg: '11',
    });

    const result = await resolveOutputWacContribution(client, {
      woId: WO_ID,
      qtyKg: '11',
      standardCostPerKg: null,
    });

    expect(result).toEqual({ applied: false, excluded: 'un_costed', unCostedLines: [] });
  });

  it('books only the current output share for partial forward registrations', async () => {
    const firstClient = makeClient({
      materialCost: '500',
      priorWacBooked: '0',
      outputBaselineKg: '100',
      computedCostPerKg: '5',
      computedOutputValue: '50',
    });

    const first = await resolveOutputWacContribution(firstClient, {
      woId: WO_ID,
      qtyKg: '10',
      standardCostPerKg: '2.50',
    });

    expect(first).toEqual({
      applied: true,
      deltaQtyKg: '10',
      deltaValue: '50',
      costPerKg: '5',
      source: 'wo_computed',
    });

    const secondClient = makeClient({
      materialCost: '500',
      priorWacBooked: '50',
      outputBaselineKg: '100',
      computedCostPerKg: '5',
      computedOutputValue: '450',
    });

    const second = await resolveOutputWacContribution(secondClient, {
      woId: WO_ID,
      qtyKg: '90',
      standardCostPerKg: '2.50',
    });

    expect(second).toEqual({
      applied: true,
      deltaQtyKg: '90',
      deltaValue: '450',
      costPerKg: '5',
      source: 'wo_computed',
    });
  });

  it('keeps the positive 0.666653 consumption stamp as the exact 0.666653 output value', async () => {
    const client = makeClient({
      materialCost: '0.666653',
      outputBaselineKg: '700',
      computedCostPerKg: '0.00095236142857142857',
      computedOutputValue: '0.666653',
    });

    const result = await resolveOutputWacContribution(client, {
      woId: WO_ID,
      qtyKg: '700',
      standardCostPerKg: '2.50',
    });

    expect(result).toEqual({
      applied: true,
      deltaQtyKg: '700',
      deltaValue: '0.666653',
      costPerKg: '0.00095236142857142857',
      source: 'wo_computed',
    });
    expect(client.calls.find((sql) => sql.includes('with material_wac as'))).not.toContain('material_costed');
    expect(client.queries.find(({ sql }) => sql.includes('end as output_value'))?.params).toEqual([
      '0.666653',
      '700',
      '700',
      '0',
    ]);
  });

  it('treats a zero WAC stamp as un-costed even when a catalog price exists', async () => {
    const client = makeClient({
      costGate: {
        wacValue: '0',
        wacAvgCost: '0',
        historyCost: '2.5000',
        itemCost: '7.0000',
      },
    });

    const result = await resolveOutputWacContribution(client, {
      woId: WO_ID,
      qtyKg: '60',
      standardCostPerKg: null,
    });

    expect(result).toEqual({
      applied: false,
      excluded: 'un_costed',
      unCostedLines: [{
        consumptionId: CONSUMPTION_ID,
        componentId: COMPONENT_ID,
        qty: '60',
        uom: 'kg',
      }],
    });
  });

  it('treats a missing WAC stamp as un-costed instead of silently pricing history', async () => {
    const client = makeClient({
      costGate: {
        wacValue: '',
        wacAvgCost: '',
        historyCost: '2.5000',
        itemCost: '2.5000',
      },
    });

    const result = await resolveOutputWacContribution(client, {
      woId: WO_ID,
      qtyKg: '60',
      standardCostPerKg: '1',
    });

    expect(result).toEqual({
      applied: false,
      excluded: 'un_costed',
      unCostedLines: [{
        consumptionId: CONSUMPTION_ID,
        componentId: COMPONENT_ID,
        qty: '60',
        uom: 'kg',
      }],
    });
  });
});
