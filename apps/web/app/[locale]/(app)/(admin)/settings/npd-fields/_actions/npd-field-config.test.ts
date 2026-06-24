import { beforeEach, describe, expect, it, vi } from 'vitest';

type QueryCall = { sql: string; params: readonly unknown[] };

const harness = vi.hoisted(() => ({
  calls: [] as QueryCall[],
  permissionGranted: true,
  departmentRows: [] as Array<Record<string, unknown>>,
  fieldRows: [] as Array<Record<string, unknown>>,
  assignmentRows: [] as Array<Record<string, unknown>>,
  joinedRows: [] as Array<Record<string, unknown>>,
}));

function makeClient() {
  return {
    async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []) {
      harness.calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (normalized.includes('from public.user_roles')) {
        return {
          rows: (harness.permissionGranted ? [{ ok: true }] : []) as T[],
          rowCount: harness.permissionGranted ? 1 : 0,
        };
      }

      if (normalized.startsWith('select d.id::text as department_id')) {
        return { rows: harness.joinedRows as T[], rowCount: harness.joinedRows.length };
      }

      if (normalized.includes('from public.npd_departments')) {
        return { rows: harness.departmentRows as T[], rowCount: harness.departmentRows.length };
      }

      if (normalized.includes('insert into public.npd_departments')) {
        return { rows: harness.departmentRows.slice(0, 1) as T[], rowCount: harness.departmentRows.length > 0 ? 1 : 0 };
      }

      if (normalized.includes('insert into public.npd_field_catalog')) {
        return { rows: harness.fieldRows.slice(0, 1) as T[], rowCount: harness.fieldRows.length > 0 ? 1 : 0 };
      }

      if (normalized.includes('insert into public.npd_department_field')) {
        return { rows: harness.assignmentRows.slice(0, 1) as T[], rowCount: harness.assignmentRows.length > 0 ? 1 : 0 };
      }

      return { rows: [] as T[], rowCount: 0 };
    },
  };
}

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (fn: (ctx: unknown) => Promise<unknown>) =>
    fn({
      userId: '11111111-1111-4111-8111-111111111111',
      orgId: '22222222-2222-4222-8222-222222222222',
      client: makeClient(),
    }),
  ),
}));

describe('NPD field config actions', () => {
  beforeEach(() => {
    harness.calls = [];
    harness.permissionGranted = true;
    harness.departmentRows = [
      {
        id: '33333333-3333-4333-8333-333333333333',
        org_id: '22222222-2222-4222-8222-222222222222',
        code: 'RND',
        name: 'R&D',
        display_order: 10,
        active: true,
        created_at: '2026-06-24T00:00:00.000Z',
      },
    ];
    harness.fieldRows = [
      {
        id: '44444444-4444-4444-8444-444444444444',
        org_id: '22222222-2222-4222-8222-222222222222',
        code: 'target_ph',
        label: 'Target pH',
        data_type: 'number',
        validation_json: { min: 0, max: 14 },
        help_text: null,
        active: true,
      },
    ];
    harness.assignmentRows = [
      {
        id: '55555555-5555-4555-8555-555555555555',
        org_id: '22222222-2222-4222-8222-222222222222',
        department_id: '33333333-3333-4333-8333-333333333333',
        field_id: '44444444-4444-4444-8444-444444444444',
        required: true,
        visible: true,
        stage_code: 'brief',
        display_order: 1,
      },
    ];
    harness.joinedRows = [
      {
        department_id: '33333333-3333-4333-8333-333333333333',
        department_code: 'RND',
        department_name: 'R&D',
        department_display_order: 10,
        department_active: true,
        assignment_id: '55555555-5555-4555-8555-555555555555',
        field_id: '44444444-4444-4444-8444-444444444444',
        field_code: 'target_ph',
        field_label: 'Target pH',
        data_type: 'number',
        required: true,
        visible: true,
        stage_code: 'brief',
        field_display_order: 1,
      },
    ];
    vi.clearAllMocks();
  });

  it('listDepartments returns seeded rows', async () => {
    const { listDepartments } = await import('./npd-field-config');

    const rows = await listDepartments();

    expect(rows).toEqual(harness.departmentRows);
    const call = harness.calls.find((entry) => entry.sql.includes('from public.npd_departments'));
    expect(call?.sql).toContain('app.current_org_id()');
    expect(call?.sql).toContain('order by display_order');
  });

  it('createField rejects invalid data_type with a clear error', async () => {
    const { createField } = await import('./npd-field-config');

    await expect(
      createField({ code: 'bad', label: 'Bad', data_type: 'currency' }),
    ).rejects.toThrow('Invalid data_type "currency". Expected one of: text, number, integer, boolean, date, datetime, dropdown, formula, json.');
  });

  it('assignFieldToDepartment rejects invalid stage_code with a clear error', async () => {
    const { assignFieldToDepartment } = await import('./npd-field-config');

    await expect(
      assignFieldToDepartment({
        department_id: '33333333-3333-4333-8333-333333333333',
        field_id: '44444444-4444-4444-8444-444444444444',
        stage_code: 'launch',
      }),
    ).rejects.toThrow('Invalid stage_code "launch". Expected one of: brief, recipe, packaging, trial, sensory, pilot, approval, handoff.');
  });

  it('RBAC gate denies createDepartment when user lacks npd.schema.edit', async () => {
    const { createDepartment } = await import('./npd-field-config');
    harness.permissionGranted = false;

    await expect(
      createDepartment({ code: 'QA', name: 'Quality', display_order: 20, active: true }),
    ).rejects.toThrow('Forbidden: missing npd.schema.edit.');

    const permissionCall = harness.calls.find((entry) => entry.sql.includes('from public.user_roles'));
    expect(permissionCall?.params).toEqual([
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      'npd.schema.edit',
    ]);
  });

  it('getDepartmentFieldConfig returns the joined department/field shape', async () => {
    const { getDepartmentFieldConfig } = await import('./get-department-field-config');

    const rows = await getDepartmentFieldConfig('33333333-3333-4333-8333-333333333333');

    expect(rows).toEqual([
      {
        id: '33333333-3333-4333-8333-333333333333',
        code: 'RND',
        name: 'R&D',
        display_order: 10,
        active: true,
        fields: [
          {
            assignment_id: '55555555-5555-4555-8555-555555555555',
            field_id: '44444444-4444-4444-8444-444444444444',
            code: 'target_ph',
            label: 'Target pH',
            data_type: 'number',
            required: true,
            visible: true,
            stage_code: 'brief',
            display_order: 1,
          },
        ],
      },
    ]);
    const joinCall = harness.calls.find((entry) => entry.sql.includes('left join public.npd_department_field'));
    expect(joinCall?.sql).toContain('left join public.npd_field_catalog');
    expect(joinCall?.params).toEqual(['33333333-3333-4333-8333-333333333333']);
  });
});
