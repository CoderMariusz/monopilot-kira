/**
 * F6 (W9 cross-review BLOCKER) — formulations list page allergen union.
 *
 * The cross-FG list previously unioned the STORED
 * formulation_ingredients.allergens_inherited for every line, so locked/legacy
 * versions surfaced stale client-written caches. The loader must now resolve
 * ITEM-LINKED lines LIVE from the SSOT public.item_allergen_profiles via a
 * pre-aggregated CTE keyed by item_id (single left join), reading the stored
 * column ONLY for legacy free-text lines (item_id IS NULL).
 *
 * Node suite: the RSC default export is invoked directly with withOrgContext
 * mocked; we assert (1) the loader SQL shape and (2) the loader→row mapping.
 * The SQL's union behaviour itself is validated against a real Postgres in the
 * lane evidence (EXPLAIN + seeded behavioural query).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import FormulationsPage from '../page';

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const VERSION_ID = '44444444-4444-4444-8444-444444444444';
const PROJECT_ID = '33333333-3333-4333-8333-333333333333';

let client: QueryClient;
let loaderQueries: string[];

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string) => {
      const q = normalize(sql);
      if (q.includes('from public.user_roles')) return { rows: [{ ok: true }] };
      if (q.includes('from public.formulations f')) {
        loaderQueries.push(q);
        return {
          rows: [
            {
              version_id: VERSION_ID,
              project_id: PROJECT_ID,
              fg_code: 'FG-9001',
              fg_name: 'Test FG',
              version_number: 2,
              state: 'locked',
              effective_from: '2026-06-01',
              item_count: 3,
              // What the SSOT-resolving SQL union yields (profile-derived for
              // item-linked lines + stored for the one free-text line).
              allergen_codes: ['gluten', 'milk', 'mustard'],
            },
          ],
        };
      }
      throw new Error(`unexpected query in page.f6 test: ${q.slice(0, 120)}`);
    }),
  };
}

beforeEach(() => {
  client = makeClient();
  loaderQueries = [];
});

describe('formulations list page — F6 SSOT allergen union', () => {
  it('resolves item-linked allergens via the profile_allergens CTE, stored column only for free-text lines', async () => {
    const element = (await FormulationsPage({})) as { props: { rows: Array<Record<string, unknown>>; state: string } };

    expect(loaderQueries).toHaveLength(1);
    const q = loaderQueries[0];
    // Pre-aggregated SSOT CTE keyed by item_id + ONE left join.
    expect(q).toContain('with profile_allergens as');
    expect(q).toContain('from public.item_allergen_profiles iap');
    expect(q).toContain('left join profile_allergens pa on pa.item_id = fi2.item_id');
    // Item-linked rows read pa.codes; ONLY free-text rows read the stored cache.
    expect(q).toContain("when fi2.item_id is not null then coalesce(pa.codes, '{}'::text[])");
    expect(q).toContain("else coalesce(fi2.allergens_inherited, '{}'::text[])");
    // The old shape — a blind unnest of the stored column for EVERY line — is gone.
    expect(q).not.toContain('unnest(fi2.allergens_inherited) as a');

    // Loader → row mapping carries the SSOT-derived union into the UI summary.
    expect(element.props.state).toBe('ready');
    expect(element.props.rows[0]).toMatchObject({
      versionId: VERSION_ID,
      allergenSummary: 'gluten, milk, mustard',
      itemCount: 3,
    });
  });
});
