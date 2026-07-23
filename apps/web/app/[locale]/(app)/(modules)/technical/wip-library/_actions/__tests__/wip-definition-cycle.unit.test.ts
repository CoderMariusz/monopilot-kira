import { beforeEach, describe, expect, it, vi } from 'vitest';

import { saveWipDefinition } from '../wip-definition-actions';
import { detectWipDefinitionCompositionCycle } from '../wip-definition-cycle';

const queryMock = vi.fn();

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: <T,>(fn: (ctx: unknown) => Promise<T>) =>
    fn({
      userId: '11111111-1111-4111-8111-111111111111',
      orgId: '22222222-2222-4222-8222-222222222222',
      client: { query: queryMock },
    }),
}));

vi.mock('../../../../../../../../lib/auth/has-permission', () => ({
  hasPermission: vi.fn(async () => true),
  hasAnyPermission: vi.fn(async () => true),
}));

vi.mock('../../../../../../../../lib/documents/code-mask', () => ({
  nextEntityCode: vi.fn(async () => 'WIP-CYCLE-001'),
}));

const definitionId = '33333333-3333-4333-8333-333333333333';
const definitionItemId = '44444444-4444-4444-8444-444444444444';
const wipBItemId = '55555555-5555-4555-8555-555555555555';
const wipAItemId = '66666666-6666-4666-8666-666666666666';
const rawItemId = '77777777-7777-4777-8777-777777777777';

function baseDefinitionRow() {
  return {
    id: definitionId,
    item_id: definitionItemId,
    version: 2,
    status: 'draft',
    name: 'Cycle test',
    description: null,
    base_uom: 'kg',
    yield_pct: '100.000',
    reusable: true,
    source_project_id: null,
  };
}

function installDefinitionSaveMocks(compositionEdges: Array<{ parent: string; component: string }>) {
  queryMock.mockImplementation(async (sql: string) => {
    const text = String(sql);
    if (/pg_advisory_xact_lock/i.test(text)) {
      return { rows: [{ pg_advisory_xact_lock: true }] };
    }
    if (/select id, item_id, version, status, name, description, base_uom, yield_pct, reusable/i.test(text)) {
      return { rows: [baseDefinitionRow()] };
    }
    if (/select item_id as "itemId", qty_per_unit as "qtyPerUnit"/i.test(text)) {
      return { rows: [{ itemId: rawItemId, qtyPerUnit: '1.000000', uom: 'kg', sequence: 0 }] };
    }
    if (/from public\.wip_definition_processes/i.test(text) && /process_name as "processName"/i.test(text)) {
      return { rows: [] };
    }
    if (/select wd\.item_id::text as parent/i.test(text)) {
      return { rows: compositionEdges };
    }
    if (/update public\.wip_definitions/i.test(text)) {
      return { rows: [{ id: definitionId, version: 2 }], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  });
}

beforeEach(() => {
  queryMock.mockReset();
});

describe('wip definition composition cycle guards', () => {
  it('detects direct self-reference and A→B→A multi-node cycles in pure graph logic', () => {
    expect(
      detectWipDefinitionCompositionCycle([], definitionItemId, [definitionItemId]),
    ).toBe(true);

    const edges = [{ parent: wipBItemId, component: wipAItemId }];
    expect(detectWipDefinitionCompositionCycle(edges, wipAItemId, [wipBItemId])).toBe(true);
    expect(detectWipDefinitionCompositionCycle(edges, wipBItemId, [rawItemId])).toBe(false);
  });

  it('rejects saveWipDefinition on self-reference before persisting ingredients', async () => {
    installDefinitionSaveMocks([]);

    const result = await saveWipDefinition({
      id: definitionId,
      name: 'Cycle test',
      baseUom: 'kg',
      yieldPct: 100,
      reusable: true,
      ingredients: [{ itemId: definitionItemId, qtyPerUnit: 1, uom: 'kg', sequence: 0 }],
      processes: [],
    });

    expect(result).toEqual({
      ok: false,
      error: 'WIP definition composition would introduce a cycle',
      code: 'WIP_DEFINITION_CYCLE',
      status: 409,
    });
    const lockIdx = queryMock.mock.calls.findIndex((call) =>
      /pg_advisory_xact_lock/i.test(String(call[0])),
    );
    const edgeIdx = queryMock.mock.calls.findIndex((call) => /select wd\.item_id::text as parent/i.test(String(call[0])));
    expect(lockIdx).toBeGreaterThanOrEqual(0);
    expect(edgeIdx).toBeGreaterThan(lockIdx);
    expect(queryMock.mock.calls.some((call) => /update public\.wip_definitions/i.test(String(call[0])))).toBe(false);
    expect(queryMock.mock.calls.some((call) => /insert into public\.wip_definition_ingredients/i.test(String(call[0])))).toBe(
      false,
    );
  });

  it('rejects saveWipDefinition on multi-node WIP loop before persisting ingredients', async () => {
    installDefinitionSaveMocks([{ parent: wipBItemId, component: definitionItemId }]);

    const result = await saveWipDefinition({
      id: definitionId,
      name: 'Cycle test',
      baseUom: 'kg',
      yieldPct: 100,
      reusable: true,
      ingredients: [{ itemId: wipBItemId, qtyPerUnit: 1, uom: 'kg', sequence: 0 }],
      processes: [],
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'WIP_DEFINITION_CYCLE',
      status: 409,
    });
    expect(queryMock.mock.calls.some((call) => /update public\.wip_definitions/i.test(String(call[0])))).toBe(false);
    expect(queryMock.mock.calls.some((call) => /insert into public\.wip_definition_ingredients/i.test(String(call[0])))).toBe(
      false,
    );
  });
});
