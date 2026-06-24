'use server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { orgId: string; client: QueryClient };

type ConfigQueryRow = {
  department_id: string;
  department_code: string;
  department_name: string;
  department_display_order: number;
  department_active: boolean;
  assignment_id: string | null;
  field_id: string | null;
  field_code: string | null;
  field_label: string | null;
  data_type: string | null;
  required: boolean | null;
  visible: boolean | null;
  stage_code: string | null;
  field_display_order: number | null;
};

type DepartmentConfig = {
  id: string;
  code: string;
  name: string;
  display_order: number;
  active: boolean;
  fields: Array<{
    assignment_id: string;
    field_id: string;
    code: string;
    label: string;
    data_type: string;
    required: boolean;
    visible: boolean;
    stage_code: string;
    display_order: number;
  }>;
};

export async function getDepartmentFieldConfig(departmentId?: string): Promise<DepartmentConfig[]> {
  return withOrgContext<DepartmentConfig[]>(async (ctx): Promise<DepartmentConfig[]> => {
    const context = ctx as OrgContextLike;
    const params = departmentId ? [departmentId] : [];
    const { rows } = await context.client.query<ConfigQueryRow>(
      `select d.id::text as department_id,
              d.code as department_code,
              d.name as department_name,
              d.display_order as department_display_order,
              d.active as department_active,
              df.id::text as assignment_id,
              fc.id::text as field_id,
              fc.code as field_code,
              fc.label as field_label,
              fc.data_type,
              df.required,
              df.visible,
              df.stage_code,
              df.display_order as field_display_order
         from public.npd_departments d
         left join public.npd_department_field df
           on df.department_id = d.id
          and df.org_id = d.org_id
          and df.visible = true
         left join public.npd_field_catalog fc
           on fc.id = df.field_id
          and fc.org_id = d.org_id
        where d.org_id = app.current_org_id()
          ${departmentId ? 'and d.id = $1::uuid' : ''}
        order by d.display_order, lower(d.name), df.display_order nulls last, lower(fc.label) nulls last`,
      params,
    );

    const departments = new Map<string, DepartmentConfig>();
    for (const row of rows) {
      let department = departments.get(row.department_id);
      if (!department) {
        department = {
          id: row.department_id,
          code: row.department_code,
          name: row.department_name,
          display_order: row.department_display_order,
          active: row.department_active,
          fields: [],
        };
        departments.set(row.department_id, department);
      }

      if (row.assignment_id && row.field_id && row.field_code && row.field_label && row.data_type && row.stage_code) {
        department.fields.push({
          assignment_id: row.assignment_id,
          field_id: row.field_id,
          code: row.field_code,
          label: row.field_label,
          data_type: row.data_type,
          required: row.required ?? false,
          visible: row.visible ?? true,
          stage_code: row.stage_code,
          display_order: row.field_display_order ?? 0,
        });
      }
    }

    return Array.from(departments.values());
  });
}
