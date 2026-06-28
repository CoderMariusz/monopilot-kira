/**
 * A3 (NPD-DYN) · SLICE 1 — UNIT test for the FA dynamic-sections DATA LAYER.
 *
 * MOCK-the-RLS-client unit test (DB-free, runs under the DEFAULT vitest config —
 * NOT vitest.ui.config.ts). It stubs `withOrgContext` so the loader runs against
 * a fake query client returning a representative catalog spread across all 7
 * seeded depts PLUS one unmapped extra dept, then asserts the pure grouping /
 * ordering contract:
 *   (a) exactly 3 canonical sections in SECTION_MAP order;
 *   (b) Commercial section = Commercial + Planning + Procurement fields;
 *       Production section = Production + Technical + MRP fields;
 *   (c) fields are returned in display_order;
 *   (d) an unmapped/extra dept does NOT throw (it lands in a trailing 'other'
 *       bucket rather than vanishing or crashing).
 *
 * Run from apps/web:
 *   node ../../node_modules/vitest/vitest.mjs run --config ../../vitest.config.ts \
 *     'app/[locale]/(app)/(npd)/fa/[productCode]/_actions/__tests__/load-fa-dynamic-sections.test.ts'
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ── Mock the RLS client / withOrgContext seam ────────────────────────────────
// The loader runs its callback inside withOrgContext(ctx => ...). We replace that
// HOF with one that injects a fake ctx whose `client.query` returns canned rows
// based on a tiny SQL matcher — so the test exercises the REAL grouping/ordering
// code with zero DB. The mock path is the SAME module the loader imports, here
// resolved relative to THIS test file.
type Row = Record<string, unknown>;
let catalogRows: Row[] = [];
let permitted = true;

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async <T,>(action: (ctx: unknown) => Promise<T>): Promise<T> => {
    const client = {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      query: async (sql: string, _params?: readonly unknown[]) => {
        if (/from\s+public\.user_roles/i.test(sql)) {
          return { rows: permitted ? [{ ok: true }] : [] };
        }
        if (/from\s+public\.npd_departments/i.test(sql)) {
          return { rows: catalogRows };
        }
        return { rows: [] };
      },
    };
    return action({ userId: 'u-1', orgId: 'o-1', client });
  },
}));

// Representative catalog rows ACROSS ALL 7 depts + one unmapped extra dept.
// The loader orders by dept display_order then df.display_order, so the rows here
// are intentionally shuffled within a dept to prove the loader (not the fixture)
// does the ordering.
function makeRows(): Row[] {
  const r = (
    deptCode: string,
    deptDisplayOrder: number,
    fieldCode: string,
    dfDisplayOrder: number,
    required = false,
    dataType = 'text',
  ): Row => ({
    dept_code: deptCode,
    dept_display_order: deptDisplayOrder,
    field_code: fieldCode,
    field_label: fieldCode.replace(/_/g, ' '),
    field_data_type: dataType,
    df_required: required,
    df_display_order: dfDisplayOrder,
  });

  // Rows are returned in a SCRAMBLED order (NOT the SQL ORDER BY order) so the
  // ordering assertions exercise the loader's own re-sort, not the fixture.
  return [
    r('Procurement', 70, 'Supplier', 1, true), // Commercial & Planning
    r('Commercial', 30, 'Launch_Date', 1, true, 'date'), // Commercial & Planning
    r('Core', 10, 'Product_Name', 2, true), // Core (field out of order)
    r('Production', 40, 'Line', 2, true, 'dropdown'), // Production & Technical
    r('MRP', 60, 'Box', 1, true), // folds into Production & Technical
    r('QualityLab', 99, 'Microbiology_Spec', 1, false), // unmapped extra dept → 'other'
    r('Planning', 20, 'Runs_Per_Week', 2, true, 'number'), // Commercial & Planning
    r('Technical', 50, 'Shelf_Life', 1, true), // Production & Technical
    r('Production', 40, 'Rate', 1, true, 'number'), // Production & Technical (field out of order)
    r('Core', 10, 'Product_Code', 1), // Core (field out of order)
    r('Planning', 20, 'Primary_Ingredient_Pct', 1, true, 'number'), // Commercial & Planning
  ];
}

beforeEach(() => {
  catalogRows = makeRows();
  permitted = true;
  vi.clearAllMocks();
});

const TEST_PRODUCT = 'FG-DYN-001';

describe('loadFaDynamicSections — grouping/ordering (mocked RLS client)', () => {
  it('(a) returns the 3 canonical sections in SECTION_MAP order', async () => {
    const { loadFaDynamicSections } = await import('../load-fa-dynamic-sections');
    const { SECTION_MAP } = await import('../load-fa-dynamic-sections.types');

    const res = await loadFaDynamicSections(TEST_PRODUCT);
    expect(res.ok).toBe(true);

    // The 3 SECTION_MAP sections always lead, in order. (A trailing 'other'
    // bucket may follow for the unmapped dept — asserted separately in (d).)
    const canonicalKeys = res.sections.slice(0, 3).map((s) => s.key);
    expect(canonicalKeys).toEqual(SECTION_MAP.map((s) => s.key));
    expect(canonicalKeys).toEqual(['core', 'commercial', 'production']);

    const canonicalLabels = res.sections.slice(0, 3).map((s) => s.label);
    expect(canonicalLabels).toEqual(['Core', 'Commercial & Planning', 'Production & Technical']);
  });

  it('(b) Commercial section = Commercial+Planning+Procurement; Production = Production+Technical+MRP', async () => {
    const { loadFaDynamicSections } = await import('../load-fa-dynamic-sections');
    const res = await loadFaDynamicSections(TEST_PRODUCT);

    const byKey = Object.fromEntries(res.sections.map((s) => [s.key, s]));

    const commercialDepts = new Set(byKey.commercial.fields.map((f) => f.deptCode));
    expect(commercialDepts).toEqual(new Set(['Commercial', 'Planning', 'Procurement']));
    expect(byKey.commercial.fields.map((f) => f.code)).toEqual(
      expect.arrayContaining(['Launch_Date', 'Runs_Per_Week', 'Primary_Ingredient_Pct', 'Supplier']),
    );

    const productionDepts = new Set(byKey.production.fields.map((f) => f.deptCode));
    expect(productionDepts).toEqual(new Set(['Production', 'Technical', 'MRP']));
    expect(byKey.production.fields.map((f) => f.code)).toEqual(
      expect.arrayContaining(['Line', 'Rate', 'Shelf_Life', 'Box']),
    );

    // Core section holds only Core fields.
    expect(new Set(byKey.core.fields.map((f) => f.deptCode))).toEqual(new Set(['Core']));
  });

  it('(c) fields are ordered by display_order (dept order then df.display_order)', async () => {
    const { loadFaDynamicSections } = await import('../load-fa-dynamic-sections');
    const res = await loadFaDynamicSections(TEST_PRODUCT);
    const byKey = Object.fromEntries(res.sections.map((s) => [s.key, s]));

    // Core: Product_Code (df 1) before Product_Name (df 2) despite reversed input.
    expect(byKey.core.fields.map((f) => f.code)).toEqual(['Product_Code', 'Product_Name']);

    // Within Planning, Primary_Ingredient_Pct (df 1) precedes Runs_Per_Week (df 2);
    // and Planning (dept 20) precedes Commercial (dept 30) — but both rank below the
    // section's overall ordering, which is dept display_order then df display_order.
    const commercialOrder = byKey.commercial.fields.map((f) => `${f.deptCode}:${f.code}`);
    expect(commercialOrder).toEqual([
      'Planning:Primary_Ingredient_Pct',
      'Planning:Runs_Per_Week',
      'Commercial:Launch_Date',
      'Procurement:Supplier',
    ]);

    // Production section: Production(40) then Technical(50) then MRP(60), each by df order.
    const productionOrder = byKey.production.fields.map((f) => `${f.deptCode}:${f.code}`);
    expect(productionOrder).toEqual([
      'Production:Rate',
      'Production:Line',
      'Technical:Shelf_Life',
      'MRP:Box',
    ]);
  });

  it('(d) an unmapped/extra dept does not throw; it lands in a trailing "other" bucket', async () => {
    const { loadFaDynamicSections } = await import('../load-fa-dynamic-sections');
    const res = await loadFaDynamicSections(TEST_PRODUCT);

    const other = res.sections.find((s) => s.key === 'other');
    expect(other).toBeDefined();
    expect(other!.fields.map((f) => f.deptCode)).toEqual(['QualityLab']);
    expect(other!.fields.map((f) => f.code)).toEqual(['Microbiology_Spec']);

    // 'other' is strictly AFTER the 3 canonical sections.
    expect(res.sections.map((s) => s.key)).toEqual(['core', 'commercial', 'production', 'other']);
  });

  it('(d2) with NO unmapped dept, exactly 3 sections are returned (no empty "other")', async () => {
    catalogRows = catalogRows.filter((r) => r.dept_code !== 'QualityLab');
    const { loadFaDynamicSections } = await import('../load-fa-dynamic-sections');
    const res = await loadFaDynamicSections(TEST_PRODUCT);
    expect(res.sections.map((s) => s.key)).toEqual(['core', 'commercial', 'production']);
  });

  it('enforces RBAC: missing npd.fa.read throws FORBIDDEN', async () => {
    permitted = false;
    const { loadFaDynamicSections } = await import('../load-fa-dynamic-sections');
    await expect(loadFaDynamicSections(TEST_PRODUCT)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('validates the product code argument (empty → INVALID_PRODUCT_CODE)', async () => {
    const { loadFaDynamicSections } = await import('../load-fa-dynamic-sections');
    await expect(loadFaDynamicSections('   ')).rejects.toMatchObject({ code: 'INVALID_PRODUCT_CODE' });
  });
});
