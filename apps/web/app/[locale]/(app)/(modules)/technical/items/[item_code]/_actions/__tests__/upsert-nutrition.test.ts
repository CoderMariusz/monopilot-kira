import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { sql: string; params: readonly unknown[] };

const ctx = {
  orgId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  grantedPerms: new Set<string>(),
  itemRow: {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    item_code: 'RM-1',
    name: 'Pork shoulder',
    item_type: 'rm',
  } as { id: string; item_code: string; name: string; item_type: string } | null,
  rawMaterialBefore: null as { allergens_inherited: string[] | null } | null,
  rawMaterialAfterAllergens: null as string[] | null,
  calls: [] as Call[],
};

function fakeClient() {
  return {
    async query(sql: string, params: readonly unknown[] = []) {
      ctx.calls.push({ sql, params });
      const s = sql.replace(/\s+/g, ' ').toLowerCase();

      if (s.includes('from public.user_roles ur')) {
        const perm = params[2] as string;
        return { rows: ctx.grantedPerms.has(perm) ? [{ ok: true }] : [] };
      }
      if (s.includes('from public.items')) {
        return { rows: ctx.itemRow ? [ctx.itemRow] : [] };
      }
      if (s.includes('from "reference"."rawmaterials"')) {
        return { rows: ctx.rawMaterialBefore ? [{ rm_code: 'RM-1', display_name: 'Pork shoulder', nutrition_per_100g: null, ...ctx.rawMaterialBefore }] : [] };
      }
      if (s.includes('insert into "reference"."rawmaterials"')) {
        return {
          rows: [
            {
              rm_code: params[0],
              display_name: params[1],
              nutrition_per_100g: {
                energy_kj: params[2],
                fat_g: params[3],
                saturates_g: params[4],
                carbs_g: params[5],
                sugars_g: params[6],
                protein_g: params[7],
                salt_g: params[8],
              },
              allergens_inherited: ctx.rawMaterialAfterAllergens ?? params[9],
            },
          ],
        };
      }
      if (s.includes('into public.outbox_events')) {
        return { rows: [] };
      }
      if (s.includes('into public.audit_log')) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
}

vi.mock('../../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async (action: (c: unknown) => Promise<unknown>) =>
    action({ orgId: ctx.orgId, userId: ctx.userId, sessionToken: 't', client: fakeClient() }),
}));

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { ITEMS_EDIT_PERMISSION } from '../../../_actions/shared';
import { upsertNutrition } from '../upsert-nutrition';

const valid = {
  itemCode: 'RM-1',
  nutrition: {
    energy_kj: '530',
    fat_g: '5.0',
    saturates_g: '2.0',
    carbs_g: '0',
    sugars_g: '0',
    protein_g: '20.5',
    salt_g: '0.07',
  },
  allergensInherited: ['A07'],
};

beforeEach(() => {
  ctx.grantedPerms = new Set<string>([ITEMS_EDIT_PERMISSION]);
  ctx.itemRow = {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    item_code: 'RM-1',
    name: 'Pork shoulder',
    item_type: 'rm',
  };
  ctx.rawMaterialBefore = null;
  ctx.rawMaterialAfterAllergens = null;
  ctx.calls = [];
});

afterEach(() => vi.clearAllMocks());

describe('upsertNutrition', () => {
  it("returns forbidden when the item exists but item_type is finished_good", async () => {
    ctx.itemRow = { ...ctx.itemRow!, item_type: 'finished_good' };

    const res = await upsertNutrition(valid);

    expect(res).toEqual({ ok: false, error: 'forbidden' });
    expect(ctx.calls.some((c) => /insert into "Reference"\."RawMaterials"/i.test(c.sql))).toBe(false);
  });

  it("returns not_found when the item doesn't exist in the current org", async () => {
    ctx.itemRow = null;

    const res = await upsertNutrition(valid);

    expect(res).toEqual({ ok: false, error: 'not_found' });
    expect(ctx.calls.some((c) => /insert into "Reference"\."RawMaterials"/i.test(c.sql))).toBe(false);
  });

  it('upserts Reference.RawMaterials with text nutrition values and inherited allergens', async () => {
    const res = await upsertNutrition(valid);

    expect(res).toEqual({
      ok: true,
      data: {
        itemCode: 'RM-1',
        nutrition: valid.nutrition,
        allergensInherited: ['A07'],
      },
    });

    const upsert = ctx.calls.find((c) => /insert into "Reference"\."RawMaterials"/i.test(c.sql));
    expect(upsert).toBeTruthy();
    expect(upsert!.params).toEqual([
      'RM-1',
      'Pork shoulder',
      '530',
      '5.0',
      '2.0',
      '0',
      '0',
      '20.5',
      '0.07',
      ['A07'],
    ]);
    expect(upsert!.sql).toContain('jsonb_build_object');
    expect(upsert!.sql).toContain('on conflict (org_id, rm_code) do update');

    const audit = ctx.calls.find((c) => /insert into\s+public\.audit_log/i.test(c.sql));
    expect(audit).toBeTruthy();
  });

  it('emits allergen cascade rebuild outbox when the normalized allergen set changes', async () => {
    ctx.rawMaterialBefore = { allergens_inherited: ['milk'] };
    ctx.rawMaterialAfterAllergens = ['milk', 'soybeans'];

    const res = await upsertNutrition({ ...valid, allergensInherited: ['A07', 'A06'] });

    expect(res.ok).toBe(true);
    const outbox = ctx.calls.find((c) => /insert into\s+public\.outbox_events/i.test(c.sql));
    expect(outbox).toBeTruthy();
    expect(outbox!.params.slice(0, 4)).toEqual([
      ctx.orgId,
      'reference.allergens_by_rm.bulk_changed',
      'reference.raw_material',
      ctx.itemRow!.id,
    ]);
    expect(JSON.parse(outbox!.params[4] as string)).toEqual({
      source_event_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      ingredient_codes: ['RM-1'],
      process_names: [],
    });
  });

  it('does not emit allergen cascade rebuild outbox when the normalized allergen set is unchanged', async () => {
    ctx.rawMaterialBefore = { allergens_inherited: ['soybeans', 'milk'] };
    ctx.rawMaterialAfterAllergens = ['milk', 'soybeans'];

    const res = await upsertNutrition({ ...valid, allergensInherited: ['A07', 'A06'] });

    expect(res.ok).toBe(true);
    expect(ctx.calls.some((c) => /insert into\s+public\.outbox_events/i.test(c.sql))).toBe(false);
  });
});
