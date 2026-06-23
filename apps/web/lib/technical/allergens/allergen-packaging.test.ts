import { describe, expect, it, vi } from 'vitest';

import { cascadeAllergensForChangedItem } from './cascade';
import { upsertProfile } from './service';
import type { OrgActionContext, QueryClient } from './shared';

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000002';
const ITEM_ID = '00000000-0000-4000-8000-000000000003';
const PARENT_ID = '00000000-0000-4000-8000-000000000004';
const CHANGED_ITEM_ID = '00000000-0000-4000-8000-000000000005';

function compactSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function isWrite(sql: string): boolean {
  return /^(insert|update|delete)\b/.test(compactSql(sql));
}

describe('packaging item allergen guard', () => {
  it('returns not_applicable and writes nothing when saving allergens on a packaging item', async () => {
    const writeSql: string[] = [];
    const query = vi.fn(async (sql: string) => {
      if (isWrite(sql)) writeSql.push(sql);

      const normalized = compactSql(sql);
      if (normalized.includes('from public.user_roles')) {
        return { rows: [{ ok: true }] };
      }
      if (normalized.includes('from public.items') && normalized.includes('item_code')) {
        return { rows: [{ id: ITEM_ID, item_type: 'packaging' }] };
      }
      if (normalized.includes('from "reference"."allergens"')) {
        throw new Error('packaging saves should return before allergen reference validation');
      }
      return { rows: [] };
    });
    const ctx: OrgActionContext = {
      userId: USER_ID,
      orgId: ORG_ID,
      client: { query: query as unknown as QueryClient['query'] },
    };

    const result = await upsertProfile(ctx, {
      itemCode: 'PKG-001',
      allergenCode: 'milk',
      source: 'manual_override',
      intensity: 'contains',
      confidence: 'declared',
      reason: 'Should not be accepted for packaging',
    });

    expect(result).toEqual({ ok: false, error: 'not_applicable' });
    expect(writeSql).toEqual([]);
  });

  it('ignores packaging components when computing cascaded allergens', async () => {
    const insertedAllergens: unknown[] = [];
    let computeSql = '';
    const query = vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const normalized = compactSql(sql);

      if (normalized.includes('with recursive parents')) {
        return { rows: [{ item_id: PARENT_ID }] };
      }

      if (normalized.includes('component_allergens')) {
        computeSql = sql;
        const packagingFilters = sql.match(/component\.item_type <> 'packaging'/g) ?? [];
        return {
          rows:
            packagingFilters.length >= 2
              ? [{ allergen_code: 'milk', intensity: 'contains', confidence: 'declared' }]
              : [
                  { allergen_code: 'milk', intensity: 'contains', confidence: 'declared' },
                  { allergen_code: 'adhesive', intensity: 'trace', confidence: 'assumed' },
                ],
        };
      }

      if (normalized.startsWith('select source from public.item_allergen_profiles')) {
        return { rows: [] };
      }

      if (normalized.startsWith('insert into public.item_allergen_profiles')) {
        insertedAllergens.push(params[1]);
        return { rows: [], rowCount: 1 };
      }

      return { rows: [] };
    });
    const client: QueryClient = { query: query as unknown as QueryClient['query'] };

    const result = await cascadeAllergensForChangedItem(client, ORG_ID, CHANGED_ITEM_ID);

    expect(computeSql).toContain("component.item_type <> 'packaging'");
    expect(computeSql.match(/component\.item_type <> 'packaging'/g)).toHaveLength(2);
    expect(insertedAllergens).toEqual(['milk']);
    expect(result.cascadedRowsWritten).toBe(1);
  });
});
