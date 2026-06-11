/**
 * W9-L4 — F-A06 (BLOCKER) + F-B12: saveDraft must NOT trust the browser.
 *
 * SSOT: public.item_allergen_profiles. The action IGNORES the client's
 * allergensInherited payload and re-derives the FULL allergen array per line
 * from the line's item_id. Cost comes from items.cost_per_kg (master), with the
 * client value only as a documented fallback when the master has no cost.
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

let client: QueryClient;
/** Captured $2 of the formulation_ingredients INSERT (the persisted rows). */
let insertedRows: Array<Record<string, unknown>> | null;
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
      if (q.includes('from public.items')) {
        const requested = (params[0] as string[]) ?? [];
        const known: Record<string, { id: string; cost_per_kg: string | null }> = {
          [ITEM_A]: { id: ITEM_A, cost_per_kg: '9.9900' },
          [ITEM_B]: { id: ITEM_B, cost_per_kg: null },
        };
        return { rows: requested.filter((id) => known[id]).map((id) => known[id]) };
      }
      if (q.includes('from public.item_allergen_profiles')) {
        const requested = (params[0] as string[]) ?? [];
        // ITEM_A: full multi-allergen profile; ITEM_B: NO rows (truly empty).
        return {
          rows: requested.includes(ITEM_A)
            ? [{ item_id: ITEM_A, codes: ['celery', 'mustard', 'sesame'] }]
            : [],
        };
      }
      if (q.startsWith('insert into public.formulation_ingredients')) {
        insertedRows = JSON.parse(String(params[1])) as Array<Record<string, unknown>>;
        return { rows: [] };
      }
      if (q.startsWith('insert into public.formulation_audit_log')) return { rows: [] };
      throw new Error(`unexpected query in save-draft.ssot.test: ${q.slice(0, 120)}`);
    }),
  };
}

function line(overrides: Partial<{
  rmCode: string;
  itemId: string | null;
  qtyKg: string | null;
  costPerKgEur: string | null;
  allergensInherited: string[];
  sequence: number;
}> = {}) {
  return {
    rmCode: 'RM-1001',
    itemId: ITEM_A,
    qtyKg: '0.200',
    costPerKgEur: '1.00',
    allergensInherited: [],
    sequence: 1,
    ...overrides,
  };
}

beforeEach(() => {
  client = makeClient();
  insertedRows = null;
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

describe('saveDraft — F-B12 cost from the item master', () => {
  it('uses items.cost_per_kg when the master has one (client value ignored)', async () => {
    await saveDraft({
      projectId: PROJECT_ID,
      versionId: VERSION_ID,
      ingredients: [line({ costPerKgEur: '1.00' })],
    });
    expect(insertedRows?.[0]?.cost_per_kg_eur).toBe('9.9900');
  });

  it('falls back to the client value ONLY when the item has no master cost', async () => {
    await saveDraft({
      projectId: PROJECT_ID,
      versionId: VERSION_ID,
      ingredients: [line({ itemId: ITEM_B, costPerKgEur: '2.50' })],
    });
    expect(insertedRows?.[0]?.cost_per_kg_eur).toBe('2.50');
  });
});
