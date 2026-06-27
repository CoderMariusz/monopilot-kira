import { describe, expect, it } from 'vitest';

import { materializeNpdBom } from '../materialize-npd-bom';
import { type QueryClient } from '../../shared';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const ORG = '33333333-3333-4333-8333-333333333333';
const ITEM = '44444444-4444-4444-8444-444444444444';
const BOM = '55555555-5555-4555-8555-555555555555';
const SPEC = '66666666-6666-4666-8666-666666666666';

type Call = { sql: string; params: readonly unknown[] };

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function createClient(handler: (sql: string, params: readonly unknown[]) => unknown[]): QueryClient & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    async query(sql: string, params: readonly unknown[] = []) {
      calls.push({ sql, params });
      return { rows: handler(normalize(sql), params) as never[] };
    },
  };
}

function projectRow() {
  return {
    id: PROJECT,
    code: 'NPD-001',
    name: 'Sliced Ham',
    type: 'standard',
    current_gate: 'G4',
    current_stage: 'handoff',
    product_code: 'FG-001',
    pack_weight_g: '200.000',
  };
}

function ctx(client: QueryClient) {
  return { userId: USER, orgId: ORG, client };
}

function createBomMaterializationClient(targetYieldPct: string | null) {
  return createClient((sql) => {
    if (sql.startsWith('select id, code, name, type, current_gate')) return [projectRow()];
    if (sql.startsWith('select id from public.items where org_id')) return [];
    if (sql.startsWith('select f.id as formulation_id')) {
      return [{ formulation_id: 'form-1', version_id: 'ver-1', version_number: 3, target_yield_pct: targetYieldPct }];
    }
    if (sql.startsWith('select rm_code,')) {
      return [{ rm_code: 'RM-001', item_id: null, qty_kg: '1.250000', sequence: 1 }];
    }
    if (sql.startsWith('insert into public.items')) {
      return [{ id: ITEM, item_code: 'FG-001', name: 'Sliced Ham', shelf_life_days: 30 }];
    }
    if (sql.startsWith('select 1 from public.product')) return [];
    if (sql.startsWith('insert into public.product')) return [];
    if (sql.startsWith('update public.formulations')) return [];
    if (sql.startsWith('select id, wo_reference, status')) return [];
    if (sql.startsWith('update public.product')) return [];
    if (sql.startsWith('select h.id, h.version')) return [];
    if (sql.startsWith('select coalesce(max(version)')) return [{ next_version: 1 }];
    if (sql.startsWith('insert into public.bom_headers')) return [{ id: BOM, version: 1 }];
    if (sql.startsWith('insert into public.bom_lines')) return [];
    if (sql.startsWith('select pc.component_name')) return [];
    if (sql.startsWith('update public.bom_headers')) return [];
    if (sql.startsWith('select id from public.factory_specs')) return [];
    if (sql.startsWith('insert into public.factory_specs')) return [{ id: SPEC }];
    throw new Error(`Unhandled SQL: ${sql}`);
  });
}

describe('materializeNpdBom', () => {
  it('creates the missing FG item, product, active NPD BOM lines, and approved factory spec', async () => {
    const client = createClient((sql) => {
      if (sql.startsWith('select id, code, name, type, current_gate')) return [projectRow()];
      if (sql.startsWith('select f.id as formulation_id')) {
        return [{ formulation_id: 'form-1', version_id: 'ver-1', version_number: 3, target_yield_pct: '98.500' }];
      }
      if (sql.startsWith('select rm_code,')) {
        return [
          { rm_code: 'RM-001', item_id: null, qty_kg: '1.250000', sequence: 1 },
          { rm_code: 'RM-002', item_id: ITEM, qty_kg: '0.750000', sequence: 2 },
        ];
      }
      if (sql.startsWith('insert into public.items')) {
        return [{ id: ITEM, item_code: 'FG-001', name: 'Sliced Ham', shelf_life_days: 30 }];
      }
      if (sql.startsWith('select 1 from public.product')) return [];
      if (sql.startsWith('insert into public.product')) return [];
      if (sql.startsWith('update public.formulations')) return [];
      if (sql.startsWith('select id, wo_reference, status')) return [{ id: '77777777-7777-4777-8777-777777777777', wo_reference: 'WO-1', status: 'completed' }];
      if (sql.startsWith('update public.product')) return [];
      if (sql.startsWith('select h.id, h.version')) return [];
      if (sql.startsWith('select coalesce(max(version)')) return [{ next_version: 1 }];
      if (sql.startsWith('insert into public.bom_headers')) return [{ id: BOM, version: 1 }];
      if (sql.startsWith('insert into public.bom_lines')) return [];
      if (sql.startsWith('update public.bom_headers')) return [];
      if (sql.startsWith('select id from public.factory_specs')) return [];
      if (sql.startsWith('insert into public.factory_specs')) return [{ id: SPEC }];
      // allergen cascade recompute over the materialized BOM (no parents in fixture)
      if (sql.startsWith('select id from public.items where org_id')) return [];
      if (sql.startsWith('select pc.component_name')) return [];
      if (sql.startsWith('with recursive parents as')) return [];
      throw new Error(`Unhandled SQL: ${sql}`);
    });

    const result = await materializeNpdBom(ctx(client), { projectId: PROJECT });

    expect(result).toEqual({
      projectId: PROJECT,
      productCode: 'FG-001',
      productionCode: 'FG-001',
      itemId: ITEM,
      bomHeaderId: BOM,
      factorySpecId: SPEC,
      yieldPromptRequired: false,
      createdBom: true,
      createdFactorySpec: true,
    });
    expect(client.calls.filter((call) => normalize(call.sql).startsWith('insert into public.bom_lines'))).toHaveLength(2);
    expect(client.calls.some((call) => normalize(call.sql).startsWith('update public.bom_headers'))).toBe(true);
    expect(client.calls.some((call) => normalize(call.sql).startsWith('insert into public.factory_specs'))).toBe(true);
  });

  it.each([
    { targetYieldPct: '0', expectedYieldPct: '100' },
    { targetYieldPct: null, expectedYieldPct: '100' },
    { targetYieldPct: '75', expectedYieldPct: '75' },
    { targetYieldPct: '110', expectedYieldPct: '100' },
  ])(
    'normalizes target_yield_pct $targetYieldPct to bom_headers.yield_pct $expectedYieldPct',
    async ({ targetYieldPct, expectedYieldPct }) => {
      const client = createBomMaterializationClient(targetYieldPct);

      const result = await materializeNpdBom(ctx(client), { projectId: PROJECT });

      expect(result.bomHeaderId).toBe(BOM);
      const insert = client.calls.find((call) => normalize(call.sql).startsWith('insert into public.bom_headers'));
      expect(insert?.params[3]).toBe(expectedYieldPct);
    },
  );

  it('is idempotent when the FG item, active NPD BOM, and approved factory spec already exist', async () => {
    const client = createClient((sql) => {
      if (sql.startsWith('select id, code, name, type, current_gate')) return [projectRow()];
      if (sql.startsWith('select f.id as formulation_id')) {
        return [{ formulation_id: 'form-1', version_id: 'ver-1', version_number: 3, target_yield_pct: '98.500' }];
      }
      if (sql.startsWith('select rm_code,')) {
        return [{ rm_code: 'RM-001', item_id: null, qty_kg: '1.250000', sequence: 1 }];
      }
      if (sql.startsWith('insert into public.items')) return [];
      if (sql.startsWith('select id, item_code, name, shelf_life_days')) {
        return [{ id: ITEM, item_code: 'FG-001', name: 'Sliced Ham', shelf_life_days: 45 }];
      }
      if (sql.startsWith('select 1 from public.product')) return [];
      if (sql.startsWith('insert into public.product')) return [];
      if (sql.startsWith('update public.formulations')) return [];
      if (sql.startsWith('select id, wo_reference, status')) return [];
      if (sql.startsWith('update public.product')) return [];
      if (sql.startsWith('select id from public.items where org_id')) return [];
      if (sql.startsWith('select h.id, h.version')) return [{ id: BOM, version: 2 }];
      if (sql.startsWith('select id from public.factory_specs')) return [{ id: SPEC }];
      throw new Error(`Unhandled SQL: ${sql}`);
    });

    const result = await materializeNpdBom(ctx(client), { projectId: PROJECT });

    expect(result).toMatchObject({
      bomHeaderId: BOM,
      factorySpecId: SPEC,
      createdBom: false,
      createdFactorySpec: false,
    });
    expect(client.calls.some((call) => normalize(call.sql).startsWith('insert into public.bom_headers'))).toBe(false);
    expect(client.calls.some((call) => normalize(call.sql).startsWith('insert into public.bom_lines'))).toBe(false);
    expect(client.calls.some((call) => normalize(call.sql).startsWith('insert into public.factory_specs'))).toBe(false);
  });
});
