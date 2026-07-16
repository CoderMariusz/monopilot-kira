/**
 * W9-L4 — F-A06 (BLOCKER) + F-B12: saveDraft must NOT trust the browser.
 *
 * SSOT: public.item_allergen_profiles. The action IGNORES the client's
 * allergensInherited payload and re-derives the FULL allergen array per line
 * from the line's item_id. Cost prefers the user-typed value; when empty,
 * falls back to public.v_item_effective_cost (master).
 *
 * Pure unit suite — withOrgContext is mocked; the client mock routes by SQL
 * shape and CAPTURES the insert payload so we assert exactly what would be
 * persisted.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { saveDraft } from '../save-draft';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[] }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const PROJECT_ID = '33333333-3333-4333-8333-333333333333';
const VERSION_ID = '44444444-4444-4444-8444-444444444444';
const FORMULATION_ID = '55555555-5555-4555-8555-555555555555';
/** Item with a 3-allergen profile + a master cost. */
const ITEM_A = '66666666-6666-4666-8666-666666666666';
/** Item with a truly-empty allergen profile and NO master cost. */
const ITEM_B = '77777777-7777-4777-8777-777777777777';
/** Substitute with an allergen subset compatible with ITEM_A. */
const ITEM_C = '88888888-8888-4888-8888-888888888888';
/** Substitute that introduces an extra allergen not present on ITEM_A. */
const ITEM_D = '99999999-9999-4999-8999-999999999999';
const WIP_DEF_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WIP_ITEM_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let client: QueryClient;
/** Captured $2 of the formulation_ingredients INSERT (the persisted rows). */
let insertedRows: Array<Record<string, unknown>> | null;
/** Captured formulation_versions UPDATE params. */
let versionUpdateParams: readonly unknown[] | null;
/** Captured npd_projects target retail price UPDATE params. */
let projectUpdateParams: readonly unknown[] | null;
/** Prior persisted rows returned by the carryover read. */
let priorRows: Array<{ rm_code: string; allergens_inherited: string[] | null }>;
/** F8: the org's canonical allergen reference (Reference."Allergens"). */
let canonicalCodes: string[];

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('@monopilot/observability', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);
      if (q.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (q.includes('for update of fv')) {
        return { rows: [{ formulation_id: FORMULATION_ID, version_id: VERSION_ID, state: 'draft' }] };
      }
      // F-A06 carryover read (runs BEFORE the delete).
      if (q.includes('select rm_code, allergens_inherited')) return { rows: priorRows };
      // F8 — canonical allergen reference list (Reference."Allergens", org-scoped).
      if (q.includes('"reference"."allergens"')) {
        return { rows: canonicalCodes.map((code) => ({ allergen_code: code })) };
      }
      if (q.startsWith('delete from public.formulation_ingredients')) return { rows: [] };
      if (q.includes('from public.wip_definitions')) {
        return {
          rows: [{ id: WIP_DEF_ID, item_id: WIP_ITEM_ID }],
        };
      }
      if (q.includes('from public.items')) {
        expect(q).toContain('left join public.v_item_effective_cost');
        const requested = (params[0] as string[]) ?? [];
        const known: Record<string, { id: string; cost_per_kg: string | null; cost_currency?: string | null }> = {
          [ITEM_A]: { id: ITEM_A, cost_per_kg: '9.9900', cost_currency: 'GBP' },
          [ITEM_B]: { id: ITEM_B, cost_per_kg: null, cost_currency: null },
          [ITEM_C]: { id: ITEM_C, cost_per_kg: '8.8800', cost_currency: 'GBP' },
          [ITEM_D]: { id: ITEM_D, cost_per_kg: '7.7700', cost_currency: 'GBP' },
          [WIP_ITEM_ID]: { id: WIP_ITEM_ID, cost_per_kg: null, cost_currency: null },
        };
        return { rows: requested.filter((id) => known[id]).map((id) => known[id]) };
      }
      if (q.includes('from public.item_allergen_profiles')) {
        const requested = (params[0] as string[]) ?? [];
        // ITEM_A: full multi-allergen profile; ITEM_B: NO rows (truly empty).
        return {
          rows: [
            ...(requested.includes(ITEM_A)
              ? [{ item_id: ITEM_A, codes: ['celery', 'mustard', 'sesame'] }]
              : []),
            ...(requested.includes(ITEM_C)
              ? [{ item_id: ITEM_C, codes: ['mustard'] }]
              : []),
            ...(requested.includes(ITEM_D)
              ? [{ item_id: ITEM_D, codes: ['gluten'] }]
              : []),
          ],
        };
      }
      if (q.startsWith('insert into public.formulation_ingredients')) {
        insertedRows = JSON.parse(String(params[1])) as Array<Record<string, unknown>>;
        return { rows: [] };
      }
      if (q.startsWith('update public.formulation_versions')) {
        versionUpdateParams = params;
        return { rows: [] };
      }
      if (q.startsWith('update public.npd_projects np') && q.includes('target_retail_price_eur')) {
        projectUpdateParams = params;
        return { rows: [] };
      }
      if (q.startsWith('insert into public.formulation_audit_log')) return { rows: [] };
      if (q.startsWith('insert into public.wip_definition_acks')) return { rows: [] };
      throw new Error(`unexpected query in save-draft.ssot.test: ${q.slice(0, 120)}`);
    }),
  };
}

function line(overrides: Partial<{
  rmCode: string;
  itemId: string | null;
  substituteItemId: string | null;
  qtyKg: string | null;
  costPerKgEur: string | null;
  costCurrency: string | null;
  allergensInherited: string[];
  sequence: number;
}> = {}) {
  return {
    rmCode: 'RM-1001',
    itemId: ITEM_A,
    substituteItemId: null,
    qtyKg: '0.200',
    costPerKgEur: '1.00',
    costCurrency: null,
    allergensInherited: [],
    sequence: 1,
    ...overrides,
  };
}

beforeEach(() => {
  client = makeClient();
  insertedRows = null;
  versionUpdateParams = null;
  projectUpdateParams = null;
  priorRows = [];
  canonicalCodes = ['celery', 'gluten', 'milk', 'mustard', 'sesame'];
});

describe('saveDraft — F-A06 allergen SSOT (client payload ignored)', () => {
  it('persists the profile-derived FULL allergen array, never the bogus client payload', async () => {
    const result = await saveDraft({
      projectId: PROJECT_ID,
      versionId: VERSION_ID,
      // Client lies: claims a single unrelated allergen (the live AUDIT2-RM1
      // false-negative shape — profile says mustard&co, wire says otherwise).
      ingredients: [line({ allergensInherited: ['bogus-client-allergen'] })],
    });

    expect(result).toEqual({ ok: true, data: { versionId: VERSION_ID, ingredientCount: 1 } });
    expect(insertedRows).not.toBeNull();
    // Multi-allergen preserved IN FULL (F-A08's [0]-truncation can never recur
    // at the persistence layer) and sorted/deduped from the SSOT.
    expect(insertedRows?.[0]?.allergens_inherited).toEqual(['celery', 'mustard', 'sesame']);
  });

  it('persists [] for an item whose profile is truly empty — client junk dropped', async () => {
    await saveDraft({
      projectId: PROJECT_ID,
      versionId: VERSION_ID,
      ingredients: [line({ itemId: ITEM_B, allergensInherited: ['sneaky'] })],
    });
    expect(insertedRows?.[0]?.allergens_inherited).toEqual([]);
  });

  it('allows a substitute whose allergen profile is a subset of the primary profile', async () => {
    const result = await saveDraft({
      projectId: PROJECT_ID,
      versionId: VERSION_ID,
      ingredients: [line({ substituteItemId: ITEM_C })],
    });

    expect(result).toEqual({ ok: true, data: { versionId: VERSION_ID, ingredientCount: 1 } });
    expect(insertedRows?.[0]?.substitute_item_id).toBe(ITEM_C);
  });

  it('fail-closes a substitute that introduces allergens absent from the primary profile before persistence', async () => {
    const result = await saveDraft({
      projectId: PROJECT_ID,
      versionId: VERSION_ID,
      ingredients: [line({ substituteItemId: ITEM_D })],
    });

    expect(result).toEqual({
      ok: false,
      error: 'SUBSTITUTE_ALLERGEN_MISMATCH',
      offendingAllergens: ['gluten'],
    });
    expect(insertedRows).toBeNull();
  });

  it('carries over the previously PERSISTED allergens for legacy free-text lines (no item_id) — never the wire value', async () => {
    priorRows = [{ rm_code: 'RM-LEGACY', allergens_inherited: ['gluten'] }];
    await saveDraft({
      projectId: PROJECT_ID,
      versionId: VERSION_ID,
      ingredients: [
        line({ rmCode: 'RM-LEGACY', itemId: null, allergensInherited: ['bogus'], sequence: 1 }),
        line({ rmCode: 'RM-NEW-FREE-TEXT', itemId: null, allergensInherited: ['also-bogus'], sequence: 2 }),
      ],
    });
    expect(insertedRows?.[0]?.allergens_inherited).toEqual(['gluten']); // server carryover
    expect(insertedRows?.[1]?.allergens_inherited).toEqual([]); // new free-text line: no SSOT → empty
  });

  // ── F8 (W9 cross-review MEDIUM) — carryover validated against Reference."Allergens" ──
  it('F8: drops carried legacy codes unknown to the canonical allergen reference, keeps valid ones', async () => {
    priorRows = [{ rm_code: 'RM-LEGACY', allergens_inherited: ['gluten', 'legacy-junk-9', 'mustrd-typo'] }];
    await saveDraft({
      projectId: PROJECT_ID,
      versionId: VERSION_ID,
      ingredients: [line({ rmCode: 'RM-LEGACY', itemId: null, allergensInherited: [], sequence: 1 })],
    });
    // 'gluten' is canonical → carried; the junk/typo codes are dropped for good.
    expect(insertedRows?.[0]?.allergens_inherited).toEqual(['gluten']);
  });

  it('F8: keeps the carryover unchanged when the reference table is not provisioned (42P01)', async () => {
    priorRows = [{ rm_code: 'RM-LEGACY', allergens_inherited: ['gluten', 'unverifiable-code'] }];
    const baseQuery = client.query.bind(client);
    client = {
      query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
        if (normalize(sql).includes('"reference"."allergens"')) {
          const err = new Error('relation "Reference.Allergens" does not exist') as Error & { code: string };
          err.code = '42P01';
          throw err;
        }
        return baseQuery(sql, params);
      }),
    };
    await saveDraft({
      projectId: PROJECT_ID,
      versionId: VERSION_ID,
      ingredients: [line({ rmCode: 'RM-LEGACY', itemId: null, allergensInherited: [], sequence: 1 })],
    });
    // Cannot validate without the list → carryover preserved (never dropped blind).
    expect(insertedRows?.[0]?.allergens_inherited).toEqual(['gluten', 'unverifiable-code']);
  });
});

describe('saveDraft — F-B12 cost from the effective-cost view', () => {
  it('persists the user-typed cost when both master and manual values exist (manual wins)', async () => {
    await saveDraft({
      projectId: PROJECT_ID,
      versionId: VERSION_ID,
      ingredients: [line({ costPerKgEur: '3.75', costCurrency: 'USD' })],
    });
    expect(insertedRows?.[0]?.cost_per_kg_eur).toBe('3.75');
    expect(insertedRows?.[0]?.cost_currency).toBe('USD');
  });

  it('falls back to the master cost when the user left the cost field empty', async () => {
    await saveDraft({
      projectId: PROJECT_ID,
      versionId: VERSION_ID,
      ingredients: [line({ costPerKgEur: null, costCurrency: null })],
    });
    expect(insertedRows?.[0]?.cost_per_kg_eur).toBe('9.9900');
    expect(insertedRows?.[0]?.cost_currency).toBe('GBP');
  });

  it('falls back to the client value ONLY when the item has no master cost', async () => {
    await saveDraft({
      projectId: PROJECT_ID,
      versionId: VERSION_ID,
      ingredients: [line({ itemId: ITEM_B, costPerKgEur: '2.50' })],
    });
    expect(insertedRows?.[0]?.cost_per_kg_eur).toBe('2.50');
    expect(insertedRows?.[0]?.cost_currency).toBeNull();
  });

  it('persists a manual WIP ingredient cost when the linked item has no master cost', async () => {
    await saveDraft({
      projectId: PROJECT_ID,
      versionId: VERSION_ID,
      ingredients: [
        line({
          rmCode: 'WIP-BASE',
          itemId: WIP_ITEM_ID,
          wipDefinitionId: WIP_DEF_ID,
          costPerKgEur: '3.75',
          sequence: 1,
        }),
      ],
    });
    expect(insertedRows?.[0]?.wip_definition_id).toBe(WIP_DEF_ID);
    expect(insertedRows?.[0]?.cost_per_kg_eur).toBe('3.75');
  });
});

describe('saveDraft — formulation version batch size', () => {
  it('persists the supplied batchSizeKg on the draft formulation version', async () => {
    const result = await saveDraft({
      projectId: PROJECT_ID,
      versionId: VERSION_ID,
      batchSizeKg: '0.250000',
      targetYieldPct: '100',
      targetPriceEur: '1.20',
      processingOverheadPct: '8',
      ingredients: [line()],
    });

    expect(result).toEqual({ ok: true, data: { versionId: VERSION_ID, ingredientCount: 1 } });
    expect(versionUpdateParams).toEqual([VERSION_ID, '100', '1.20', '8', true, '0.250000']);
  });

  it('rejects targetPriceEur with more than two decimal places before any query', async () => {
    const result = await saveDraft({
      projectId: PROJECT_ID,
      versionId: VERSION_ID,
      targetPriceEur: '19.999',
      ingredients: [],
    });

    expect(result).toEqual({ ok: false, error: 'invalid_input' });
    expect(client.query).not.toHaveBeenCalled();
  });

  it('preserves a large exact targetPriceEur in both write paths', async () => {
    const result = await saveDraft({
      projectId: PROJECT_ID,
      versionId: VERSION_ID,
      targetPriceEur: '9999999999.99',
      ingredients: [],
    });

    expect(result).toEqual({ ok: true, data: { versionId: VERSION_ID, ingredientCount: 0 } });
    expect(versionUpdateParams?.[2]).toBe('9999999999.99');
    expect(projectUpdateParams).toEqual([VERSION_ID, '9999999999.99']);
  });
});
