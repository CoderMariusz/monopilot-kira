import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
const hasPermissionMock = vi.fn(async () => true);
const revalidateLocalizedMock = vi.fn();

vi.mock('../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: <T,>(fn: (ctx: unknown) => Promise<T>) =>
    fn({ userId: 'user-1', orgId: 'org-1', client: { query: queryMock } }),
}));

vi.mock('../../../../../lib/auth/has-permission', () => ({
  hasPermission: (...args: unknown[]) => hasPermissionMock(...args),
}));

vi.mock('../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: (...args: unknown[]) => revalidateLocalizedMock(...args),
}));

type FieldConfig = {
  deptCode?: string;
  dataType?: string;
  dropdownSource?: string | null;
  required?: boolean;
  auto?: boolean;
};

const projectId = '11111111-1111-4111-8111-111111111111';
let fields: Record<string, FieldConfig>;
let projectColumns: Set<string>;
let previousValues: Record<string, string | null>;

function wireQueries() {
  queryMock.mockImplementation(async (sql: string, params?: readonly unknown[]) => {
    const text = String(sql);
    if (
      /from\s+public\.npd_departments\s+d/i.test(text) &&
      /join\s+public\.npd_department_field\s+df/i.test(text) &&
      /join\s+public\.npd_field_catalog\s+f/i.test(text)
    ) {
      const columnName = String(params?.[0] ?? '').toLowerCase();
      const field = fields[columnName];
      return {
        rows: field
          ? [
              {
                dept_code: field.deptCode ?? 'Core',
                column_key: columnName,
                data_type: field.dataType ?? 'text',
                field_type: null,
                dropdown_source: field.dropdownSource ?? null,
                required_for_done: field.required === true,
              },
            ]
          : [],
      };
    }
    if (/from\s+public\.npd_field_catalog\s+f/i.test(text) && /f\.is_auto\s*=\s*true/i.test(text)) {
      const columnName = String(params?.[0] ?? '').toLowerCase();
      return { rows: fields[columnName]?.auto ? [{ ok: true }] : [] };
    }
    if (/from\s+"Reference"\."PackSizes"/i.test(text)) {
      return { rows: [{ value: '100g' }, { value: '200g' }] };
    }
    if (/information_schema\.columns/i.test(text) && /table_name\s*=\s*'npd_projects'/i.test(text)) {
      const columnName = String(params?.[0] ?? '');
      return { rows: projectColumns.has(columnName) ? [{ ok: true }] : [] };
    }
    if (/set_config\('app\.fa_actor_user_id'/i.test(text)) {
      return { rows: [] };
    }
    if (/set\s+name\s*=\s*\$2/i.test(text)) {
      const value = params?.[1] == null ? null : String(params[1]);
      return { rows: [{ previous_value: previousValues.product_name ?? null, new_value: value }] };
    }
    if (/set\s+"pack_size"\s*=\s*\$2/i.test(text)) {
      const value = params?.[1] == null ? null : String(params[1]);
      return { rows: [{ previous_value: previousValues.pack_size ?? null, new_value: value }] };
    }
    if (/field_values\s*=\s*case/i.test(text)) {
      const key = String(params?.[1] ?? '');
      const value = params?.[2] == null ? null : String(params[2]);
      return { rows: [{ previous_value: previousValues[key] ?? null, new_value: value }] };
    }
    if (/insert\s+into\s+public\.outbox_events/i.test(text)) {
      return { rows: [], rowCount: 1 };
    }
    return { rows: [] };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  hasPermissionMock.mockResolvedValue(true);
  fields = {
    product_name: { deptCode: 'Core', dataType: 'text' },
    pack_size: { deptCode: 'Core', dataType: 'text' },
    case_format: { deptCode: 'Packaging', dataType: 'text' },
    private_note: { deptCode: 'Core', dataType: 'text' },
    auto_margin: { deptCode: 'Core', dataType: 'text', auto: true },
  };
  projectColumns = new Set(['pack_size']);
  previousValues = {
    product_name: 'Old Project',
    pack_size: '100g',
    private_note: 'old note',
  };
  wireQueries();
});

afterEach(() => {
  queryMock.mockReset();
});

describe('saveStageDeptField pre-FG project writes', () => {
  it('enforces the owning department permission', async () => {
    hasPermissionMock.mockResolvedValue(false);
    const { saveStageDeptField } = await import('../save-stage-dept-field');

    await expect(
      saveStageDeptField({ projectId, productCode: null, fieldCode: 'pack_size', value: '200g' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(queryMock.mock.calls.some((call) => /update\s+public\.npd_projects/i.test(String(call[0])))).toBe(false);
  });

  it('writes product_name through the project name alias', async () => {
    const { saveStageDeptField } = await import('../save-stage-dept-field');

    const result = await saveStageDeptField({
      projectId,
      productCode: null,
      fieldCode: 'product_name',
      value: 'New Project',
    });

    expect(result).toEqual({ previousValue: 'Old Project', newValue: 'New Project', builtReset: false });
    expect(queryMock.mock.calls.some((call) => /set\s+name\s*=\s*\$2/i.test(String(call[0])))).toBe(true);
    expect(revalidateLocalizedMock).toHaveBeenCalledWith(`/npd/pipeline/${projectId}`);
  });

  it('writes catalog fields to direct npd_projects columns when whitelisted by information_schema', async () => {
    const { saveStageDeptField } = await import('../save-stage-dept-field');

    const result = await saveStageDeptField({
      projectId,
      productCode: null,
      fieldCode: 'pack_size',
      value: '200g',
    });

    expect(result).toEqual({ previousValue: '100g', newValue: '200g', builtReset: false });
    expect(queryMock.mock.calls.some((call) => /set\s+"pack_size"\s*=\s*\$2/i.test(String(call[0])))).toBe(true);
  });

  it('writes non-column catalog fields to field_values and clears keys on null', async () => {
    const { saveStageDeptField } = await import('../save-stage-dept-field');

    const written = await saveStageDeptField({
      projectId,
      productCode: null,
      fieldCode: 'private_note',
      value: 'new note',
    });
    expect(written).toEqual({ previousValue: 'old note', newValue: 'new note', builtReset: false });

    const cleared = await saveStageDeptField({
      projectId,
      productCode: null,
      fieldCode: 'private_note',
      value: null,
    });
    expect(cleared).toEqual({ previousValue: 'old note', newValue: null, builtReset: false });
    expect(queryMock.mock.calls.some((call) => /field_values\s*-\s*\$2/i.test(String(call[0])))).toBe(true);
  });

  it('rejects dropdown values outside the configured source', async () => {
    fields.pack_size = { deptCode: 'Core', dataType: 'text', dropdownSource: 'PackSizes' };
    const { saveStageDeptField } = await import('../save-stage-dept-field');

    await expect(
      saveStageDeptField({ projectId, productCode: null, fieldCode: 'pack_size', value: '999g' }),
    ).rejects.toMatchObject({ code: 'INVALID_VALUE' });

    expect(queryMock.mock.calls.some((call) => /update\s+public\.npd_projects/i.test(String(call[0])))).toBe(false);
  });

  it('rejects auto-derived columns as read-only', async () => {
    const { saveStageDeptField } = await import('../save-stage-dept-field');

    await expect(
      saveStageDeptField({ projectId, productCode: null, fieldCode: 'auto_margin', value: '10' }),
    ).rejects.toMatchObject({ code: 'READ_ONLY_COLUMN' });

    expect(queryMock.mock.calls.some((call) => /information_schema\.columns/i.test(String(call[0])))).toBe(false);
  });
});
