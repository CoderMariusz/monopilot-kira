import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
const nextEntityCodeMock = vi.fn();
const materializeNpdBomMock = vi.fn();

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: <T,>(fn: (ctx: unknown) => Promise<T>) =>
    fn({
      userId: '11111111-1111-4111-8111-111111111111',
      orgId: '22222222-2222-4222-8222-222222222222',
      client: { query: queryMock },
    }),
}));

vi.mock('../../../../../../../lib/auth/has-permission', () => ({
  hasPermission: vi.fn(async () => true),
  hasAnyPermission: vi.fn(async () => true),
}));

vi.mock('../../../../../../../lib/documents/code-mask', () => ({
  nextEntityCode: (...args: unknown[]) => nextEntityCodeMock(...args),
}));

vi.mock('../../../../../../(npd)/pipeline/_actions/_lib/materialize-npd-bom', () => ({
  materializeNpdBom: (...args: unknown[]) => materializeNpdBomMock(...args),
}));

import { addWipProcess } from '../../../../../../(npd)/fa/actions/wip-process-actions';
import { archiveWipDefinition, saveWipDefinition } from './wip-definition-actions';

const definitionId = '33333333-3333-4333-8333-333333333333';
const successorDefinitionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const itemId = '44444444-4444-4444-8444-444444444444';
const ingredientItemId = '55555555-5555-4555-8555-555555555555';
const processId = '66666666-6666-4666-8666-666666666666';
const definitionItemId = '77777777-7777-4777-8777-777777777777';
const prodDetailId = '88888888-8888-4888-8888-888888888888';

beforeEach(() => {
  nextEntityCodeMock.mockResolvedValue('WIP-20260703-0001');
  materializeNpdBomMock.mockResolvedValue({ projectId: 'p', productCode: null, productionCode: null });
});

afterEach(() => {
  queryMock.mockReset();
  nextEntityCodeMock.mockReset();
  materializeNpdBomMock.mockReset();
});

describe('wip definition actions', () => {
  it('bumps version only when persisted content changes', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/select id, item_id, version, status, name, description, base_uom, yield_pct, reusable/i.test(text)) {
        return {
          rows: [{
            id: definitionId,
            item_id: itemId,
            version: 2,
            status: 'draft',
            name: 'Sauce base',
            description: null,
            base_uom: 'kg',
            yield_pct: '95.000',
            reusable: true,
          }],
        };
      }
      if (/select item_id as "itemId", qty_per_unit as "qtyPerUnit"/i.test(text)) {
        return { rows: [{ itemId: ingredientItemId, qtyPerUnit: '1.250000', uom: 'kg', sequence: 0 }] };
      }
      if (/from public\.wip_definition_processes/i.test(text) && /process_name as "processName"/i.test(text)) {
        return { rows: [] };
      }
      if (/update public\.wip_definitions/i.test(text)) {
        return { rows: [{ id: definitionId, version: 2 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    const unchanged = await saveWipDefinition({
      id: definitionId,
      name: 'Sauce base',
      baseUom: 'kg',
      yieldPct: 95,
      reusable: true,
      ingredients: [{ itemId: ingredientItemId, qtyPerUnit: 1.25, uom: 'kg', sequence: 0 }],
      processes: [],
    });

    expect(unchanged).toEqual({ ok: true, id: definitionId, version: 2 });
    expect(updateDefinitionParams()?.[7]).toBe(2);
    expect(hasOutboxInsert()).toBe(false);

    queryMock.mockClear();
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/select id, item_id, version, status, name, description, base_uom, yield_pct, reusable/i.test(text)) {
        return {
          rows: [{
            id: definitionId,
            item_id: itemId,
            version: 2,
            status: 'draft',
            name: 'Sauce base',
            description: null,
            base_uom: 'kg',
            yield_pct: '95.000',
            reusable: true,
          }],
        };
      }
      if (/select item_id as "itemId", qty_per_unit as "qtyPerUnit"/i.test(text)) {
        return { rows: [{ itemId: ingredientItemId, qtyPerUnit: '1.250000', uom: 'kg', sequence: 0 }] };
      }
      if (/from public\.wip_definition_processes/i.test(text) && /process_name as "processName"/i.test(text)) {
        return { rows: [] };
      }
      if (/update public\.wip_definitions/i.test(text)) {
        return { rows: [{ id: definitionId, version: 3 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    const changed = await saveWipDefinition({
      id: definitionId,
      name: 'Sauce base v2',
      baseUom: 'kg',
      yieldPct: 95,
      reusable: true,
      ingredients: [{ itemId: ingredientItemId, qtyPerUnit: 1.25, uom: 'kg', sequence: 0 }],
      processes: [],
    });

    expect(changed).toEqual({ ok: true, id: definitionId, version: 3 });
    expect(updateDefinitionParams()?.[7]).toBe(3);
    expect(hasOutboxInsert()).toBe(true);
  });

  it('fans update notifications through a deduped created_by project query', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/for update/i.test(text) && /public\.wip_definitions/i.test(text)) {
        return { rows: [{ id: definitionId }], rowCount: 1 };
      }
      if (/select id, item_id, version, status, name, description, base_uom, yield_pct, reusable/i.test(text)) {
        return {
          rows: [{
            id: definitionId,
            item_id: itemId,
            version: 7,
            status: 'active',
            name: 'Old name',
            description: null,
            base_uom: 'kg',
            yield_pct: '100.000',
            reusable: true,
            source_project_id: null,
          }],
        };
      }
      if (/select item_id as "itemId", qty_per_unit as "qtyPerUnit"/i.test(text)) return { rows: [] };
      if (/from public\.wip_definition_processes/i.test(text) && /process_name as "processName"/i.test(text)) return { rows: [] };
      if (/insert into public\.wip_definitions/i.test(text) && /supersedes_wip_definition_id/i.test(text)) {
        return { rows: [{ id: successorDefinitionId, version: 8 }], rowCount: 1 };
      }
      if (/update public\.wip_definitions/i.test(text) && /set status = 'archived'/i.test(text)) {
        return { rows: [], rowCount: 1 };
      }
      if (/update public\.wip_definitions/i.test(text) && /set status = 'active'/i.test(text)) {
        return { rows: [], rowCount: 1 };
      }
      if (/delete from public\.wip_definition_ingredients/i.test(text)) return { rows: [], rowCount: 1 };
      if (/delete from public\.wip_definition_processes/i.test(text)) return { rows: [], rowCount: 1 };
      if (/delete from public\.item_allergen_profiles/i.test(text)) return { rows: [], rowCount: 1 };
      if (/insert into public\.outbox_events/i.test(text)) return { rows: [], rowCount: 1 };
      if (/insert into public\.user_notifications/i.test(text)) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });

    await saveWipDefinition({
      id: definitionId,
      name: 'New name',
      baseUom: 'kg',
      yieldPct: 100,
      reusable: true,
      ingredients: [],
      processes: [],
    });

    const notificationSql = queryMock.mock.calls
      .map((call) => String(call[0]))
      .find((sql) => /insert into public\.user_notifications/i.test(sql));
    expect(notificationSql).toMatch(/select distinct app\.current_org_id\(\)/i);
    expect(notificationSql).toContain('p.created_by_user is not null');
  });

  it('persists per-process yield percentages from WIP definition saves', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/insert into public\.items/i.test(text)) return { rows: [{ id: itemId }], rowCount: 1 };
      if (/insert into public\.wip_definitions/i.test(text)) return { rows: [{ id: definitionId, version: 1 }], rowCount: 1 };
      if (/insert into public\.wip_definition_processes/i.test(text)) return { rows: [{ id: processId }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });

    const result = await saveWipDefinition({
      name: 'Sauce base',
      baseUom: 'kg',
      yieldPct: 100,
      reusable: true,
      ingredients: [],
      processes: [{
        processName: 'Smoke',
        displayOrder: 1,
        durationHours: 1,
        additionalCost: 0,
        throughputPerHour: 10,
        throughputUom: 'kg',
        setupCost: 0,
        yieldPct: 95,
        roles: [],
      }],
    } as Parameters<typeof saveWipDefinition>[0]);

    expect(result).toEqual({ ok: true, id: definitionId, version: 1 });
    const processInsert = queryMock.mock.calls.find((call) => /insert into public\.wip_definition_processes/i.test(String(call[0])));
    expect(String(processInsert?.[0])).toMatch(/yield_pct/i);
    expect(processInsert?.[1]?.[8]).toBe(95);
  });

  it('returns per-process yield percentages when loading WIP definition detail', async () => {
    const { getWipDefinition } = await import('./wip-definition-actions');
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/select id, item_id, version, status, name, description, base_uom, yield_pct, reusable, source_project_id/i.test(text)) {
        return {
          rows: [{
            id: definitionId,
            item_id: itemId,
            version: 2,
            status: 'active',
            name: 'Sauce base',
            description: null,
            base_uom: 'kg',
            yield_pct: '100.000',
            reusable: true,
            source_project_id: null,
          }],
        };
      }
      if (/from public\.wip_definitions d/i.test(text) && /limit 1/i.test(text)) {
        return { rows: [{ id: definitionId, name: 'Sauce base', item_code: 'WIP-1' }] };
      }
      if (/from public\.wip_definition_ingredients/i.test(text)) return { rows: [] };
      if (/from public\.wip_definition_processes/i.test(text) && /yield_pct as "yieldPct"/i.test(text)) {
        return { rows: [{ id: processId, processName: 'Smoke', yieldPct: '95.000' }] };
      }
      if (/from public\.wip_definition_roles/i.test(text)) return { rows: [] };
      if (/from public\.formulation_ingredients/i.test(text)) return { rows: [] };
      return { rows: [], rowCount: 1 };
    });

    const result = await getWipDefinition(definitionId);

    expect(result.ok).toBe(true);
    expect((result as { processes: Array<Record<string, unknown>> }).processes[0]?.yieldPct).toBe('95.000');
  });

  it('resolves archived definition ids to the current active successor with its ingredients', async () => {
    const archivedId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const { getWipDefinition } = await import('./wip-definition-actions');

    queryMock.mockImplementation(async (sql: string, params?: readonly unknown[]) => {
      const text = String(sql);
      if (/select id, item_id, version, status, name, description, base_uom, yield_pct, reusable, source_project_id/i.test(text) && params?.[0] === archivedId) {
        return {
          rows: [{
            id: archivedId,
            item_id: itemId,
            version: 1,
            status: 'archived',
            name: 'WIP-019',
            description: null,
            base_uom: 'kg',
            yield_pct: '100.000',
            reusable: true,
            source_project_id: null,
          }],
        };
      }
      if (/and lower\(wip\.name\) = lower/i.test(text) && /wip\.status = 'active'/i.test(text)) {
        return {
          rows: [{
            id: successorDefinitionId,
            item_id: itemId,
            version: 3,
            status: 'active',
            name: 'WIP-019',
            description: null,
            base_uom: 'kg',
            yield_pct: '100.000',
            reusable: true,
            source_project_id: null,
          }],
        };
      }
      if (/from public\.wip_definitions d/i.test(text) && params?.[0] === successorDefinitionId) {
        return {
          rows: [{
            id: successorDefinitionId,
            name: 'WIP-019',
            version: 3,
            status: 'active',
            item_code: 'WIP-20260714-0011',
          }],
        };
      }
      if (/from public\.wip_definition_ingredients/i.test(text) && params?.[0] === successorDefinitionId) {
        return {
          rows: [{
            id: 'ingredient-row-1',
            itemId: ingredientItemId,
            itemCode: 'RM-BUTTER',
            name: 'Butter',
            qtyPerUnit: '0.200000',
            uom: 'kg',
            sequence: 0,
          }],
        };
      }
      if (/from public\.wip_definition_processes/i.test(text)) return { rows: [] };
      if (/from public\.wip_definition_roles/i.test(text)) return { rows: [] };
      if (/from public\.formulation_ingredients/i.test(text)) return { rows: [] };
      return { rows: [], rowCount: 1 };
    });

    const result = await getWipDefinition(archivedId);

    expect(result).toMatchObject({
      ok: true,
      resolvedFromId: archivedId,
    });
    expect((result as { definition: { id: string; version: number } }).definition).toMatchObject({
      id: successorDefinitionId,
      version: 3,
      status: 'active',
    });
    expect((result as { ingredients: Array<{ itemCode: string }> }).ingredients).toHaveLength(1);
    expect((result as { ingredients: Array<{ itemCode: string }> }).ingredients[0]?.itemCode).toBe('RM-BUTTER');
    expect(
      queryMock.mock.calls.some(
        (call) =>
          /from public\.wip_definition_ingredients/i.test(String(call[0])) &&
          call[1]?.[0] === successorDefinitionId,
      ),
    ).toBe(true);
  });

  it('blocks archive with a typed 409 while non-launched projects reference the definition', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (/count\(distinct f\.project_id\)/i.test(String(sql))) return { rows: [{ count: '1' }] };
      return { rows: [], rowCount: 0 };
    });

    const result = await archiveWipDefinition({ id: definitionId });

    expect(result).toEqual({
      ok: false,
      error: 'WIP definition is referenced by non-archived projects',
      code: 'WIP_DEFINITION_IN_USE',
      status: 409,
    });
    expect(queryMock.mock.calls.some((call) => /update public\.wip_definitions/i.test(String(call[0])))).toBe(false);
  });
});

describe('ensureWipItem v2 through addWipProcess', () => {
  it('reuses wip_definition.item_id when the process is linked to a definition', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/insert\s+into\s+public\.npd_wip_processes/i.test(text)) return { rows: [{ id: processId }], rowCount: 1 };
      if (/select p\.wip_item_id,\s*p\.wip_definition_id/i.test(text)) {
        return {
          rows: [{
            wip_item_id: null,
            wip_definition_id: definitionId,
            definition_item_id: definitionItemId,
            definition_base_uom: 'g',
            definition_name: 'Definition item',
          }],
        };
      }
      if (/from public\.items/i.test(text) && /id = \$1::uuid/i.test(text)) return { rows: [{ id: definitionItemId }] };
      if (/update public\.npd_wip_processes/i.test(text)) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });

    const result = await addWipProcess({
      prodDetailId,
      processName: 'Linked process',
      createsWipItem: true,
    });

    expect(result).toEqual({ ok: true, id: processId });
    expect(nextEntityCodeMock).not.toHaveBeenCalled();
    expect(queryMock.mock.calls.some((call) => /insert into public\.items/i.test(String(call[0])))).toBe(false);
    const linkCall = queryMock.mock.calls.find((call) => /update public\.npd_wip_processes/i.test(String(call[0])));
    expect(linkCall?.[1]).toEqual([processId, definitionItemId]);
  });

  it('mints a missing definition item with uom_base sourced from wip_definitions.base_uom', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/insert\s+into\s+public\.npd_wip_processes/i.test(text)) return { rows: [{ id: processId }], rowCount: 1 };
      if (/select p\.wip_item_id,\s*p\.wip_definition_id/i.test(text)) {
        return {
          rows: [{
            wip_item_id: null,
            wip_definition_id: definitionId,
            definition_item_id: null,
            definition_base_uom: 'g',
            definition_name: 'Definition item',
          }],
        };
      }
      if (/insert into public\.items/i.test(text)) return { rows: [{ id: definitionItemId }], rowCount: 1 };
      if (/insert into public\.audit_log/i.test(text)) return { rows: [], rowCount: 1 };
      if (/update public\.wip_definitions/i.test(text)) return { rows: [], rowCount: 1 };
      if (/update public\.npd_wip_processes/i.test(text)) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });

    const result = await addWipProcess({
      prodDetailId,
      processName: 'Linked process',
      createsWipItem: true,
    });

    expect(result).toEqual({ ok: true, id: processId });
    const itemInsert = queryMock.mock.calls.find((call) => /insert into public\.items/i.test(String(call[0])));
    expect(itemInsert?.[1]).toEqual([
      'WIP-20260703-0001',
      'Definition item',
      'g',
      '11111111-1111-4111-8111-111111111111',
    ]);
  });

  it('allergen refresh never overwrites manual_override rows (V-TEC-42, review H2)', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (/select id, item_id, version, status, name, description, base_uom, yield_pct, reusable/i.test(text)) {
        return {
          rows: [{
            id: definitionId,
            item_id: itemId,
            version: 1,
            status: 'draft',
            name: 'Sauce base',
            description: null,
            base_uom: 'kg',
            yield_pct: '95.000',
            reusable: true,
          }],
        };
      }
      if (/update public\.wip_definitions/i.test(text)) {
        return { rows: [{ id: definitionId, version: 2 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    await saveWipDefinition({
      id: definitionId,
      name: 'Sauce base v2',
      baseUom: 'kg',
      yieldPct: 95,
      reusable: true,
      ingredients: [{ itemId: ingredientItemId, qtyPerUnit: 1.25, uom: 'kg', sequence: 0 }],
      processes: [],
    });

    const allergenDelete = queryMock.mock.calls.find(
      (call) => /delete from public\.item_allergen_profiles/i.test(String(call[0])),
    );
    expect(allergenDelete).toBeDefined();
    expect(String(allergenDelete?.[0])).toMatch(/source = 'cascaded'/i);

    const allergenUpsert = queryMock.mock.calls.find(
      (call) => /insert into public\.item_allergen_profiles/i.test(String(call[0])),
    );
    expect(allergenUpsert).toBeDefined();
    expect(String(allergenUpsert?.[0])).toMatch(/source\s*<>\s*'manual_override'/i);
  });
});

function updateDefinitionParams(): readonly unknown[] | undefined {
  return queryMock.mock.calls.find((call) => /update public\.wip_definitions/i.test(String(call[0])))?.[1];
}

function hasOutboxInsert(): boolean {
  return queryMock.mock.calls.some((call) => /insert into public\.outbox_events/i.test(String(call[0])));
}
