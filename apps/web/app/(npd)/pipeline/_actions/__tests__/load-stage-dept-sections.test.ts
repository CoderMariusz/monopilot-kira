import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
const hasPermissionMock = vi.fn(async () => true);

vi.mock('../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: <T,>(fn: (ctx: unknown) => Promise<T>) =>
    fn({ userId: 'user-1', orgId: 'org-1', client: { query: queryMock } }),
}));

vi.mock('../../../../../lib/auth/has-permission', () => ({
  hasPermission: (...args: unknown[]) => hasPermissionMock(...args),
}));

type CatalogRowInput = {
  dept: string;
  stage: string;
  field: string;
  label: string;
  required?: boolean;
  order?: number;
};

const catalogRows: CatalogRowInput[] = [
  { dept: 'Core', stage: 'brief', field: 'product_name', label: 'Product name', required: true, order: 10 },
  { dept: 'Core', stage: 'brief', field: 'pack_size', label: 'Pack size', required: true, order: 20 },
  { dept: 'Packaging', stage: 'packaging', field: 'case_format', label: 'Case format', required: true, order: 10 },
];

function wireQueries(opts: { productCode: string | null; values?: Record<string, unknown> }) {
  queryMock.mockImplementation(async (sql: string, params?: readonly unknown[]) => {
    const text = String(sql);
    if (/from\s+public\.npd_projects\s+p/i.test(text)) {
      return { rows: [{ product_code: opts.productCode }] };
    }
    if (/from\s+public\.npd_departments\s+d/i.test(text) && /d\.stage_code\s*=\s*\$1::text/i.test(text)) {
      const stage = String(params?.[0] ?? '');
      return {
        rows: catalogRows
          .filter((row) => row.stage === stage)
          .map((row, index) => ({
            dept_code: row.dept,
            dept_name: row.dept,
            dept_display_order: index + 1,
            field_code: row.field,
            field_label: row.label,
            field_data_type: 'text',
            field_is_auto: false,
            field_auto_source: null,
            dropdown_source: null,
            df_required: row.required === true,
            df_display_order: row.order ?? index,
          })),
      };
    }
    if (/to_jsonb\(p\.\*\)\s+as\s+product_json/i.test(text)) {
      return { rows: [{ product_json: opts.values ?? {} }] };
    }
    return { rows: [] };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  hasPermissionMock.mockResolvedValue(true);
});

afterEach(() => {
  queryMock.mockReset();
});

describe('loadStageDeptSections', () => {
  it('filters department fields by npd_departments.stage_code', async () => {
    wireQueries({ productCode: 'FG-001', values: { product_name: 'Pie', pack_size: '' } });
    const { loadStageDeptSections } = await import('../load-stage-dept-sections');

    const result = await loadStageDeptSections({ projectId: '11111111-1111-4111-8111-111111111111', stage: 'brief' });

    expect(result.productCode).toBe('FG-001');
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]?.deptCode).toBe('Core');
    expect(result.sections[0]?.fields.map((field) => field.code)).toEqual(['product_name', 'pack_size']);
    const catalogSql = queryMock.mock.calls.map((call) => String(call[0])).find((sql) => /d\.stage_code/i.test(sql));
    expect(catalogSql).toMatch(/d\.stage_code\s*=\s*\$1::text/i);
    expect(queryMock.mock.calls.some((call) => call[1]?.[0] === 'brief')).toBe(true);
  });

  it('returns read-only sections with no_fg_linked when the project has no FG mapping', async () => {
    wireQueries({ productCode: null });
    const { loadStageDeptSections } = await import('../load-stage-dept-sections');

    const result = await loadStageDeptSections({ projectId: '11111111-1111-4111-8111-111111111111', stage: 'brief' });

    expect(result.productCode).toBeNull();
    expect(result.no_fg_linked).toBe(true);
    expect(result.sections[0]?.readOnly).toBe(true);
    expect(result.sections[0]?.no_fg_linked).toBe(true);
    expect(result.sections[0]?.fields.every((field) => field.readOnly)).toBe(true);
    expect(queryMock.mock.calls.some((call) => /to_jsonb\(p\.\*\)/i.test(String(call[0])))).toBe(false);
  });

  it('counts required filled and missing fields for gate consumers', async () => {
    wireQueries({ productCode: 'FG-001', values: { product_name: 'Pie', pack_size: '' } });
    const { getStageRequiredFieldsStatus } = await import('../load-stage-dept-sections');

    const result = await getStageRequiredFieldsStatus('11111111-1111-4111-8111-111111111111', 'brief');

    expect(result).toEqual({
      requiredTotal: 2,
      requiredFilled: 1,
      missing: [{ deptCode: 'Core', fieldCode: 'pack_size', label: 'Pack size' }],
    });
  });
});
