import { describe, expect, it } from 'vitest';

import {
  computeBomLineQty,
  deriveFgOutputUom,
  materializeNpdBom,
  NpdBomActivationValidationError,
} from '../materialize-npd-bom';
import { type QueryClient } from '../../shared';

const FG_BOM_RELEASED_EVENT = 'fg.bom.released';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const ORG = '33333333-3333-4333-8333-333333333333';
const ITEM = '44444444-4444-4444-8444-444444444444';
const BOM = '55555555-5555-4555-8555-555555555555';
const SPEC = '66666666-6666-4666-8666-666666666666';
const PM_ITEM = '77777777-7777-4777-8777-777777777777';
const PM_SUB = '88888888-8888-4888-8888-888888888888';
const WIP_DEF = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WIP_ITEM = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const WIP_PROCESS = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const WIP_PROCESS_2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const NON_WIP_PROCESS = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const RM_FLOUR = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const RM_SALT = '99999999-9999-4999-8999-999999999999';

type Call = { sql: string; params: readonly unknown[] };

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function isIngredientQuery(sql: string): boolean {
  return normalize(sql).startsWith('select fi.rm_code,');
}

/** C045 — RM-usability classifier item lookup (by item_code or id). */
function isRmUsabilityItemLookup(sql: string): boolean {
  const n = normalize(sql);
  return (
    n.startsWith('select id, item_type, status, updated_at from public.items') &&
    (n.includes('and item_code = $1') || n.includes('and id = $1::uuid'))
  );
}

const RM_USABILITY_ITEM_CODE_BY_ID: Record<string, string> = {
  [ITEM]: 'FG-001',
  [RM_FLOUR]: 'RM-FLOUR',
  [RM_SALT]: 'RM-SALT',
  [PM_ITEM]: 'BOX',
  [PM_SUB]: 'PM-SUB',
  [WIP_ITEM]: 'WIP-DOUGH',
};

function rmUsabilityItemTypeForCode(code: string): string {
  if (code.startsWith('WIP-')) return 'intermediate';
  if (code.startsWith('FG-')) return 'fg';
  if (code === 'BOX' || code.startsWith('PM-')) return 'pm';
  return 'rm';
}

function rmUsabilityIdForCode(code: string): string {
  const byCode: Record<string, string> = {
    'FG-001': ITEM,
    'RM-FLOUR': RM_FLOUR,
    'RM-SALT': RM_SALT,
    'RM-001': RM_FLOUR,
    'RM-002': ITEM,
    'RM-PORK': RM_FLOUR,
    BOX: PM_ITEM,
    'WIP-DOUGH': WIP_ITEM,
    'WIP-MIX': WIP_ITEM,
    'WIP-INACTIVE': WIP_ITEM,
  };
  return byCode[code] ?? RM_FLOUR;
}

/** Sensible active item row for validateBomLineRmUsability / resolveSupplierSourcingRequired. */
function resolveRmUsabilityItemRow(sql: string, params: readonly unknown[]): unknown[] {
  const key = String(params[0] ?? '');
  const byId = normalize(sql).includes('and id = $1::uuid');
  const code = byId ? (RM_USABILITY_ITEM_CODE_BY_ID[key] ?? key) : key;
  const id = byId ? key : rmUsabilityIdForCode(code);
  return [{
    id,
    item_type: rmUsabilityItemTypeForCode(code),
    status: 'active',
    updated_at: new Date().toISOString(),
  }];
}

function matchRmUsabilityItemLookup(sql: string, params: readonly unknown[]): unknown[] | null {
  if (!isRmUsabilityItemLookup(sql)) return null;
  return resolveRmUsabilityItemRow(sql, params);
}

/** Default rows for canonical BOM activation guards (cycle, RM usability, outbox, audit). */
function bomActivationGuardDefaults(
  sql: string,
  params: readonly unknown[],
  getLastBomVersion: () => number,
): unknown[] | null {
  const rmUsabilityRow = matchRmUsabilityItemLookup(sql, params);
  if (rmUsabilityRow) return rmUsabilityRow;

  // resolveSupplierSourcingRequired positive-source probes only (not loadWipDefinitionByItem).
  if (sql.startsWith('select true as ok') && sql.includes('from public.wip_definitions') && sql.includes('item_id = $1::uuid')) {
    return [];
  }
  if (sql.startsWith('select true as ok') && sql.includes('from public.bom_headers') && sql.includes('item_id = $1::uuid')) {
    return [];
  }
  if (sql.startsWith('select true as ok') && sql.includes('from public.routings') && sql.includes('item_id = $1::uuid')) {
    return [];
  }
  if (sql.includes("ext_jsonb->>'supply_mode'") || sql.includes("ext_jsonb->>'make_buy'")) {
    return [{ explicit_make: false }];
  }

  if (sql.includes("h.status = 'active' and h.item_id is not null")) return [];
  if (sql.startsWith('select distinct allergen_code') && sql.includes("presence = 'free_from'")) return [];
  if (sql.startsWith('select id, status, updated_at from public.items')) {
    return [{ id: params[0] ?? RM_FLOUR, status: 'active', updated_at: new Date().toISOString() }];
  }
  if (sql.startsWith('select supplier_code, supplier_status')) {
    return [{
      supplier_code: 'SUP-1',
      supplier_status: 'approved',
      lifecycle_status: 'active',
      review_status: 'approved',
      effective_from: '2020-01-01',
      expiry_date: '2030-01-01',
      cost_review_blocked: false,
      spec_review_blocked: false,
      updated_at: new Date().toISOString(),
    }];
  }
  if (sql.startsWith('select allergen_code, intensity from public.item_allergen_profiles')) return [];
  if (sql.startsWith('select id, status, product_id, version from public.bom_headers')) {
    return [{
      id: params[0] ?? BOM,
      status: 'technical_approved',
      product_id: 'FG-001',
      version: getLastBomVersion(),
    }];
  }
  if (sql.includes("set status = 'technical_approved'")) return [{ version: getLastBomVersion() }];
  if (sql.includes("set status = 'active'") && sql.includes("status = 'technical_approved'")) {
    return [{ version: getLastBomVersion() }];
  }
  if (sql.includes("set status = 'superseded'") && sql.includes("status = 'active'")) return [];
  if (sql.startsWith('insert into public.outbox_events')) return [];
  if (sql.startsWith('insert into public.audit_log')) return [];
  return null;
}

function createClient(
  handler: (sql: string, params: readonly unknown[]) => unknown[],
  options?: { hasProcessAssignments?: boolean; crossOrgPoisonInProcessAssignments?: boolean },
): QueryClient & { calls: Call[]; lastBomVersion: number } {
  const calls: Call[] = [];
  let lastBomVersion = 1;
  return {
    calls,
    get lastBomVersion() {
      return lastBomVersion;
    },
    async query(sql: string, params: readonly unknown[] = []) {
      calls.push({ sql, params });
      const normalized = normalize(sql);
      if (normalized.includes('has_assignments')) {
        const orgScoped = normalized.includes('f.org_id = app.current_org_id()');
        if (!orgScoped && options?.crossOrgPoisonInProcessAssignments) {
          return { rows: [{ has_assignments: true }] as never[] };
        }
        return { rows: [{ has_assignments: options?.hasProcessAssignments ?? false }] as never[] };
      }
      const guardFallback = bomActivationGuardDefaults(normalized, params, () => lastBomVersion);
      if (guardFallback) return { rows: guardFallback as never[] };
      try {
        const rows = handler(normalized, params) as never[];
        if (normalized.startsWith('insert into public.bom_headers') && rows[0]?.version != null) {
          lastBomVersion = Number(rows[0].version);
        }
        return { rows };
      } catch (error) {
        if (!(error instanceof Error && error.message.startsWith('Unhandled SQL'))) {
          throw error;
        }
        if (normalized.includes('group by wp.wip_definition_id')) {
          return { rows: [] as never[] };
        }
        if (normalized.includes('group by wp.id, wp.wip_definition_id')) {
          return { rows: [] as never[] };
        }
        throw error;
      }
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
    packs_per_case: 4,
  };
}

function ctx(client: QueryClient) {
  return { userId: USER, orgId: ORG, client };
}

function createBomMaterializationClient(targetYieldPct: string | null) {
  return createClient((sql, params) => {
    const rmUsabilityRow = matchRmUsabilityItemLookup(sql, params);
    if (rmUsabilityRow) return rmUsabilityRow;

    if (sql.startsWith('select id, code, name, type, current_gate')) return [projectRow()];
    if (sql.startsWith('select id from public.items where org_id')) return [];
    if (sql.startsWith('select f.id as formulation_id')) {
      return [{ formulation_id: 'form-1', version_id: 'ver-1', version_number: 3, target_yield_pct: targetYieldPct }];
    }
    if (isIngredientQuery(sql)) {
      return [{ rm_code: 'RM-001', item_id: null, qty_kg: '1.250000', sequence: 1 }];
    }
    if (sql.startsWith('insert into public.items')) {
      return [{ id: ITEM, item_code: 'FG-001', name: 'Sliced Ham', shelf_life_days: 30 }];
    }
    if (sql.startsWith('update public.items')) return [];
    if (sql.startsWith('select 1 from public.product')) return [];
    if (sql.startsWith('insert into public.product')) return [];
    if (sql.startsWith('update public.formulations')) return [];
    if (sql.startsWith('select id, wo_reference, status')) return [];
    if (sql.startsWith('update public.product')) return [];
    if (sql.startsWith('select h.id, h.version')) return [];
    if (sql.startsWith('select coalesce(i.item_code, pc.component_name)')) return [];
    if (sql.startsWith('select pd.id::text as prod_detail_id')) return [];
    if (sql.startsWith('select coalesce(max(version)')) return [{ next_version: 1 }];
    if (sql.startsWith('insert into public.bom_headers')) return [{ id: BOM, version: 1 }];
    if (sql.startsWith('insert into public.bom_lines')) return [];
    if (sql.startsWith('select coalesce(i.item_code, pc.component_name)')) return [];
    if (sql.startsWith('update public.bom_headers')) return [];
    if (sql.startsWith('select id, bom_header_id from public.factory_specs')) return [];
    if (sql.startsWith('insert into public.factory_specs')) return [{ id: SPEC }];
    throw new Error(`Unhandled SQL: ${sql}`);
  });
}

describe('deriveFgOutputUom', () => {
  it.each([
  { output_unit: 'kg' as const, pack_weight_g: '200', packs_per_case: 4, expected: 'base' },
  { output_unit: 'pieces' as const, pack_weight_g: '200', packs_per_case: 4, expected: 'each' },
  { output_unit: 'boxes' as const, pack_weight_g: '200', packs_per_case: 4, expected: 'box' },
  { output_unit: 'boxes' as const, pack_weight_g: null, packs_per_case: 4, expected: 'base' },
  { output_unit: 'boxes' as const, pack_weight_g: '200', packs_per_case: 0, expected: 'each' },
  { output_unit: null, pack_weight_g: null, packs_per_case: null, expected: 'base' },
  { output_unit: null, pack_weight_g: '200', packs_per_case: 0, expected: 'each' },
  { output_unit: null, pack_weight_g: '200', packs_per_case: 4, expected: 'box' },
  ])('maps $output_unit / inferred pack fields to $expected', ({ output_unit, pack_weight_g, packs_per_case, expected }) => {
    expect(deriveFgOutputUom({ output_unit, pack_weight_g, packs_per_case })).toBe(expected);
  });
});

describe('computeBomLineQty', () => {
  it('multiplies per-pack qty by packs-per-box', () => {
    expect(computeBomLineQty(1.25, 4)).toBeCloseTo(5, 6);
  });
  it('1 pack per box is identity', () => {
    expect(computeBomLineQty(0.5, 1)).toBeCloseTo(0.5, 6);
  });
  it('yield loss inflates real consumption', () => {
    expect(computeBomLineQty(1, 2, 50)).toBeCloseTo(4, 6); // 2 / 0.5
  });
  it('compounds process yields across own and downstream processes', () => {
    expect(computeBomLineQty(0.3, 12, 95 * 0.95)).toBeCloseTo(3.98892, 6);
  });
  it('100% yield is a no-op', () => {
    expect(computeBomLineQty(1, 2, 100)).toBeCloseTo(2, 6);
  });
  it('out-of-range yield falls back to no-op', () => {
    expect(computeBomLineQty(1, 2, 0)).toBeCloseTo(2, 6);
    expect(computeBomLineQty(1, 2, 150)).toBeCloseTo(2, 6);
  });
});

describe('materializeNpdBom', () => {
  it('creates the missing FG item, product, active NPD BOM lines, and approved factory spec', async () => {
    const client = createClient((sql, params) => {
      const rmUsabilityRow = matchRmUsabilityItemLookup(sql, params);
      if (rmUsabilityRow) return rmUsabilityRow;

      if (sql.startsWith('select id, code, name, type, current_gate')) return [projectRow()];
      if (sql.startsWith('select f.id as formulation_id')) {
        return [{ formulation_id: 'form-1', version_id: 'ver-1', version_number: 3, target_yield_pct: '98.500' }];
      }
      if (isIngredientQuery(sql)) {
        return [
          { rm_code: 'RM-001', item_id: null, qty_kg: '1.250000', sequence: 1 },
          { rm_code: 'RM-002', item_id: ITEM, qty_kg: '0.750000', sequence: 2 },
        ];
      }
      if (sql.startsWith('insert into public.items')) {
        return [{ id: ITEM, item_code: 'FG-001', name: 'Sliced Ham', shelf_life_days: 30 }];
      }
      if (sql.startsWith('update public.items')) return [];
      if (sql.startsWith('select 1 from public.product')) return [];
      if (sql.startsWith('insert into public.product')) return [];
      if (sql.startsWith('update public.formulations')) return [];
      if (sql.startsWith('select id, wo_reference, status')) return [{ id: '77777777-7777-4777-8777-777777777777', wo_reference: 'WO-1', status: 'completed' }];
      if (sql.startsWith('update public.product')) return [];
      if (sql.startsWith('select h.id, h.version')) return [];
      if (sql.startsWith('select id, version from public.bom_headers')) return [];
      if (sql.startsWith('select coalesce(i.item_code, pc.component_name)')) return [];
      if (sql.startsWith('select pd.id::text as prod_detail_id')) return [];
      if (sql.startsWith('select coalesce(max(version)')) return [{ next_version: 1 }];
      if (sql.startsWith('insert into public.bom_headers')) return [{ id: BOM, version: 1 }];
      if (sql.startsWith('insert into public.bom_lines')) return [];
      if (sql.startsWith('update public.bom_headers')) return [];
      if (sql.startsWith('select id, bom_header_id from public.factory_specs')) return [];
      if (sql.startsWith('insert into public.factory_specs')) return [{ id: SPEC }];
      // allergen cascade recompute over the materialized BOM (no parents in fixture)
      if (sql.startsWith('select id from public.items where org_id')) return [];
      if (sql.startsWith('select coalesce(i.item_code, pc.component_name)')) return [];
      if (sql.startsWith('with recursive parents as')) return [];
      if (sql.startsWith('update public.factory_specs')) return [];
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
    const bomLineInserts = client.calls.filter((c) => normalize(c.sql).startsWith('insert into public.bom_lines'));
    expect(bomLineInserts[0]?.params[6]).toBe('5.000000');
    const bomHeaderInsert = client.calls.find((c) => normalize(c.sql).startsWith('insert into public.bom_headers'));
    expect(bomHeaderInsert?.sql).toContain('per_box');
    const itemsInsert = client.calls.find((c) => normalize(c.sql).startsWith('insert into public.items'));
    expect(itemsInsert?.params).toContain(4);
    expect(client.calls.some((call) => normalize(call.sql).startsWith('update public.bom_headers'))).toBe(true);
    expect(client.calls.some((call) => normalize(call.sql).startsWith('insert into public.factory_specs'))).toBe(true);
  });

  it('uses explicit output_unit on FG insert instead of legacy inference', async () => {
    const client = createClient((sql, params) => {
      const rmUsabilityRow = matchRmUsabilityItemLookup(sql, params);
      if (rmUsabilityRow) return rmUsabilityRow;
      if (sql.startsWith('select id, code, name, type, current_gate')) {
        return [{ ...projectRow(), output_unit: 'pieces' }];
      }
      if (sql.startsWith('select f.id as formulation_id')) {
        return [{ formulation_id: 'form-1', version_id: 'ver-1', version_number: 3, target_yield_pct: '98.500' }];
      }
      if (isIngredientQuery(sql)) {
        return [{ rm_code: 'RM-001', item_id: null, qty_kg: '1.250000', sequence: 1 }];
      }
      if (sql.startsWith('insert into public.items')) {
        return [{ id: ITEM, item_code: 'FG-001', name: 'Sliced Ham', shelf_life_days: 30 }];
      }
      if (sql.startsWith('update public.items')) return [];
      if (sql.startsWith('select 1 from public.product')) return [];
      if (sql.startsWith('insert into public.product')) return [];
      if (sql.startsWith('update public.formulations')) return [];
      if (sql.startsWith('select id, wo_reference, status')) return [];
      if (sql.startsWith('update public.product')) return [];
      if (sql.startsWith('select id from public.items where org_id')) return [];
      if (sql.startsWith('select h.id, h.version')) return [];
      if (sql.startsWith('select id, version from public.bom_headers')) return [];
      if (sql.startsWith('select coalesce(i.item_code, pc.component_name)')) return [];
      if (sql.startsWith('select pd.id::text as prod_detail_id')) return [];
      if (sql.startsWith('select coalesce(max(version)')) return [{ next_version: 1 }];
      if (sql.startsWith('insert into public.bom_headers')) return [{ id: BOM, version: 1 }];
      if (sql.startsWith('insert into public.bom_lines')) return [];
      if (sql.startsWith('update public.bom_headers')) return [];
      if (sql.startsWith('select id, bom_header_id from public.factory_specs')) return [];
      if (sql.startsWith('insert into public.factory_specs')) return [{ id: SPEC }];
      if (sql.startsWith('with recursive parents as')) return [];
      if (sql.startsWith('update public.factory_specs')) return [];
      throw new Error(`Unhandled SQL: ${sql}`);
    });

    await materializeNpdBom(ctx(client), { projectId: PROJECT });

    const itemsInsert = client.calls.find((c) => normalize(c.sql).startsWith('insert into public.items'));
    expect(itemsInsert?.params[2]).toBe('each');
  });

  it('keeps explicit pieces output_uom when packs_per_case is set (no box-upgrade flip)', async () => {
    const client = createClient((sql, params) => {
      const rmUsabilityRow = matchRmUsabilityItemLookup(sql, params);
      if (rmUsabilityRow) return rmUsabilityRow;
      if (sql.startsWith('select id, code, name, type, current_gate')) {
        return [{ ...projectRow(), output_unit: 'pieces' }];
      }
      if (sql.startsWith('select f.id as formulation_id')) {
        return [{ formulation_id: 'form-1', version_id: 'ver-1', version_number: 3, target_yield_pct: '98.500' }];
      }
      if (isIngredientQuery(sql)) {
        return [{ rm_code: 'RM-001', item_id: null, qty_kg: '1.250000', sequence: 1 }];
      }
      if (sql.startsWith('insert into public.items')) return [];
      if (sql.startsWith('select id, item_code, name, shelf_life_days')) {
        return [{ id: ITEM, item_code: 'FG-001', name: 'Sliced Ham', shelf_life_days: 30 }];
      }
      if (sql.startsWith('update public.items')) return [];
      if (sql.startsWith('select 1 from public.product')) return [];
      if (sql.startsWith('insert into public.product')) return [];
      if (sql.startsWith('update public.formulations')) return [];
      if (sql.startsWith('select id, wo_reference, status')) return [];
      if (sql.startsWith('update public.product')) return [];
      if (sql.startsWith('select id from public.items where org_id')) return [];
      if (sql.startsWith('select h.id, h.version')) return [];
      if (sql.startsWith('select id, version from public.bom_headers')) return [];
      if (sql.startsWith('select coalesce(i.item_code, pc.component_name)')) return [];
      if (sql.startsWith('select pd.id::text as prod_detail_id')) return [];
      if (sql.startsWith('select coalesce(max(version)')) return [{ next_version: 1 }];
      if (sql.startsWith('insert into public.bom_headers')) return [{ id: BOM, version: 1 }];
      if (sql.startsWith('insert into public.bom_lines')) return [];
      if (sql.startsWith('update public.bom_headers')) return [];
      if (sql.startsWith('select id, bom_header_id from public.factory_specs')) return [];
      if (sql.startsWith('insert into public.factory_specs')) return [{ id: SPEC }];
      if (sql.startsWith('with recursive parents as')) return [];
      if (sql.startsWith('update public.factory_specs')) return [];
      throw new Error(`Unhandled SQL: ${sql}`);
    });

    await materializeNpdBom(ctx(client), { projectId: PROJECT });

    const boxUpgrade = client.calls.find((call) => {
      const sql = normalize(call.sql);
      return sql.startsWith('update public.items') && sql.includes("then 'box'");
    });
    expect(boxUpgrade).toBeUndefined();

    const factorSync = client.calls.find((call) => {
      const sql = normalize(call.sql);
      return sql.startsWith('update public.items') && sql.includes('each_per_box = $2') && !sql.includes("then 'box'");
    });
    expect(factorSync).toBeDefined();
    expect(factorSync?.params).toEqual(['FG-001', 4, 0.2]);
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
    const client = createClient((sql, params) => {
      const rmUsabilityRow = matchRmUsabilityItemLookup(sql, params);
      if (rmUsabilityRow) return rmUsabilityRow;

      if (sql.startsWith('select id, code, name, type, current_gate')) return [projectRow()];
      if (sql.startsWith('select f.id as formulation_id')) {
        return [{ formulation_id: 'form-1', version_id: 'ver-1', version_number: 3, target_yield_pct: '98.500' }];
      }
      if (isIngredientQuery(sql)) {
        return [{ rm_code: 'RM-001', item_id: null, qty_kg: '1.250000', sequence: 1 }];
      }
      if (sql.startsWith('insert into public.items')) return [];
      if (sql.startsWith('update public.items')) return [];
      if (sql.startsWith('select id, item_code, name, shelf_life_days')) {
        return [{ id: ITEM, item_code: 'FG-001', name: 'Sliced Ham', shelf_life_days: 45 }];
      }
      if (sql.startsWith('update public.items')) return [];
      if (sql.startsWith('select 1 from public.product')) return [];
      if (sql.startsWith('insert into public.product')) return [];
      if (sql.startsWith('update public.formulations')) return [];
      if (sql.startsWith('select id, wo_reference, status')) return [];
      if (sql.startsWith('update public.product')) return [];
      if (sql.startsWith('select id from public.items where org_id')) return [];
      if (sql.startsWith('select h.id, h.version')) return [{ id: BOM, version: 2 }];
      if (sql.startsWith('select coalesce(i.item_code, pc.component_name)')) return [];
      if (sql.startsWith('select pd.id::text as prod_detail_id')) return [];
      if (sql.startsWith('with expected as')) return [{ matches: true }];
      if (sql.startsWith('select id, bom_header_id from public.factory_specs')) return [{ id: SPEC }];
      if (sql.startsWith('update public.factory_specs')) return [];
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

  it('returns PACKS_PER_BOX_REQUIRED WITHOUT writing the FG item or closeout stamp when packs-per-box is unset and no BOM exists', async () => {
    const client = createClient((sql, params) => {
      const rmUsabilityRow = matchRmUsabilityItemLookup(sql, params);
      if (rmUsabilityRow) return rmUsabilityRow;
      if (sql.startsWith('select id, code, name, type, current_gate')) return [{ ...projectRow(), packs_per_case: 0 }];
      if (sql.startsWith('select id from public.items where org_id')) return []; // no production-code conflict
      if (sql.startsWith('select f.id as formulation_id')) {
        return [{ formulation_id: 'form-1', version_id: 'ver-1', version_number: 3, target_yield_pct: '98.500' }];
      }
      if (isIngredientQuery(sql)) {
        return [{ rm_code: 'RM-001', item_id: null, qty_kg: '1.250000', sequence: 1 }];
      }
      if (sql.startsWith('select h.id, h.version')) return [];
      if (sql.startsWith('select id, version from public.bom_headers')) return []; // no existing BOM
      if (sql.startsWith('select coalesce(i.item_code, pc.component_name)')) return [];
      if (sql.startsWith('select pd.id::text as prod_detail_id')) return [];
      if (sql.startsWith('update public.factory_specs')) return [];
      throw new Error(`Unhandled SQL: ${sql}`);
    });

    const result = await materializeNpdBom(ctx(client), { projectId: PROJECT });

    expect(result.code).toBe('PACKS_PER_BOX_REQUIRED');
    expect(result.bomHeaderId).toBeNull();
    // The gate MUST fire BEFORE any product/item write — otherwise withOrgContext commits the
    // ensureFgItemAndProduct insert + the stampProductCloseoutInputs locked-for-release stamp,
    // wedging the project (locked-for-release with no BOM, unrevertable via NPD_RELEASE_LOCKED).
    expect(client.calls.some((c) => normalize(c.sql).startsWith('insert into public.items'))).toBe(false);
    expect(client.calls.some((c) => normalize(c.sql).startsWith('insert into public.product'))).toBe(false);
    expect(client.calls.some((c) => normalize(c.sql).startsWith('update public.product'))).toBe(false);
  });

  it('does NOT require packs-per-box on an idempotent re-run when an active BOM already exists', async () => {
    const client = createClient((sql, params) => {
      const rmUsabilityRow = matchRmUsabilityItemLookup(sql, params);
      if (rmUsabilityRow) return rmUsabilityRow;
      if (sql.startsWith('select id, code, name, type, current_gate')) return [{ ...projectRow(), packs_per_case: 0 }];
      if (sql.startsWith('select f.id as formulation_id')) {
        return [{ formulation_id: 'form-1', version_id: 'ver-1', version_number: 3, target_yield_pct: '98.500' }];
      }
      if (isIngredientQuery(sql)) {
        return [{ rm_code: 'RM-001', item_id: null, qty_kg: '1.250000', sequence: 1 }];
      }
      if (sql.startsWith('insert into public.items')) return [];
      if (sql.startsWith('update public.items')) return [];
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
      if (sql.startsWith('select coalesce(i.item_code, pc.component_name)')) return [];
      if (sql.startsWith('select pd.id::text as prod_detail_id')) return [];
      if (sql.startsWith('with expected as')) return [{ matches: true }];
      if (sql.startsWith('select id, bom_header_id from public.factory_specs')) return [{ id: SPEC }];
      if (sql.startsWith('update public.factory_specs')) return [];
      throw new Error(`Unhandled SQL: ${sql}`);
    });

    const result = await materializeNpdBom(ctx(client), { projectId: PROJECT });

    expect(result.code).toBeUndefined();
    expect(result.bomHeaderId).toBe(BOM);
  });

  it('applies compounded process yields to RM lines when no component linkage exists', async () => {
    const client = createClient((sql, params) => {
      const rmUsabilityRow = matchRmUsabilityItemLookup(sql, params);
      if (rmUsabilityRow) return rmUsabilityRow;
      if (sql.startsWith('select id, code, name, type, current_gate')) return [{ ...projectRow(), pack_weight_g: '300.000', packs_per_case: 12 }];
      if (sql.startsWith('select id from public.items where org_id')) return [];
      if (sql.startsWith('select f.id as formulation_id')) {
        return [{ formulation_id: 'form-1', version_id: 'ver-1', version_number: 3, target_yield_pct: '100' }];
      }
      if (isIngredientQuery(sql)) {
        return [{ rm_code: 'RM-PORK', item_id: null, substitute_item_id: null, qty_kg: '0.300000', sequence: 1 }];
      }
      if (sql.startsWith('select h.id, h.version')) return [];
      if (sql.startsWith('select id, version from public.bom_headers')) return [];
      if (sql.startsWith('select coalesce(i.item_code, pc.component_name)')) return [];
      if (sql.startsWith('select pd.id::text as prod_detail_id')) {
        return [
          { prod_detail_id: 'pd-1', ingredient_item_id: null, wip_item_id: null, display_order: 1, yield_pct: '95.000' },
          { prod_detail_id: 'pd-1', ingredient_item_id: null, wip_item_id: null, display_order: 2, yield_pct: '95.000' },
        ];
      }
      if (sql.startsWith('insert into public.items')) return [{ id: ITEM, item_code: 'FG-001', name: 'Sliced Ham', shelf_life_days: 30 }];
      if (sql.startsWith('update public.items')) return [];
      if (sql.startsWith('select 1 from public.product')) return [];
      if (sql.startsWith('insert into public.product')) return [];
      if (sql.startsWith('update public.formulations')) return [];
      if (sql.startsWith('select id, wo_reference, status')) return [];
      if (sql.startsWith('update public.product')) return [];
      if (sql.startsWith('select coalesce(max(version)')) return [{ next_version: 1 }];
      if (sql.startsWith('insert into public.bom_headers')) return [{ id: BOM, version: 1 }];
      if (sql.startsWith('insert into public.bom_lines')) return [];
      if (sql.startsWith('update public.bom_headers')) return [];
      if (sql.startsWith('select id, bom_header_id from public.factory_specs')) return [];
      if (sql.startsWith('insert into public.factory_specs')) return [{ id: SPEC }];
      if (sql.startsWith('with recursive parents as')) return [];
      if (sql.startsWith('update public.factory_specs')) return [];
      throw new Error(`Unhandled SQL: ${sql}`);
    });

    await materializeNpdBom(ctx(client), { projectId: PROJECT });

    const rmLineInsert = client.calls.find((call) => normalize(call.sql).startsWith('insert into public.bom_lines'));
    expect(rmLineInsert?.params[6]).toBe('3.988920');
  });

  it('does NOT compound sibling components\' yields for an unlinked RM on a MULTI-component product (L8 HIGH-1)', async () => {
    const client = createClient((sql, params) => {
      const rmUsabilityRow = matchRmUsabilityItemLookup(sql, params);
      if (rmUsabilityRow) return rmUsabilityRow;
      if (sql.startsWith('select id, code, name, type, current_gate')) return [{ ...projectRow(), pack_weight_g: '300.000', packs_per_case: 12 }];
      if (sql.startsWith('select id from public.items where org_id')) return [];
      if (sql.startsWith('select f.id as formulation_id')) {
        return [{ formulation_id: 'form-1', version_id: 'ver-1', version_number: 3, target_yield_pct: '100' }];
      }
      if (isIngredientQuery(sql)) {
        return [{ rm_code: 'RM-PORK', item_id: null, substitute_item_id: null, qty_kg: '0.300000', sequence: 1 }];
      }
      if (sql.startsWith('select h.id, h.version')) return [];
      if (sql.startsWith('select id, version from public.bom_headers')) return [];
      if (sql.startsWith('select coalesce(i.item_code, pc.component_name)')) return [];
      if (sql.startsWith('select pd.id::text as prod_detail_id')) {
        // TWO components, each with its own 95% process chain — an unlinked RM
        // must NOT be divided by 0.95^4 (the union), nor by either chain.
        return [
          { prod_detail_id: 'pd-1', ingredient_item_id: null, wip_item_id: null, display_order: 1, yield_pct: '95.000' },
          { prod_detail_id: 'pd-1', ingredient_item_id: null, wip_item_id: null, display_order: 2, yield_pct: '95.000' },
          { prod_detail_id: 'pd-2', ingredient_item_id: null, wip_item_id: null, display_order: 1, yield_pct: '95.000' },
          { prod_detail_id: 'pd-2', ingredient_item_id: null, wip_item_id: null, display_order: 2, yield_pct: '95.000' },
        ];
      }
      if (sql.startsWith('insert into public.items')) return [{ id: ITEM, item_code: 'FG-001', name: 'Sliced Ham', shelf_life_days: 30 }];
      if (sql.startsWith('update public.items')) return [];
      if (sql.startsWith('select 1 from public.product')) return [];
      if (sql.startsWith('insert into public.product')) return [];
      if (sql.startsWith('update public.formulations')) return [];
      if (sql.startsWith('select id, wo_reference, status')) return [];
      if (sql.startsWith('update public.product')) return [];
      if (sql.startsWith('select coalesce(max(version)')) return [{ next_version: 1 }];
      if (sql.startsWith('insert into public.bom_headers')) return [{ id: BOM, version: 1 }];
      if (sql.startsWith('insert into public.bom_lines')) return [];
      if (sql.startsWith('update public.bom_headers')) return [];
      if (sql.startsWith('select id, bom_header_id from public.factory_specs')) return [];
      if (sql.startsWith('insert into public.factory_specs')) return [{ id: SPEC }];
      if (sql.startsWith('with recursive parents as')) return [];
      if (sql.startsWith('update public.factory_specs')) return [];
      throw new Error(`Unhandled SQL: ${sql}`);
    });

    await materializeNpdBom(ctx(client), { projectId: PROJECT });

    const rmLineInsert = client.calls.find((call) => normalize(call.sql).startsWith('insert into public.bom_lines'));
    // 0.300 kg/pack × 12 packs — no yield adjustment until the RM is linked to its chain.
    expect(rmLineInsert?.params[6]).toBe('3.600000');
  });

  it('upgrades a pre-existing FG to output_uom=box ATOMICALLY with both pack factors (walk-2 H-1)', async () => {
    const client = createClient((sql, params) => {
      const rmUsabilityRow = matchRmUsabilityItemLookup(sql, params);
      if (rmUsabilityRow) return rmUsabilityRow;
      if (sql.startsWith('select id, code, name, type, current_gate')) return [{ ...projectRow(), pack_weight_g: '300.000', packs_per_case: 12 }];
      if (sql.startsWith('select id from public.items where org_id')) return [];
      if (sql.startsWith('select f.id as formulation_id')) {
        return [{ formulation_id: 'form-1', version_id: 'ver-1', version_number: 3, target_yield_pct: '100' }];
      }
      if (isIngredientQuery(sql)) {
        return [{ rm_code: 'RM-PORK', item_id: null, substitute_item_id: null, qty_kg: '0.300000', sequence: 1 }];
      }
      if (sql.startsWith('select h.id, h.version')) return [];
      if (sql.startsWith('select id, version from public.bom_headers')) return [];
      if (sql.startsWith('select coalesce(i.item_code, pc.component_name)')) return [];
      if (sql.startsWith('select pd.id::text as prod_detail_id')) return [];
      // Pre-existing item: INSERT hits ON CONFLICT DO NOTHING, loadItem returns the row.
      if (sql.startsWith('insert into public.items')) return [];
      if (sql.startsWith('select id, item_code, name, shelf_life_days')) {
        return [{ id: ITEM, item_code: 'FG-001', name: 'Sliced Ham', shelf_life_days: 30 }];
      }
      if (sql.startsWith('update public.items')) return [];
      if (sql.startsWith('select 1 from public.product')) return [];
      if (sql.startsWith('insert into public.product')) return [];
      if (sql.startsWith('update public.formulations')) return [];
      if (sql.startsWith('select id, wo_reference, status')) return [];
      if (sql.startsWith('update public.product')) return [];
      if (sql.startsWith('select coalesce(max(version)')) return [{ next_version: 1 }];
      if (sql.startsWith('insert into public.bom_headers')) return [{ id: BOM, version: 1 }];
      if (sql.startsWith('insert into public.bom_lines')) return [];
      if (sql.startsWith('update public.bom_headers')) return [];
      if (sql.startsWith('select id, bom_header_id from public.factory_specs')) return [];
      if (sql.startsWith('insert into public.factory_specs')) return [{ id: SPEC }];
      if (sql.startsWith('with recursive parents as')) return [];
      if (sql.startsWith('update public.factory_specs')) return [];
      throw new Error(`Unhandled SQL: ${sql}`);
    });

    await materializeNpdBom(ctx(client), { projectId: PROJECT });

    // items_output_uom_pack_factors_check: output_uom='box' requires BOTH factors
    // in the SAME statement — assert the single atomic UPDATE carries them.
    const boxUpgrade = client.calls.find((call) => {
      const sql = normalize(call.sql);
      return sql.startsWith('update public.items') && sql.includes("then 'box'");
    });
    expect(boxUpgrade).toBeDefined();
    expect(boxUpgrade?.sql).toContain('each_per_box = $2');
    expect(boxUpgrade?.sql).toContain('net_qty_per_each = coalesce(net_qty_per_each, $3::numeric)');
    expect(boxUpgrade?.params).toEqual(['FG-001', 12, 0.3]);
    // And no legacy split write flips output_uom to box without the factors.
    const nakedFlip = client.calls.find((call) => {
      const sql = normalize(call.sql);
      return sql.startsWith('update public.items') && sql.includes("set output_uom = 'box'");
    });
    expect(nakedFlip).toBeUndefined();
  });

  it('supersedes the OLD active header BEFORE activating the new one (walk-4 unique-index order)', async () => {
    const client = createClient((sql, params) => {
      const rmUsabilityRow = matchRmUsabilityItemLookup(sql, params);
      if (rmUsabilityRow) return rmUsabilityRow;

      if (sql.startsWith('select id, code, name, type, current_gate')) return [projectRow()];
      if (sql.startsWith('select id from public.items where org_id')) return [];
      if (sql.startsWith('select f.id as formulation_id')) {
        return [{ formulation_id: 'form-1', version_id: 'ver-1', version_number: 4, target_yield_pct: '100' }];
      }
      if (isIngredientQuery(sql)) {
        return [{ rm_code: 'RM-001', item_id: ITEM, substitute_item_id: null, qty_kg: '1.250000', sequence: 1 }];
      }
      if (sql.startsWith('select h.id, h.version')) return [{ id: BOM, version: 2 }];
      if (sql.startsWith('select coalesce(i.item_code, pc.component_name)')) return [];
      if (sql.startsWith('select pd.id::text as prod_detail_id')) return [];
      if (sql.startsWith('with expected as')) return [{ matches: false }];
      if (sql.startsWith('insert into public.items')) return [{ id: ITEM, item_code: 'FG-001', name: 'Sliced Ham', shelf_life_days: 30 }];
      if (sql.startsWith('update public.items')) return [];
      if (sql.startsWith('select 1 from public.product')) return [];
      if (sql.startsWith('insert into public.product')) return [];
      if (sql.startsWith('update public.formulations')) return [];
      if (sql.startsWith('select id, wo_reference, status')) return [];
      if (sql.startsWith('update public.product')) return [];
      if (sql.startsWith('select coalesce(max(version)')) return [{ next_version: 3 }];
      if (sql.startsWith('insert into public.bom_headers')) return [{ id: SPEC, version: 3 }];
      if (sql.startsWith('insert into public.bom_lines')) return [];
      if (sql.startsWith('update public.bom_headers')) return [];
      if (sql.startsWith('select id, bom_header_id from public.factory_specs')) return [];
      if (sql.startsWith('insert into public.factory_specs')) return [{ id: SPEC }];
      if (sql.startsWith('with recursive parents as')) return [];
      if (sql.startsWith('update public.factory_specs')) return [];
      throw new Error(`Unhandled SQL: ${sql}`);
    });

    await materializeNpdBom(ctx(client), { projectId: PROJECT });

    const headerUpdates = client.calls
      .map((call, index) => ({ sql: normalize(call.sql), index }))
      .filter((c) => c.sql.startsWith('update public.bom_headers'));
    const technicalApprovedIdx = headerUpdates.find((c) => c.sql.includes("set status = 'technical_approved'"))?.index;
    const activateIdx = headerUpdates.find((c) => c.sql.includes("set status = 'active'"))?.index;
    expect(technicalApprovedIdx).toBeDefined();
    expect(activateIdx).toBeDefined();
    expect(technicalApprovedIdx!).toBeLessThan(activateIdx!);
  });

  it('creates a new BOM version and supersedes stale active NPD BOMs', async () => {
    const client = createClient((sql, params) => {
      const rmUsabilityRow = matchRmUsabilityItemLookup(sql, params);
      if (rmUsabilityRow) return rmUsabilityRow;

      if (sql.startsWith('select id, code, name, type, current_gate')) return [projectRow()];
      if (sql.startsWith('select id from public.items where org_id')) return [];
      if (sql.startsWith('select f.id as formulation_id')) {
        return [{ formulation_id: 'form-1', version_id: 'ver-1', version_number: 4, target_yield_pct: '100' }];
      }
      if (isIngredientQuery(sql)) {
        return [{ rm_code: 'RM-001', item_id: ITEM, substitute_item_id: null, qty_kg: '1.250000', sequence: 1 }];
      }
      if (sql.startsWith('select h.id, h.version')) return [{ id: BOM, version: 2 }];
      if (sql.startsWith('select coalesce(i.item_code, pc.component_name)')) return [];
      if (sql.startsWith('select pd.id::text as prod_detail_id')) return [];
      if (sql.startsWith('with expected as')) return [{ matches: false }];
      if (sql.startsWith('insert into public.items')) return [{ id: ITEM, item_code: 'FG-001', name: 'Sliced Ham', shelf_life_days: 30 }];
      if (sql.startsWith('update public.items')) return [];
      if (sql.startsWith('select 1 from public.product')) return [];
      if (sql.startsWith('insert into public.product')) return [];
      if (sql.startsWith('update public.formulations')) return [];
      if (sql.startsWith('select id, wo_reference, status')) return [];
      if (sql.startsWith('update public.product')) return [];
      if (sql.startsWith('select coalesce(max(version)')) return [{ next_version: 3 }];
      if (sql.startsWith('insert into public.bom_headers')) return [{ id: '99999999-9999-4999-8999-999999999999', version: 3 }];
      if (sql.startsWith('insert into public.bom_lines')) return [];
      if (sql.startsWith('update public.bom_headers')) return [];
      if (sql.startsWith('select id, bom_header_id from public.factory_specs')) return [];
      if (sql.startsWith('insert into public.factory_specs')) return [{ id: SPEC }];
      if (sql.startsWith('with recursive parents as')) return [];
      if (sql.startsWith('update public.factory_specs')) return [];
      throw new Error(`Unhandled SQL: ${sql}`);
    });

    const result = await materializeNpdBom(ctx(client), { projectId: PROJECT });

    expect(result.bomHeaderId).toBe('99999999-9999-4999-8999-999999999999');
    expect(result.createdBom).toBe(true);
    const headerInsert = client.calls.find((call) => normalize(call.sql).startsWith('insert into public.bom_headers'));
    expect(headerInsert?.params[4]).toBe(BOM);
    const supersede = client.calls.find((call) =>
      normalize(call.sql).startsWith('update public.bom_headers') &&
      normalize(call.sql).includes("set status = 'superseded'"),
    );
    expect(supersede?.params?.[0]).toBe('FG-001');
    expect(supersede?.params?.[1]).toBe('99999999-9999-4999-8999-999999999999');
  });

  it('copies packaging substitutes and upgrades pre-existing FG item UOMs', async () => {
    const client = createClient((sql, params) => {
      const rmUsabilityRow = matchRmUsabilityItemLookup(sql, params);
      if (rmUsabilityRow) return rmUsabilityRow;

      if (sql.startsWith('select id, code, name, type, current_gate')) return [projectRow()];
      if (sql.startsWith('select id from public.items where org_id')) return [];
      if (sql.startsWith('select f.id as formulation_id')) {
        return [{ formulation_id: 'form-1', version_id: 'ver-1', version_number: 3, target_yield_pct: '100' }];
      }
      if (isIngredientQuery(sql)) return [];
      if (sql.startsWith('select h.id, h.version')) return [];
      if (sql.startsWith('select id, version from public.bom_headers')) return [];
      if (sql.startsWith('select coalesce(i.item_code, pc.component_name)')) {
        return [{ component_name: 'BOX', item_id: PM_ITEM, substitute_item_id: PM_SUB, qty: '1.000000', scrap_pct: '2.000' }];
      }
      if (sql.startsWith('select pd.id::text as prod_detail_id')) return [];
      if (sql.startsWith('insert into public.items')) return [];
      if (sql.startsWith('select id, item_code, name, shelf_life_days')) {
        return [{ id: ITEM, item_code: 'FG-001', name: 'Sliced Ham', shelf_life_days: 30 }];
      }
      if (sql.startsWith('update public.items')) return [];
      if (sql.startsWith('select 1 from public.product')) return [];
      if (sql.startsWith('insert into public.product')) return [];
      if (sql.startsWith('update public.formulations')) return [];
      if (sql.startsWith('select id, wo_reference, status')) return [];
      if (sql.startsWith('update public.product')) return [];
      if (sql.startsWith('select coalesce(max(version)')) return [{ next_version: 1 }];
      if (sql.startsWith('insert into public.bom_headers')) return [{ id: BOM, version: 1 }];
      if (sql.startsWith('insert into public.bom_lines')) return [];
      if (sql.startsWith('update public.bom_headers')) return [];
      if (sql.startsWith('select id, bom_header_id from public.factory_specs')) return [];
      if (sql.startsWith('insert into public.factory_specs')) return [{ id: SPEC }];
      if (sql.startsWith('update public.factory_specs')) return [];
      throw new Error(`Unhandled SQL: ${sql}`);
    });

    await materializeNpdBom(ctx(client), { projectId: PROJECT });

    const itemInsert = client.calls.find((call) => normalize(call.sql).startsWith('insert into public.items'));
    expect(itemInsert?.params[2]).toBe('box');
    // Atomic box upgrade (walk-2 H-1): output_uom flips together with both pack factors.
    expect(client.calls.some((call) => normalize(call.sql).includes("then 'box'") && normalize(call.sql).includes('each_per_box = $2'))).toBe(true);
    expect(client.calls.some((call) => normalize(call.sql).includes("set uom_base = 'kg'"))).toBe(true);
    const pmLineInsert = client.calls.find((call) => normalize(call.sql).startsWith('insert into public.bom_lines'));
    expect(pmLineInsert?.params[3]).toBe(PM_SUB);
    expect(pmLineInsert?.params[6]).toBe('4.000000');
  });

  it('self-heals a linked inactive WIP item and materializes its child BOM', async () => {
    const client = createClient((sql, params) => {
      const rmUsabilityRow = matchRmUsabilityItemLookup(sql, params);
      if (rmUsabilityRow) return rmUsabilityRow;

      if (sql.startsWith('select id, code, name, type, current_gate')) return [projectRow()];
      if (sql.startsWith('select id from public.items where org_id')) return [];
      if (sql.startsWith('select f.id as formulation_id')) {
        return [{ formulation_id: 'form-1', version_id: 'ver-1', version_number: 3, target_yield_pct: '100' }];
      }
      if (isIngredientQuery(sql)) {
        return [
          {
            rm_code: 'RM-001',
            item_id: RM_FLOUR,
            substitute_item_id: null,
            qty_kg: '1.000000',
            sequence: 1,
            wip_definition_id: null,
            npd_wip_process_id: null,
          },
          {
            rm_code: 'WIP-DOUGH',
            item_id: null,
            substitute_item_id: null,
            qty_kg: '2.000000',
            sequence: 2,
            wip_definition_id: WIP_DEF,
            npd_wip_process_id: null,
          },
        ];
      }
      if (sql.includes('sum(fi.qty_kg)')) return [];
      if (sql.startsWith('select wd.id::text as id')) {
        if (sql.includes('wd.id = $1::uuid')) {
          return [{
            id: WIP_DEF,
            item_id: WIP_ITEM,
            item_code: null,
            name: 'Dough',
            base_uom: 'kg',
            yield_pct: '100',
            version: 1,
          }];
        }
        return [{
          id: WIP_DEF,
          item_id: WIP_ITEM,
          item_code: 'WIP-DOUGH',
          name: 'Dough',
          base_uom: 'kg',
          yield_pct: '100',
          version: 1,
        }];
      }
      if (sql.startsWith('with candidate as')) {
        return [{
          id: WIP_DEF,
          item_id: WIP_ITEM,
          item_code: 'WIP-DOUGH',
          name: 'Dough',
          base_uom: 'kg',
          yield_pct: '100',
          version: 1,
        }];
      }
      if (sql.startsWith('select wdi.item_id::text as item_id')) {
        return [{ item_id: RM_FLOUR, item_code: 'RM-FLOUR', qty_per_unit: '0.500000', uom: 'kg', sequence: 1 }];
      }
      if (sql.startsWith('select h.id, h.version')) return [];
      if (sql.startsWith('select id, version from public.bom_headers')) return [];
      if (sql.startsWith('select coalesce(i.item_code, pc.component_name)')) return [];
      if (sql.startsWith('select pd.id::text as prod_detail_id')) return [];
      if (sql.startsWith('insert into public.items')) return [{ id: ITEM, item_code: 'FG-001', name: 'Sliced Ham', shelf_life_days: 30 }];
      if (sql.startsWith('update public.items')) return [];
      if (sql.startsWith('select 1 from public.product')) return [];
      if (sql.startsWith('insert into public.product')) return [];
      if (sql.startsWith('update public.formulations')) return [];
      if (sql.startsWith('select id, wo_reference, status')) return [];
      if (sql.startsWith('update public.product')) return [];
      if (sql.startsWith('select coalesce(max(version)')) return [{ next_version: 1 }];
      if (sql.startsWith('insert into public.bom_headers')) return [{ id: BOM, version: 1 }];
      if (sql.startsWith('insert into public.bom_lines')) return [];
      if (sql.startsWith('update public.bom_headers')) return [];
      if (sql.startsWith('select id, bom_header_id from public.factory_specs')) return [];
      if (sql.startsWith('insert into public.factory_specs')) return [{ id: SPEC }];
      if (sql.startsWith('with recursive parents as')) return [];
      if (sql.startsWith('update public.factory_specs')) return [];
      throw new Error(`Unhandled SQL: ${sql}`);
    });

    const result = await materializeNpdBom(ctx(client), { projectId: PROJECT });

    expect(result.code).toBeUndefined();
    const repair = client.calls.find((call) => normalize(call.sql).startsWith('with candidate as'));
    expect(repair?.sql).toContain("item.item_type = 'intermediate'");
    expect(repair?.sql).toContain("set status = 'active'");
    expect(client.calls.some((call) => normalize(call.sql).includes('wp.wip_definition_id = $2::uuid'))).toBe(false);
    expect(client.calls.some((call) => normalize(call.sql).includes('from public.wip_definition_ingredients'))).toBe(true);
    const fgLineInserts = client.calls.filter(
      (call) => normalize(call.sql).startsWith('insert into public.bom_lines') && call.params.length === 13,
    );
    const wipChildLines = client.calls.filter(
      (call) => normalize(call.sql).startsWith('insert into public.bom_lines') && call.params.length === 9,
    );
    expect(fgLineInserts).toHaveLength(2);
    expect(fgLineInserts[0]?.params[4]).toBe('RM-001');
    expect(wipChildLines).toHaveLength(1);
    const wipChildLine = wipChildLines[0];
    expect(wipChildLine?.params[3]).toBe('RM-FLOUR');
    expect(wipChildLine?.params[4]).toBe('0.500000');
  });

  it('returns the exact WIP definition when no active intermediate item can be resolved', async () => {
    const client = createClient((sql, params) => {
      const rmUsabilityRow = matchRmUsabilityItemLookup(sql, params);
      if (rmUsabilityRow) return rmUsabilityRow;

      if (sql.startsWith('select id, code, name, type, current_gate')) return [projectRow()];
      if (sql.startsWith('select id from public.items where org_id')) return [];
      if (sql.startsWith('select f.id as formulation_id')) {
        return [{ formulation_id: 'form-1', version_id: 'ver-1', version_number: 3, target_yield_pct: '100' }];
      }
      if (isIngredientQuery(sql)) {
        return [{
          rm_code: 'WIP-INACTIVE',
          item_id: null,
          qty_kg: '1.000000',
          sequence: 1,
          wip_definition_id: WIP_DEF,
          npd_wip_process_id: null,
        }];
      }
      if (sql.startsWith('select wd.id::text as id')) {
        expect(sql).toContain("i.item_type = 'intermediate'");
        expect(sql).toContain("i.status = 'active'");
        return [{
          id: WIP_DEF,
          item_id: WIP_ITEM,
          item_code: null,
          name: 'Inactive WIP',
          base_uom: 'kg',
          yield_pct: '100',
          version: 1,
        }];
      }
      if (sql.startsWith('with candidate as')) return [];
      if (sql.includes('sum(fi.qty_kg)')) return [];
      if (sql.startsWith('select h.id, h.version')) return [];
      throw new Error(`Unhandled SQL: ${sql}`);
    });

    const result = await materializeNpdBom(ctx(client), { projectId: PROJECT });

    expect(result).toMatchObject({
      code: 'WIP_ITEM_REQUIRED',
      wipDefinitionIds: [WIP_DEF],
    });
  });

  it('materializes WIP child BOM lines from process-assigned formulation ingredients', async () => {
    const client = createClient((sql, params) => {
      const rmUsabilityRow = matchRmUsabilityItemLookup(sql, params);
      if (rmUsabilityRow) return rmUsabilityRow;

      if (sql.startsWith('select id, code, name, type, current_gate')) return [projectRow()];
      if (sql.startsWith('select id from public.items where org_id')) return [];
      if (sql.startsWith('select f.id as formulation_id')) {
        return [{ formulation_id: 'form-1', version_id: 'ver-1', version_number: 3, target_yield_pct: '100' }];
      }
      if (isIngredientQuery(sql)) {
        return [
          {
            rm_code: 'RM-FLOUR',
            item_id: RM_FLOUR,
            substitute_item_id: null,
            qty_kg: '1.000000',
            sequence: 1,
            wip_definition_id: null,
            npd_wip_process_id: WIP_PROCESS,
          },
          {
            rm_code: 'WIP-DOUGH',
            item_id: null,
            substitute_item_id: null,
            qty_kg: '2.000000',
            sequence: 2,
            wip_definition_id: WIP_DEF,
            npd_wip_process_id: null,
          },
        ];
      }
      if (sql.startsWith('select wd.id::text as id')) {
        return [{
          id: WIP_DEF,
          item_id: WIP_ITEM,
          item_code: 'WIP-DOUGH',
          name: 'Dough',
          base_uom: 'kg',
          yield_pct: '100',
          version: 1,
        }];
      }
      if (sql.includes('sum(fi.qty_kg)')) return [];
      if (sql.startsWith('select wp.id::text as process_id')) {
        return [{ process_id: WIP_PROCESS, wip_definition_id: WIP_DEF }];
      }
      if (sql.startsWith('select coalesce(fi.item_id, i.id)::text as item_id')) {
        return [{ item_id: RM_FLOUR, item_code: 'RM-FLOUR', qty_per_unit: '1.000000', uom: 'kg', sequence: 1 }];
      }
      if (sql.startsWith('select h.id, h.version')) return [];
      if (sql.startsWith('select id, version from public.bom_headers')) return [];
      if (sql.startsWith('select coalesce(i.item_code, pc.component_name)')) return [];
      if (sql.startsWith('select pd.id::text as prod_detail_id')) return [];
      if (sql.startsWith('insert into public.items')) return [{ id: ITEM, item_code: 'FG-001', name: 'Sliced Ham', shelf_life_days: 30 }];
      if (sql.startsWith('update public.items')) return [];
      if (sql.startsWith('select 1 from public.product')) return [];
      if (sql.startsWith('insert into public.product')) return [];
      if (sql.startsWith('update public.formulations')) return [];
      if (sql.startsWith('select id, wo_reference, status')) return [];
      if (sql.startsWith('update public.product')) return [];
      if (sql.startsWith('select coalesce(max(version)')) return [{ next_version: 1 }];
      if (sql.startsWith('insert into public.bom_headers')) return [{ id: BOM, version: 1 }];
      if (sql.startsWith('insert into public.bom_lines')) return [];
      if (sql.startsWith('update public.bom_headers')) return [];
      if (sql.startsWith('select id, bom_header_id from public.factory_specs')) return [];
      if (sql.startsWith('insert into public.factory_specs')) return [{ id: SPEC }];
      if (sql.startsWith('with recursive parents as')) return [];
      if (sql.startsWith('update public.factory_specs')) return [];
      throw new Error(`Unhandled SQL: ${sql}`);
    }, { hasProcessAssignments: true });

    await materializeNpdBom(ctx(client), { projectId: PROJECT });

    const fgLineInserts = client.calls.filter(
      (call) => normalize(call.sql).startsWith('insert into public.bom_lines') && call.params.length === 13,
    );
    expect(fgLineInserts).toHaveLength(1);
    expect(fgLineInserts[0]?.params[4]).toBe('WIP-DOUGH');
    const assignedChildLine = client.calls.find(
      (call) => normalize(call.sql).startsWith('insert into public.bom_lines') && call.params[8] === 'npd_process_consumption',
    );
    expect(assignedChildLine?.params[2]).toBe(RM_FLOUR);
    expect(assignedChildLine?.params[3]).toBe('RM-FLOUR');
    expect(assignedChildLine?.params[4]).toBe('1.000000');
    expect(client.calls.some((call) => normalize(call.sql).includes('from public.wip_definition_ingredients'))).toBe(false);
  });

  it('keeps an RM assigned to a non-WIP process on the FG BOM (F1 fail-safe)', async () => {
    const client = createClient((sql, params) => {
      const rmUsabilityRow = matchRmUsabilityItemLookup(sql, params);
      if (rmUsabilityRow) return rmUsabilityRow;

      if (sql.startsWith('select id, code, name, type, current_gate')) return [projectRow()];
      if (sql.startsWith('select id from public.items where org_id')) return [];
      if (sql.startsWith('select f.id as formulation_id')) {
        return [{ formulation_id: 'form-1', version_id: 'ver-1', version_number: 3, target_yield_pct: '100' }];
      }
      if (isIngredientQuery(sql)) {
        return [
          {
            rm_code: 'RM-FLOUR',
            item_id: RM_FLOUR,
            substitute_item_id: null,
            qty_kg: '1.000000',
            sequence: 1,
            wip_definition_id: null,
            npd_wip_process_id: NON_WIP_PROCESS,
          },
        ];
      }
      if (sql.includes('sum(fi.qty_kg)')) return [];
      if (sql.startsWith('select wp.id::text as process_id')) {
        return [{ process_id: NON_WIP_PROCESS, wip_definition_id: null }];
      }
      if (sql.startsWith('select h.id, h.version')) return [];
      if (sql.startsWith('select id, version from public.bom_headers')) return [];
      if (sql.startsWith('select coalesce(i.item_code, pc.component_name)')) return [];
      if (sql.startsWith('select pd.id::text as prod_detail_id')) return [];
      if (sql.startsWith('insert into public.items')) return [{ id: ITEM, item_code: 'FG-001', name: 'Sliced Ham', shelf_life_days: 30 }];
      if (sql.startsWith('update public.items')) return [];
      if (sql.startsWith('select 1 from public.product')) return [];
      if (sql.startsWith('insert into public.product')) return [];
      if (sql.startsWith('update public.formulations')) return [];
      if (sql.startsWith('select id, wo_reference, status')) return [];
      if (sql.startsWith('update public.product')) return [];
      if (sql.startsWith('select coalesce(max(version)')) return [{ next_version: 1 }];
      if (sql.startsWith('insert into public.bom_headers')) return [{ id: BOM, version: 1 }];
      if (sql.startsWith('insert into public.bom_lines')) return [];
      if (sql.startsWith('update public.bom_headers')) return [];
      if (sql.startsWith('select id, bom_header_id from public.factory_specs')) return [];
      if (sql.startsWith('insert into public.factory_specs')) return [{ id: SPEC }];
      if (sql.startsWith('with recursive parents as')) return [];
      if (sql.startsWith('update public.factory_specs')) return [];
      throw new Error(`Unhandled SQL: ${sql}`);
    }, { hasProcessAssignments: true });

    await materializeNpdBom(ctx(client), { projectId: PROJECT });

    const fgLineInserts = client.calls.filter(
      (call) => normalize(call.sql).startsWith('insert into public.bom_lines') && call.params.length === 13,
    );
    expect(fgLineInserts).toHaveLength(1);
    expect(fgLineInserts[0]?.params[4]).toBe('RM-FLOUR');
    expect(client.calls.some((call) => normalize(call.sql).includes('wp.wip_definition_id = $2::uuid'))).toBe(false);
  });

  it('returns AMBIGUOUS_WIP_CONSUMPTION without writing when two assigned processes share a WIP definition (F2)', async () => {
    const client = createClient((sql, params) => {
      const rmUsabilityRow = matchRmUsabilityItemLookup(sql, params);
      if (rmUsabilityRow) return rmUsabilityRow;

      if (sql.startsWith('select id, code, name, type, current_gate')) return [projectRow()];
      if (sql.startsWith('select id from public.items where org_id')) return [];
      if (sql.startsWith('select f.id as formulation_id')) {
        return [{ formulation_id: 'form-1', version_id: 'ver-1', version_number: 3, target_yield_pct: '100' }];
      }
      if (isIngredientQuery(sql)) {
        return [
          {
            rm_code: 'RM-FLOUR',
            item_id: RM_FLOUR,
            substitute_item_id: null,
            qty_kg: '1.000000',
            sequence: 1,
            wip_definition_id: null,
            npd_wip_process_id: WIP_PROCESS,
          },
          {
            rm_code: 'RM-SALT',
            item_id: null,
            substitute_item_id: null,
            qty_kg: '0.100000',
            sequence: 2,
            wip_definition_id: null,
            npd_wip_process_id: WIP_PROCESS_2,
          },
          {
            rm_code: 'WIP-DOUGH',
            item_id: null,
            substitute_item_id: null,
            qty_kg: '2.000000',
            sequence: 3,
            wip_definition_id: WIP_DEF,
            npd_wip_process_id: null,
          },
        ];
      }
      if (sql.startsWith('select wd.id::text as id')) {
        return [{
          id: WIP_DEF,
          item_id: WIP_ITEM,
          item_code: 'WIP-DOUGH',
          name: 'Dough',
          base_uom: 'kg',
          yield_pct: '100',
          version: 1,
        }];
      }
      if (sql.includes('sum(fi.qty_kg)')) return [];
      if (sql.startsWith('select wp.id::text as process_id')) {
        return [
          { process_id: WIP_PROCESS, wip_definition_id: WIP_DEF },
          { process_id: WIP_PROCESS_2, wip_definition_id: WIP_DEF },
        ];
      }
      if (sql.includes('group by wp.wip_definition_id')) {
        return [{ wip_definition_id: WIP_DEF, process_ids: [WIP_PROCESS, WIP_PROCESS_2] }];
      }
      if (sql.startsWith('select h.id, h.version')) return [];
      if (sql.startsWith('select id, version from public.bom_headers')) return [];
      if (sql.startsWith('select coalesce(i.item_code, pc.component_name)')) return [];
      if (sql.startsWith('select pd.id::text as prod_detail_id')) return [];
      if (sql.startsWith('update public.factory_specs')) return [];
      throw new Error(`Unhandled SQL: ${sql}`);
    }, { hasProcessAssignments: true });

    const result = await materializeNpdBom(ctx(client), { projectId: PROJECT });

    expect(result.code).toBe('AMBIGUOUS_WIP_CONSUMPTION');
    expect(result.ambiguousWipDefinitionId).toBe(WIP_DEF);
    expect(result.ambiguousWipProcessIds).toEqual([WIP_PROCESS, WIP_PROCESS_2]);
    expect(result.bomHeaderId).toBeNull();
    expect(client.calls.some((c) => normalize(c.sql).startsWith('insert into public.items'))).toBe(false);
    expect(client.calls.some((c) => normalize(c.sql).startsWith('insert into public.bom_headers'))).toBe(false);
    expect(client.calls.some((c) => normalize(c.sql).startsWith('insert into public.bom_lines'))).toBe(false);
  });

  it('proceeds when only one process has assigned ingredients for a shared WIP definition (F2)', async () => {
    const client = createClient((sql, params) => {
      const rmUsabilityRow = matchRmUsabilityItemLookup(sql, params);
      if (rmUsabilityRow) return rmUsabilityRow;

      if (sql.startsWith('select id, code, name, type, current_gate')) return [projectRow()];
      if (sql.startsWith('select id from public.items where org_id')) return [];
      if (sql.startsWith('select f.id as formulation_id')) {
        return [{ formulation_id: 'form-1', version_id: 'ver-1', version_number: 3, target_yield_pct: '100' }];
      }
      if (isIngredientQuery(sql)) {
        return [
          {
            rm_code: 'RM-FLOUR',
            item_id: RM_FLOUR,
            substitute_item_id: null,
            qty_kg: '1.000000',
            sequence: 1,
            wip_definition_id: null,
            npd_wip_process_id: WIP_PROCESS,
          },
          {
            rm_code: 'WIP-DOUGH',
            item_id: null,
            substitute_item_id: null,
            qty_kg: '2.000000',
            sequence: 2,
            wip_definition_id: WIP_DEF,
            npd_wip_process_id: null,
          },
        ];
      }
      if (sql.startsWith('select wd.id::text as id')) {
        return [{
          id: WIP_DEF,
          item_id: WIP_ITEM,
          item_code: 'WIP-DOUGH',
          name: 'Dough',
          base_uom: 'kg',
          yield_pct: '100',
          version: 1,
        }];
      }
      if (sql.includes('sum(fi.qty_kg)')) return [];
      if (sql.startsWith('select wp.id::text as process_id')) {
        return [{ process_id: WIP_PROCESS, wip_definition_id: WIP_DEF }];
      }
      if (sql.includes('group by wp.wip_definition_id')) return [];
      if (sql.startsWith('select coalesce(fi.item_id, i.id)::text as item_id')) {
        return [{ item_id: RM_FLOUR, item_code: 'RM-FLOUR', qty_per_unit: '1.000000', uom: 'kg', sequence: 1 }];
      }
      if (sql.startsWith('select h.id, h.version')) return [];
      if (sql.startsWith('select id, version from public.bom_headers')) return [];
      if (sql.startsWith('select coalesce(i.item_code, pc.component_name)')) return [];
      if (sql.startsWith('select pd.id::text as prod_detail_id')) return [];
      if (sql.startsWith('insert into public.items')) return [{ id: ITEM, item_code: 'FG-001', name: 'Sliced Ham', shelf_life_days: 30 }];
      if (sql.startsWith('update public.items')) return [];
      if (sql.startsWith('select 1 from public.product')) return [];
      if (sql.startsWith('insert into public.product')) return [];
      if (sql.startsWith('update public.formulations')) return [];
      if (sql.startsWith('select id, wo_reference, status')) return [];
      if (sql.startsWith('update public.product')) return [];
      if (sql.startsWith('select coalesce(max(version)')) return [{ next_version: 1 }];
      if (sql.startsWith('insert into public.bom_headers')) return [{ id: BOM, version: 1 }];
      if (sql.startsWith('insert into public.bom_lines')) return [];
      if (sql.startsWith('update public.bom_headers')) return [];
      if (sql.startsWith('select id, bom_header_id from public.factory_specs')) return [];
      if (sql.startsWith('insert into public.factory_specs')) return [{ id: SPEC }];
      if (sql.startsWith('with recursive parents as')) return [];
      if (sql.startsWith('update public.factory_specs')) return [];
      throw new Error(`Unhandled SQL: ${sql}`);
    }, { hasProcessAssignments: true });

    const result = await materializeNpdBom(ctx(client), { projectId: PROJECT });

    expect(result.code).toBeUndefined();
    expect(result.bomHeaderId).toBe(BOM);
    const fgLineInserts = client.calls.filter(
      (call) => normalize(call.sql).startsWith('insert into public.bom_lines') && call.params.length === 13,
    );
    expect(fgLineInserts).toHaveLength(1);
    expect(fgLineInserts[0]?.params[4]).toBe('WIP-DOUGH');
  });

  it('materializes a process-derived WIP stage on the FG BOM with summed assigned-ingredient qty (R4.3b)', async () => {
    const client = createClient((sql, params) => {
      const rmUsabilityRow = matchRmUsabilityItemLookup(sql, params);
      if (rmUsabilityRow) return rmUsabilityRow;

      if (sql.startsWith('select id, code, name, type, current_gate')) return [projectRow()];
      if (sql.startsWith('select id from public.items where org_id')) return [];
      if (sql.startsWith('select f.id as formulation_id')) {
        return [{ formulation_id: 'form-1', version_id: 'ver-1', version_number: 3, target_yield_pct: '100' }];
      }
      if (isIngredientQuery(sql)) {
        return [
          {
            rm_code: 'RM-FLOUR',
            item_id: RM_FLOUR,
            substitute_item_id: null,
            qty_kg: '1.000000',
            sequence: 1,
            wip_definition_id: null,
            npd_wip_process_id: WIP_PROCESS,
          },
          {
            rm_code: 'RM-SALT',
            item_id: RM_SALT,
            substitute_item_id: null,
            qty_kg: '0.250000',
            sequence: 2,
            wip_definition_id: null,
            npd_wip_process_id: WIP_PROCESS,
          },
        ];
      }
      if (sql.includes('sum(fi.qty_kg)')) {
        return [{
          process_id: WIP_PROCESS,
          wip_definition_id: WIP_DEF,
          qty_kg: '1.250000',
          sequence: 1,
        }];
      }
      if (sql.startsWith('select wp.id::text as process_id')) {
        return [{ process_id: WIP_PROCESS, wip_definition_id: WIP_DEF }];
      }
      if (sql.startsWith('select wd.id::text as id')) {
        return [{
          id: WIP_DEF,
          item_id: WIP_ITEM,
          item_code: 'WIP-MIX',
          name: 'Mix',
          base_uom: 'kg',
          yield_pct: '100',
          version: 1,
        }];
      }
      if (sql.startsWith('select coalesce(fi.item_id, i.id)::text as item_id')) {
        return [
          { item_id: RM_FLOUR, item_code: 'RM-FLOUR', qty_per_unit: '1.000000', uom: 'kg', sequence: 1 },
          { item_id: RM_SALT, item_code: 'RM-SALT', qty_per_unit: '0.250000', uom: 'kg', sequence: 2 },
        ];
      }
      if (sql.startsWith('select h.id, h.version')) return [];
      if (sql.startsWith('select id, version from public.bom_headers')) return [];
      if (sql.startsWith('select coalesce(i.item_code, pc.component_name)')) return [];
      if (sql.startsWith('select pd.id::text as prod_detail_id')) return [];
      if (sql.startsWith('insert into public.items')) return [{ id: ITEM, item_code: 'FG-001', name: 'Sliced Ham', shelf_life_days: 30 }];
      if (sql.startsWith('update public.items')) return [];
      if (sql.startsWith('select 1 from public.product')) return [];
      if (sql.startsWith('insert into public.product')) return [];
      if (sql.startsWith('update public.formulations')) return [];
      if (sql.startsWith('select id, wo_reference, status')) return [];
      if (sql.startsWith('update public.product')) return [];
      if (sql.startsWith('select coalesce(max(version)')) return [{ next_version: 1 }];
      if (sql.startsWith('insert into public.bom_headers')) return [{ id: BOM, version: 1 }];
      if (sql.startsWith('insert into public.bom_lines')) return [];
      if (sql.startsWith('update public.bom_headers')) return [];
      if (sql.startsWith('select id, bom_header_id from public.factory_specs')) return [];
      if (sql.startsWith('insert into public.factory_specs')) return [{ id: SPEC }];
      if (sql.startsWith('with recursive parents as')) return [];
      if (sql.startsWith('update public.factory_specs')) return [];
      throw new Error(`Unhandled SQL: ${sql}`);
    }, { hasProcessAssignments: true });

    await materializeNpdBom(ctx(client), { projectId: PROJECT });

    const fgLineInserts = client.calls.filter(
      (call) => normalize(call.sql).startsWith('insert into public.bom_lines') && call.params.length === 13,
    );
    expect(fgLineInserts).toHaveLength(1);
    expect(fgLineInserts[0]?.params[4]).toBe('WIP-MIX');
    expect(fgLineInserts[0]?.params[5]).toBe('WIP');
    // 1.25 kg/pack × 4 packs/box
    expect(fgLineInserts[0]?.params[6]).toBe('5.000000');
    const assignedChildLines = client.calls.filter(
      (call) => normalize(call.sql).startsWith('insert into public.bom_lines') && call.params[8] === 'npd_process_consumption',
    );
    expect(assignedChildLines).toHaveLength(2);
    expect(assignedChildLines.map((call) => call.params[3])).toEqual(['RM-FLOUR', 'RM-SALT']);
  });

  it('deduplicates when the same wip_definition_id is ingredient-declared and process-derived (ingredient qty wins)', async () => {
    const client = createClient((sql, params) => {
      const rmUsabilityRow = matchRmUsabilityItemLookup(sql, params);
      if (rmUsabilityRow) return rmUsabilityRow;

      if (sql.startsWith('select id, code, name, type, current_gate')) return [projectRow()];
      if (sql.startsWith('select id from public.items where org_id')) return [];
      if (sql.startsWith('select f.id as formulation_id')) {
        return [{ formulation_id: 'form-1', version_id: 'ver-1', version_number: 3, target_yield_pct: '100' }];
      }
      if (isIngredientQuery(sql)) {
        return [
          {
            rm_code: 'RM-FLOUR',
            item_id: RM_FLOUR,
            substitute_item_id: null,
            qty_kg: '1.000000',
            sequence: 1,
            wip_definition_id: null,
            npd_wip_process_id: WIP_PROCESS,
          },
          {
            rm_code: 'WIP-DOUGH',
            item_id: null,
            substitute_item_id: null,
            qty_kg: '3.000000',
            sequence: 2,
            wip_definition_id: WIP_DEF,
            npd_wip_process_id: null,
          },
        ];
      }
      if (sql.includes('sum(fi.qty_kg)')) {
        return [{
          process_id: WIP_PROCESS,
          wip_definition_id: WIP_DEF,
          qty_kg: '1.000000',
          sequence: 1,
        }];
      }
      if (sql.startsWith('select wd.id::text as id')) {
        return [{
          id: WIP_DEF,
          item_id: WIP_ITEM,
          item_code: 'WIP-DOUGH',
          name: 'Dough',
          base_uom: 'kg',
          yield_pct: '100',
          version: 1,
        }];
      }
      if (sql.startsWith('select wp.id::text as process_id')) {
        return [{ process_id: WIP_PROCESS, wip_definition_id: WIP_DEF }];
      }
      if (sql.startsWith('select coalesce(fi.item_id, i.id)::text as item_id')) {
        return [{ item_id: RM_FLOUR, item_code: 'RM-FLOUR', qty_per_unit: '1.000000', uom: 'kg', sequence: 1 }];
      }
      if (sql.startsWith('select h.id, h.version')) return [];
      if (sql.startsWith('select id, version from public.bom_headers')) return [];
      if (sql.startsWith('select coalesce(i.item_code, pc.component_name)')) return [];
      if (sql.startsWith('select pd.id::text as prod_detail_id')) return [];
      if (sql.startsWith('insert into public.items')) return [{ id: ITEM, item_code: 'FG-001', name: 'Sliced Ham', shelf_life_days: 30 }];
      if (sql.startsWith('update public.items')) return [];
      if (sql.startsWith('select 1 from public.product')) return [];
      if (sql.startsWith('insert into public.product')) return [];
      if (sql.startsWith('update public.formulations')) return [];
      if (sql.startsWith('select id, wo_reference, status')) return [];
      if (sql.startsWith('update public.product')) return [];
      if (sql.startsWith('select coalesce(max(version)')) return [{ next_version: 1 }];
      if (sql.startsWith('insert into public.bom_headers')) return [{ id: BOM, version: 1 }];
      if (sql.startsWith('insert into public.bom_lines')) return [];
      if (sql.startsWith('update public.bom_headers')) return [];
      if (sql.startsWith('select id, bom_header_id from public.factory_specs')) return [];
      if (sql.startsWith('insert into public.factory_specs')) return [{ id: SPEC }];
      if (sql.startsWith('with recursive parents as')) return [];
      if (sql.startsWith('update public.factory_specs')) return [];
      throw new Error(`Unhandled SQL: ${sql}`);
    }, { hasProcessAssignments: true });

    await materializeNpdBom(ctx(client), { projectId: PROJECT });

    const fgLineInserts = client.calls.filter(
      (call) => normalize(call.sql).startsWith('insert into public.bom_lines') && call.params.length === 13,
    );
    expect(fgLineInserts).toHaveLength(1);
    expect(fgLineInserts[0]?.params[4]).toBe('WIP-DOUGH');
    // Ingredient-declared 3.0 kg/pack × 4 packs/box — not process-derived sum of 1.0
    expect(fgLineInserts[0]?.params[6]).toBe('12.000000');
  });

  it('ignores a creates_wip_item process with no assigned ingredients (no empty stage)', async () => {
    const client = createClient((sql, params) => {
      const rmUsabilityRow = matchRmUsabilityItemLookup(sql, params);
      if (rmUsabilityRow) return rmUsabilityRow;

      if (sql.startsWith('select id, code, name, type, current_gate')) return [projectRow()];
      if (sql.startsWith('select id from public.items where org_id')) return [];
      if (sql.startsWith('select f.id as formulation_id')) {
        return [{ formulation_id: 'form-1', version_id: 'ver-1', version_number: 3, target_yield_pct: '100' }];
      }
      if (isIngredientQuery(sql)) {
        return [{
          rm_code: 'RM-FLOUR',
          item_id: RM_FLOUR,
          substitute_item_id: null,
          qty_kg: '1.000000',
          sequence: 1,
          wip_definition_id: null,
          npd_wip_process_id: null,
        }];
      }
      if (sql.includes('sum(fi.qty_kg)')) return [];
      if (sql.startsWith('select h.id, h.version')) return [];
      if (sql.startsWith('select id, version from public.bom_headers')) return [];
      if (sql.startsWith('select coalesce(i.item_code, pc.component_name)')) return [];
      if (sql.startsWith('select pd.id::text as prod_detail_id')) return [];
      if (sql.startsWith('insert into public.items')) return [{ id: ITEM, item_code: 'FG-001', name: 'Sliced Ham', shelf_life_days: 30 }];
      if (sql.startsWith('update public.items')) return [];
      if (sql.startsWith('select 1 from public.product')) return [];
      if (sql.startsWith('insert into public.product')) return [];
      if (sql.startsWith('update public.formulations')) return [];
      if (sql.startsWith('select id, wo_reference, status')) return [];
      if (sql.startsWith('update public.product')) return [];
      if (sql.startsWith('select coalesce(max(version)')) return [{ next_version: 1 }];
      if (sql.startsWith('insert into public.bom_headers')) return [{ id: BOM, version: 1 }];
      if (sql.startsWith('insert into public.bom_lines')) return [];
      if (sql.startsWith('update public.bom_headers')) return [];
      if (sql.startsWith('select id, bom_header_id from public.factory_specs')) return [];
      if (sql.startsWith('insert into public.factory_specs')) return [{ id: SPEC }];
      if (sql.startsWith('with recursive parents as')) return [];
      if (sql.startsWith('update public.factory_specs')) return [];
      throw new Error(`Unhandled SQL: ${sql}`);
    });

    await materializeNpdBom(ctx(client), { projectId: PROJECT });

    const fgLineInserts = client.calls.filter(
      (call) => normalize(call.sql).startsWith('insert into public.bom_lines') && call.params.length === 13,
    );
    expect(fgLineInserts).toHaveLength(1);
    expect(fgLineInserts[0]?.params[4]).toBe('RM-FLOUR');
    expect(fgLineInserts[0]?.params[5]).toBe('RM');
    expect(client.calls.some((call) => normalize(call.sql).includes('wp.wip_definition_id = $2::uuid'))).toBe(false);
  });

  it('rejects FG BOM activation when lines would create a cycle (V-TEC-13)', async () => {
    const client = createClient((sql, params) => {
      const rmUsabilityRow = matchRmUsabilityItemLookup(sql, params);
      if (rmUsabilityRow) return rmUsabilityRow;

      if (sql.startsWith('select id, code, name, type, current_gate')) return [projectRow()];
      if (sql.startsWith('select id from public.items where org_id')) return [];
      if (sql.startsWith('select f.id as formulation_id')) {
        return [{ formulation_id: 'form-1', version_id: 'ver-1', version_number: 3, target_yield_pct: '100' }];
      }
      if (isIngredientQuery(sql)) {
        return [{
          rm_code: 'FG-001',
          item_id: ITEM,
          substitute_item_id: null,
          qty_kg: '1.000000',
          sequence: 1,
          wip_definition_id: null,
          npd_wip_process_id: null,
        }];
      }
      if (sql.startsWith('select h.id, h.version')) return [];
      if (sql.startsWith('select id, version from public.bom_headers')) return [];
      if (sql.startsWith('select coalesce(i.item_code, pc.component_name)')) return [];
      if (sql.startsWith('select pd.id::text as prod_detail_id')) return [];
      if (sql.startsWith('insert into public.items')) return [{ id: ITEM, item_code: 'FG-001', name: 'Sliced Ham', shelf_life_days: 30 }];
      if (sql.startsWith('update public.items')) return [];
      if (sql.startsWith('select 1 from public.product')) return [];
      if (sql.startsWith('insert into public.product')) return [];
      if (sql.startsWith('update public.formulations')) return [];
      if (sql.startsWith('select id, wo_reference, status')) return [];
      if (sql.startsWith('update public.product')) return [];
      if (sql.startsWith('select coalesce(max(version)')) return [{ next_version: 1 }];
      if (sql.startsWith('insert into public.bom_headers')) return [{ id: BOM, version: 1 }];
      if (sql.startsWith('insert into public.bom_lines')) return [];
      throw new Error(`Unhandled SQL: ${sql}`);
    });

    await expect(materializeNpdBom(ctx(client), { projectId: PROJECT })).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof NpdBomActivationValidationError &&
        error.code === 'V-TEC-13' &&
        error.message.includes('cycle'),
    );

    const activeFlip = client.calls.find(
      (call) => normalize(call.sql).includes("set status = 'active'") && normalize(call.sql).includes("technical_approved"),
    );
    expect(activeFlip).toBeUndefined();
  });

  it('emits fg.bom.released when a new FG BOM is activated', async () => {
    const client = createClient((sql, params) => {
      const rmUsabilityRow = matchRmUsabilityItemLookup(sql, params);
      if (rmUsabilityRow) return rmUsabilityRow;

      if (sql.startsWith('select id, code, name, type, current_gate')) return [projectRow()];
      if (sql.startsWith('select f.id as formulation_id')) {
        return [{ formulation_id: 'form-1', version_id: 'ver-1', version_number: 3, target_yield_pct: '98.500' }];
      }
      if (isIngredientQuery(sql)) {
        return [{ rm_code: 'RM-001', item_id: RM_FLOUR, qty_kg: '1.250000', sequence: 1 }];
      }
      if (sql.startsWith('insert into public.items')) {
        return [{ id: ITEM, item_code: 'FG-001', name: 'Sliced Ham', shelf_life_days: 30 }];
      }
      if (sql.startsWith('update public.items')) return [];
      if (sql.startsWith('select 1 from public.product')) return [];
      if (sql.startsWith('insert into public.product')) return [];
      if (sql.startsWith('update public.formulations')) return [];
      if (sql.startsWith('select id, wo_reference, status')) return [];
      if (sql.startsWith('update public.product')) return [];
      if (sql.startsWith('select h.id, h.version')) return [];
      if (sql.startsWith('select id, version from public.bom_headers')) return [];
      if (sql.startsWith('select coalesce(i.item_code, pc.component_name)')) return [];
      if (sql.startsWith('select pd.id::text as prod_detail_id')) return [];
      if (sql.startsWith('select coalesce(max(version)')) return [{ next_version: 1 }];
      if (sql.startsWith('insert into public.bom_headers')) return [{ id: BOM, version: 1 }];
      if (sql.startsWith('insert into public.bom_lines')) return [];
      if (sql.startsWith('update public.bom_headers')) return [];
      if (sql.startsWith('select id, bom_header_id from public.factory_specs')) return [];
      if (sql.startsWith('insert into public.factory_specs')) return [{ id: SPEC }];
      if (sql.startsWith('select id from public.items where org_id')) return [];
      if (sql.startsWith('with recursive parents as')) return [];
      if (sql.startsWith('update public.factory_specs')) return [];
      throw new Error(`Unhandled SQL: ${sql}`);
    });

    await materializeNpdBom(ctx(client), { projectId: PROJECT });

    const outboxInsert = client.calls.find((call) => normalize(call.sql).startsWith('insert into public.outbox_events'));
    expect(outboxInsert).toBeDefined();
    expect(outboxInsert?.params[1]).toBe(FG_BOM_RELEASED_EVENT);
    expect(outboxInsert?.params[2]).toBe('bom_header');
    expect(outboxInsert?.params[3]).toBe(BOM);
    const payload = JSON.parse(String(outboxInsert?.params[4]));
    expect(payload).toMatchObject({
      product_id: 'FG-001',
      version: 1,
      status: 'active',
      superseded_header_ids: [],
      actor_user_id: USER,
    });
  });

  const SAME_ORG_INGREDIENT = {
    rm_code: 'RM-001',
    item_id: null,
    substitute_item_id: null,
    qty_kg: '1.250000',
    sequence: 1,
    wip_definition_id: null,
    npd_wip_process_id: null,
  };

  const CROSS_ORG_INGREDIENT = {
    rm_code: 'RM-EVIL-CROSS-ORG',
    item_id: null,
    substitute_item_id: null,
    qty_kg: '9.990000',
    sequence: 99,
    wip_definition_id: null,
    npd_wip_process_id: null,
  };

  function createOrgScopedMaterializationClient(options?: {
    hasProcessAssignments?: boolean;
    crossOrgPoisonInIngredients?: boolean;
    crossOrgPoisonInProcessAssignments?: boolean;
  }) {
    return createClient((sql, params) => {
      const rmUsabilityRow = matchRmUsabilityItemLookup(sql, params);
      if (rmUsabilityRow) return rmUsabilityRow;

      if (sql.startsWith('select id, code, name, type, current_gate')) return [projectRow()];
      if (sql.startsWith('select id from public.items where org_id')) return [];
      if (sql.startsWith('select f.id as formulation_id')) {
        return [{ formulation_id: 'form-1', version_id: 'ver-1', version_number: 3, target_yield_pct: '98.500' }];
      }
      if (isIngredientQuery(sql)) {
        const orgScoped = sql.includes('f.org_id = app.current_org_id()');
        if (!orgScoped && options?.crossOrgPoisonInIngredients) {
          return [CROSS_ORG_INGREDIENT];
        }
        return [SAME_ORG_INGREDIENT];
      }
      if (sql.startsWith('insert into public.items')) {
        return [{ id: ITEM, item_code: 'FG-001', name: 'Sliced Ham', shelf_life_days: 30 }];
      }
      if (sql.startsWith('update public.items')) return [];
      if (sql.startsWith('select 1 from public.product')) return [];
      if (sql.startsWith('insert into public.product')) return [];
      if (sql.startsWith('update public.formulations')) return [];
      if (sql.startsWith('select id, wo_reference, status')) return [];
      if (sql.startsWith('update public.product')) return [];
      if (sql.startsWith('select h.id, h.version')) return [];
      if (sql.startsWith('select id, version from public.bom_headers')) return [];
      if (sql.startsWith('select coalesce(i.item_code, pc.component_name)')) return [];
      if (sql.startsWith('select pd.id::text as prod_detail_id')) return [];
      if (sql.startsWith('select coalesce(max(version)')) return [{ next_version: 1 }];
      if (sql.startsWith('insert into public.bom_headers')) return [{ id: BOM, version: 1 }];
      if (sql.startsWith('insert into public.bom_lines')) return [];
      if (sql.startsWith('update public.bom_headers')) return [];
      if (sql.startsWith('select id, bom_header_id from public.factory_specs')) return [];
      if (sql.startsWith('insert into public.factory_specs')) return [{ id: SPEC }];
      if (sql.startsWith('select id from public.items where org_id')) return [];
      if (sql.startsWith('with recursive parents as')) return [];
      if (sql.startsWith('update public.factory_specs')) return [];
      throw new Error(`Unhandled SQL: ${sql}`);
    }, {
      hasProcessAssignments: options?.hasProcessAssignments ?? false,
      crossOrgPoisonInProcessAssignments: options?.crossOrgPoisonInProcessAssignments,
    });
  }

  it('P2-03: loadIngredients scopes formulation_ingredients through formulations.org_id', async () => {
    const client = createOrgScopedMaterializationClient();

    await materializeNpdBom(ctx(client), { projectId: PROJECT });

    const ingredientQuery = client.calls.find((call) => isIngredientQuery(call.sql));
    expect(ingredientQuery?.sql).toContain('formulation_ingredients fi');
    expect(ingredientQuery?.sql).toContain('formulation_versions fv');
    expect(ingredientQuery?.sql).toContain('formulations f');
    expect(ingredientQuery?.sql).toContain('f.org_id = app.current_org_id()');
  });

  it('P2-03: does not materialize cross-org formulation_ingredients even when version_id is spoofed', async () => {
    const client = createOrgScopedMaterializationClient({ crossOrgPoisonInIngredients: true });

    await materializeNpdBom(ctx(client), { projectId: PROJECT });

    const bomLineInserts = client.calls.filter((call) => normalize(call.sql).startsWith('insert into public.bom_lines'));
    expect(bomLineInserts).toHaveLength(1);
    expect(bomLineInserts[0]?.params[4]).toBe('RM-001');
    expect(bomLineInserts.every((call) => call.params[4] !== CROSS_ORG_INGREDIENT.rm_code)).toBe(true);
  });

  it('P2-04: formulationHasProcessAssignments scopes formulation_ingredients through formulations.org_id', async () => {
    const client = createClient((sql, params) => {
      const rmUsabilityRow = matchRmUsabilityItemLookup(sql, params);
      if (rmUsabilityRow) return rmUsabilityRow;

      if (sql.startsWith('select id, code, name, type, current_gate')) return [projectRow()];
      if (sql.startsWith('select id from public.items where org_id')) return [];
      if (sql.startsWith('select f.id as formulation_id')) {
        return [{ formulation_id: 'form-1', version_id: 'ver-1', version_number: 3, target_yield_pct: '100' }];
      }
      if (isIngredientQuery(sql)) {
        return [{
          rm_code: 'RM-FLOUR',
          item_id: RM_FLOUR,
          substitute_item_id: null,
          qty_kg: '1.000000',
          sequence: 1,
          wip_definition_id: null,
          npd_wip_process_id: WIP_PROCESS,
        }];
      }
      if (sql.includes('sum(fi.qty_kg)')) return [];
      if (sql.startsWith('select wp.id::text as process_id')) {
        return [{ process_id: WIP_PROCESS, wip_definition_id: WIP_DEF }];
      }
      if (sql.startsWith('select wd.id::text as id')) {
        return [{
          id: WIP_DEF,
          item_id: WIP_ITEM,
          item_code: 'WIP-DOUGH',
          name: 'Dough',
          base_uom: 'kg',
          yield_pct: '100',
          version: 1,
        }];
      }
      if (sql.startsWith('select coalesce(fi.item_id, i.id)::text as item_id')) {
        return [{ item_id: RM_FLOUR, item_code: 'RM-FLOUR', qty_per_unit: '1.000000', uom: 'kg', sequence: 1 }];
      }
      if (sql.startsWith('select h.id, h.version')) return [];
      if (sql.startsWith('select id, version from public.bom_headers')) return [];
      if (sql.startsWith('select coalesce(i.item_code, pc.component_name)')) return [];
      if (sql.startsWith('select pd.id::text as prod_detail_id')) return [];
      if (sql.startsWith('insert into public.items')) return [{ id: ITEM, item_code: 'FG-001', name: 'Sliced Ham', shelf_life_days: 30 }];
      if (sql.startsWith('update public.items')) return [];
      if (sql.startsWith('select 1 from public.product')) return [];
      if (sql.startsWith('insert into public.product')) return [];
      if (sql.startsWith('update public.formulations')) return [];
      if (sql.startsWith('select id, wo_reference, status')) return [];
      if (sql.startsWith('update public.product')) return [];
      if (sql.startsWith('select coalesce(max(version)')) return [{ next_version: 1 }];
      if (sql.startsWith('insert into public.bom_headers')) return [{ id: BOM, version: 1 }];
      if (sql.startsWith('insert into public.bom_lines')) return [];
      if (sql.startsWith('update public.bom_headers')) return [];
      if (sql.startsWith('select id, bom_header_id from public.factory_specs')) return [];
      if (sql.startsWith('insert into public.factory_specs')) return [{ id: SPEC }];
      if (sql.startsWith('with recursive parents as')) return [];
      if (sql.startsWith('update public.factory_specs')) return [];
      throw new Error(`Unhandled SQL: ${sql}`);
    }, { hasProcessAssignments: true });

    await materializeNpdBom(ctx(client), { projectId: PROJECT });

    const readinessQuery = client.calls.find((call) => normalize(call.sql).includes('has_assignments'));
    expect(readinessQuery?.sql).toContain('formulation_versions fv');
    expect(readinessQuery?.sql).toContain('formulations f');
    expect(readinessQuery?.sql).toContain('f.org_id = app.current_org_id()');
  });

  it('P2-04: formulationHasProcessAssignments ignores cross-org process assignments on spoofed version_id', async () => {
    const client = createClient((sql, params) => {
      const rmUsabilityRow = matchRmUsabilityItemLookup(sql, params);
      if (rmUsabilityRow) return rmUsabilityRow;

      if (sql.startsWith('select id, code, name, type, current_gate')) return [projectRow()];
      if (sql.startsWith('select id from public.items where org_id')) return [];
      if (sql.startsWith('select f.id as formulation_id')) {
        return [{ formulation_id: 'form-1', version_id: 'ver-1', version_number: 3, target_yield_pct: '100' }];
      }
      if (isIngredientQuery(sql)) {
        return [SAME_ORG_INGREDIENT];
      }
      if (sql.startsWith('select h.id, h.version')) return [];
      if (sql.startsWith('select id, version from public.bom_headers')) return [];
      if (sql.startsWith('select coalesce(i.item_code, pc.component_name)')) return [];
      if (sql.startsWith('select pd.id::text as prod_detail_id')) return [];
      if (sql.startsWith('insert into public.items')) return [{ id: ITEM, item_code: 'FG-001', name: 'Sliced Ham', shelf_life_days: 30 }];
      if (sql.startsWith('update public.items')) return [];
      if (sql.startsWith('select 1 from public.product')) return [];
      if (sql.startsWith('insert into public.product')) return [];
      if (sql.startsWith('update public.formulations')) return [];
      if (sql.startsWith('select id, wo_reference, status')) return [];
      if (sql.startsWith('update public.product')) return [];
      if (sql.startsWith('select coalesce(max(version)')) return [{ next_version: 1 }];
      if (sql.startsWith('insert into public.bom_headers')) return [{ id: BOM, version: 1 }];
      if (sql.startsWith('insert into public.bom_lines')) return [];
      if (sql.startsWith('update public.bom_headers')) return [];
      if (sql.startsWith('select id, bom_header_id from public.factory_specs')) return [];
      if (sql.startsWith('insert into public.factory_specs')) return [{ id: SPEC }];
      if (sql.startsWith('with recursive parents as')) return [];
      if (sql.startsWith('update public.factory_specs')) return [];
      throw new Error(`Unhandled SQL: ${sql}`);
    }, {
      hasProcessAssignments: true,
      crossOrgPoisonInProcessAssignments: true,
    });

    await materializeNpdBom(ctx(client), { projectId: PROJECT });

    expect(client.calls.some((call) => normalize(call.sql).includes('wp.wip_definition_id = $2::uuid'))).toBe(false);
    expect(client.calls.some((call) => normalize(call.sql).includes('from public.wip_definition_ingredients'))).toBe(false);
  });

  it('org-scoping invariance: same-org materialize output is byte-identical to pre-fix canonical fixture', async () => {
    const client = createOrgScopedMaterializationClient();

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
    const bomLineInserts = client.calls.filter((call) => normalize(call.sql).startsWith('insert into public.bom_lines'));
    expect(bomLineInserts).toHaveLength(1);
    expect(bomLineInserts[0]?.params).toEqual([
      BOM,
      1,
      null,
      null,
      'RM-001',
      'RM',
      '5.000000',
      'kg',
      '0.00',
      'NPD formulation',
      1,
      false,
      'npd_locked_formulation',
    ]);
  });
});
