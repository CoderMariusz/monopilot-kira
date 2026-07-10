import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ACTIVE_DEF_ID = '33333333-3333-4333-8333-333333333333';
const NEW_DEF_ID = '44444444-4444-4444-8444-444444444444';
const ITEM_ID = '55555555-5555-4555-8555-555555555555';

type QueryCall = { sql: string; params: readonly unknown[] };

const runWithOrgContext = vi.hoisted(() => vi.fn());

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) => runWithOrgContext(action)),
}));
vi.mock('../../../../../../../../lib/auth/has-permission', () => ({
  hasPermission: vi.fn(async () => true),
  hasAnyPermission: vi.fn(async () => true),
}));
vi.mock('../../../../../../../../lib/documents/code-mask', () => ({
  nextEntityCode: vi.fn(async () => 'WIP-TEST-001'),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient() {
  const calls: QueryCall[] = [];
  const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
    calls.push({ sql, params });
    const n = normalize(sql);
    if (n.includes('from public.wip_definitions') && n.includes('limit 1') && n.includes('select id, item_id')) {
      return {
        rows: [
          {
            id: ACTIVE_DEF_ID,
            item_id: ITEM_ID,
            version: 3,
            status: 'active',
            name: 'Cream base',
            description: null,
            base_uom: 'kg',
            yield_pct: '100',
            reusable: true,
            source_project_id: null,
          },
        ],
        rowCount: 1,
      };
    }
    if (n.includes('from public.wip_definition_ingredients') && n.includes('qty_per_unit')) {
      return { rows: [{ itemId: ITEM_ID, qtyPerUnit: '1.000000', uom: 'kg', sequence: 1 }], rowCount: 1 };
    }
    if (n.includes('from public.wip_definition_processes')) return { rows: [], rowCount: 0 };
    if (n.startsWith('insert into public.wip_definitions') && n.includes('supersedes_wip_definition_id')) {
      return { rows: [{ id: NEW_DEF_ID, version: 4 }], rowCount: 1 };
    }
    if (n.startsWith('update public.wip_definitions')) {
      throw new Error('active WIP definitions must not be updated in place on content change');
    }
    if (n.startsWith('delete from public.wip_definition_ingredients')) return { rows: [], rowCount: 1 };
    if (n.startsWith('insert into public.wip_definition_ingredients')) return { rows: [], rowCount: 1 };
    if (n.startsWith('delete from public.wip_definition_processes')) return { rows: [], rowCount: 1 };
    if (n.startsWith('delete from public.item_allergen_profiles')) return { rows: [], rowCount: 1 };
    if (n.startsWith('insert into public.outbox_events')) return { rows: [], rowCount: 1 };
    if (n.startsWith('insert into public.user_notifications')) return { rows: [], rowCount: 1 };
    if (n.startsWith('insert into public.audit_log')) return { rows: [], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  return { calls, query };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('saveWipDefinition clone-on-write (N-22)', () => {
  it('inserts a new version row for active definitions instead of mutating in place', async () => {
    const client = makeClient();
    runWithOrgContext.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
    );

    const { saveWipDefinition } = await import('../wip-definition-actions');
    const result = await saveWipDefinition({
      id: ACTIVE_DEF_ID,
      name: 'Cream base',
      baseUom: 'kg',
      yieldPct: 100,
      reusable: true,
      ingredients: [{ itemId: ITEM_ID, qtyPerUnit: 2, uom: 'kg', sequence: 1 }],
      processes: [],
    });

    expect(result).toEqual({ ok: true, id: NEW_DEF_ID, version: 4 });
    const insertCall = client.calls.find((call) => normalize(call.sql).includes('supersedes_wip_definition_id'));
    expect(insertCall).toBeDefined();
    expect(insertCall!.params).toContain(ACTIVE_DEF_ID);
    expect(client.calls.some((call) => normalize(call.sql).startsWith('update public.wip_definitions'))).toBe(false);
  });
});
