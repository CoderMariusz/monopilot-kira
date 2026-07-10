import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryCall = { sql: string; params: unknown[] };

const harness = vi.hoisted(() => ({
  calls: [] as QueryCall[],
  bomRows: [] as Array<Record<string, unknown>>,
  settingsRows: [] as Array<Record<string, unknown>>,
  throwUndefinedColumnOnBomQuery: false,
}));

function makeClient() {
  return {
    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
      harness.calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.includes('from public.bom_headers h')) {
        if (harness.throwUndefinedColumnOnBomQuery) {
          throw Object.assign(new Error('column p.name does not exist'), { code: '42703' });
        }
        return { rows: harness.bomRows as T[], rowCount: harness.bomRows.length };
      }
      if (normalized.includes('from public.bom_settings')) {
        return { rows: harness.settingsRows as T[], rowCount: harness.settingsRows.length };
      }
      if (normalized.includes('insert into public.bom_settings')) {
        return { rows: harness.settingsRows as T[], rowCount: harness.settingsRows.length };
      }
      if (normalized.includes('from public.user_roles')) {
        return { rows: [{ ok: true }] as T[], rowCount: 1 };
      }
      return { rows: [] as T[], rowCount: 0 };
    },
  };
}

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (fn: (ctx: unknown) => Promise<unknown>) =>
    fn({ userId: '11111111-1111-1111-1111-111111111111', orgId: '22222222-2222-2222-2222-222222222222', client: makeClient() }),
  ),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

describe('settings BOMs data-layer contract', () => {
  beforeEach(() => {
    harness.calls = [];
    harness.throwUndefinedColumnOnBomQuery = false;
    harness.bomRows = [
      {
        id: '44444444-4444-4444-4444-444444444444',
        bom_number: 'BOM-44444444',
        product: 'Beef mince 500g',
        version: 3,
        ingredients_count: 7,
        last_updated: '2026-06-06',
        status: 'active',
      },
      {
        id: '55555555-5555-5555-5555-555555555555',
        bom_number: 'BOM-55555555',
        product: 'Pilot patties',
        version: 1,
        ingredients_count: 4,
        last_updated: '2026-06-05',
        status: 'draft',
      },
    ];
    harness.settingsRows = [
      {
        auto_calculate_nutrition: false,
        require_allergen_review: true,
        retention: '25',
      },
    ];
    vi.clearAllMocks();
  });

  it('getBoms returns org-scoped KPI counts and table rows from canonical BOM tables', async () => {
    const { getBoms } = await import('../boms');

    const result = await getBoms('22222222-2222-2222-2222-222222222222');

    expect(result.kpis).toEqual({ active: 1, draft: 1, archived: 0 });
    expect(result.rows).toEqual([
      {
        id: '44444444-4444-4444-4444-444444444444',
        bomNumber: 'BOM-44444444',
        product: 'Beef mince 500g',
        version: 'v3',
        ingredientsCount: 7,
        lastUpdated: '2026-06-06',
        status: 'active',
      },
      {
        id: '55555555-5555-5555-5555-555555555555',
        bomNumber: 'BOM-55555555',
        product: 'Pilot patties',
        version: 'v1',
        ingredientsCount: 4,
        lastUpdated: '2026-06-05',
        status: 'draft',
      },
    ]);

    const bomCall = harness.calls.find((call) => call.sql.toLowerCase().includes('from public.bom_headers h'));
    expect(bomCall, 'loader must query public.bom_headers').toBeTruthy();
    expect(bomCall?.sql).toContain('public.bom_lines');
    expect(bomCall?.sql).toContain('p.product_name');
    expect(bomCall?.sql).not.toMatch(/\bp\.name\b/);
    expect(bomCall?.sql).toContain('app.current_org_id()');
    expect(bomCall?.params).toEqual(['22222222-2222-2222-2222-222222222222']);
  });

  it('getBoms rethrows undefined_column (42703) instead of returning empty success', async () => {
    harness.throwUndefinedColumnOnBomQuery = true;
    const { getBoms } = await import('../boms');
    await expect(getBoms('22222222-2222-2222-2222-222222222222')).rejects.toMatchObject({ code: '42703' });
  });

  it('getBomSettings and updateBomSettings use the org-scoped bom_settings producer', async () => {
    const { getBomSettings, updateBomSettings } = await import('../boms');

    await expect(getBomSettings('22222222-2222-2222-2222-222222222222')).resolves.toEqual({
      autoCalculateNutrition: false,
      requireAllergenReview: true,
      retention: '25',
    });

    const updateResult = await updateBomSettings('22222222-2222-2222-2222-222222222222', {
      autoCalculateNutrition: false,
      requireAllergenReview: true,
      retention: '25',
    });

    expect(updateResult).toEqual({
      ok: true,
      settings: {
        autoCalculateNutrition: false,
        requireAllergenReview: true,
        retention: '25',
      },
    });

    const settingsSelect = harness.calls.find((call) => call.sql.toLowerCase().includes('from public.bom_settings'));
    const settingsUpsert = harness.calls.find((call) => call.sql.toLowerCase().includes('insert into public.bom_settings'));
    expect(settingsSelect?.sql).toContain('app.current_org_id()');
    expect(settingsUpsert?.sql).toContain('app.current_org_id()');
  });
});
