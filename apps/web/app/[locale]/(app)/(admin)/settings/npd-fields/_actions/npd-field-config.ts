'use server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

const EDIT_PERMISSION = 'npd.schema.edit';

const DATA_TYPES = ['text', 'number', 'integer', 'boolean', 'date', 'datetime', 'dropdown', 'formula', 'json'] as const;
const STAGE_CODES = ['brief', 'recipe', 'packaging', 'trial', 'sensory', 'pilot', 'approval', 'handoff'] as const;

type DataType = (typeof DATA_TYPES)[number];
type StageCode = (typeof STAGE_CODES)[number];
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

type DepartmentRow = {
  id: string;
  org_id: string;
  code: string;
  name: string;
  display_order: number;
  active: boolean;
  created_at: string;
};

type FieldCatalogRow = {
  id: string;
  org_id: string;
  code: string;
  label: string;
  data_type: DataType;
  validation_json: JsonValue;
  help_text: string | null;
  active: boolean;
  is_auto: boolean;
  auto_source_field: string | null;
};

type DepartmentFieldRow = {
  id: string;
  org_id: string;
  department_id: string;
  field_id: string;
  required: boolean;
  visible: boolean;
  stage_code: StageCode;
  display_order: number;
};

type CreateDepartmentInput = {
  code: string;
  name: string;
  display_order?: number;
  active?: boolean;
};

type UpdateDepartmentPatch = {
  name?: string;
  display_order?: number;
  active?: boolean;
};

type CreateFieldInput = {
  code: string;
  label: string;
  data_type: string;
  validation_json?: JsonValue;
  help_text?: string | null;
  active?: boolean;
};

type UpdateFieldPatch = {
  label?: string;
  data_type?: string;
  validation_json?: JsonValue;
  help_text?: string | null;
  active?: boolean;
  is_auto?: boolean;
  auto_source_field?: string | null;
};

type UpdateFieldResult = FieldCatalogRow | { ok: false; error: string };
type DeleteDepartmentResult = { ok: true; id: string } | { ok: false; error: 'cannot_delete_core' | 'department_in_use' };
type DeleteFieldResult = { ok: true; id: string } | { ok: false; error: 'field_in_use' };

type AssignFieldInput = {
  department_id: string;
  field_id: string;
  required?: boolean;
  visible?: boolean;
  stage_code?: string;
  display_order?: number;
};

type UpdateAssignmentPatch = {
  required?: boolean;
  visible?: boolean;
  stage_code?: string;
  display_order?: number;
};

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function readRequiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${key} is required.`);
  }
  return value.trim();
}

function readOptionalString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`${key} must be a string.`);
  return value.trim();
}

function readOptionalNullableString(input: Record<string, unknown>, key: string): string | null | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error(`${key} must be a string.`);
  return value.trim();
}

function readOptionalInteger(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new Error(`${key} must be an integer.`);
  return value;
}

function readOptionalBoolean(input: Record<string, unknown>, key: string): boolean | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new Error(`${key} must be a boolean.`);
  return value;
}

function readOptionalJson(input: Record<string, unknown>, key: string): JsonValue | undefined {
  if (!(key in input)) return undefined;
  return input[key] as JsonValue;
}

function validateDataType(value: string): DataType {
  if ((DATA_TYPES as readonly string[]).includes(value)) return value as DataType;
  throw new Error(`Invalid data_type "${value}". Expected one of: ${DATA_TYPES.join(', ')}.`);
}

function validateStageCode(value: string): StageCode {
  if ((STAGE_CODES as readonly string[]).includes(value)) return value as StageCode;
  throw new Error(`Invalid stage_code "${value}". Expected one of: ${STAGE_CODES.join(', ')}.`);
}

function parseCreateDepartment(input: unknown): CreateDepartmentInput {
  const record = assertRecord(input, 'Department input');
  return {
    code: readRequiredString(record, 'code'),
    name: readRequiredString(record, 'name'),
    display_order: readOptionalInteger(record, 'display_order'),
    active: readOptionalBoolean(record, 'active'),
  };
}

function parseUpdateDepartmentPatch(input: unknown): UpdateDepartmentPatch {
  const record = assertRecord(input, 'Department patch');
  return {
    name: readOptionalString(record, 'name'),
    display_order: readOptionalInteger(record, 'display_order'),
    active: readOptionalBoolean(record, 'active'),
  };
}

function parseCreateField(input: unknown): CreateFieldInput {
  const record = assertRecord(input, 'Field input');
  const dataType = validateDataType(readRequiredString(record, 'data_type'));
  return {
    code: readRequiredString(record, 'code'),
    label: readRequiredString(record, 'label'),
    data_type: dataType,
    validation_json: readOptionalJson(record, 'validation_json'),
    help_text: readOptionalNullableString(record, 'help_text'),
    active: readOptionalBoolean(record, 'active'),
  };
}

function parseUpdateFieldPatch(input: unknown): UpdateFieldPatch {
  const record = assertRecord(input, 'Field patch');
  const dataType = readOptionalString(record, 'data_type');
  return {
    label: readOptionalString(record, 'label'),
    data_type: dataType === undefined ? undefined : validateDataType(dataType),
    validation_json: readOptionalJson(record, 'validation_json'),
    help_text: readOptionalNullableString(record, 'help_text'),
    active: readOptionalBoolean(record, 'active'),
    is_auto: readOptionalBoolean(record, 'is_auto'),
    auto_source_field: readOptionalNullableString(record, 'auto_source_field'),
  };
}

function parseAssignField(input: unknown): AssignFieldInput {
  const record = assertRecord(input, 'Assignment input');
  const stageCode = readOptionalString(record, 'stage_code');
  return {
    department_id: readRequiredString(record, 'department_id'),
    field_id: readRequiredString(record, 'field_id'),
    required: readOptionalBoolean(record, 'required'),
    visible: readOptionalBoolean(record, 'visible'),
    stage_code: stageCode === undefined ? undefined : validateStageCode(stageCode),
    display_order: readOptionalInteger(record, 'display_order'),
  };
}

function parseUpdateAssignmentPatch(input: unknown): UpdateAssignmentPatch {
  const record = assertRecord(input, 'Assignment patch');
  const stageCode = readOptionalString(record, 'stage_code');
  return {
    required: readOptionalBoolean(record, 'required'),
    visible: readOptionalBoolean(record, 'visible'),
    stage_code: stageCode === undefined ? undefined : validateStageCode(stageCode),
    display_order: readOptionalInteger(record, 'display_order'),
  };
}

function definedEntries<T extends Record<string, unknown>>(patch: T): Array<[keyof T & string, unknown]> {
  return Object.entries(patch).filter((entry): entry is [keyof T & string, unknown] => entry[1] !== undefined);
}

async function requireNpdSchemaEdit({ client, userId, orgId }: OrgContextLike): Promise<void> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or r.code = $3
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [userId, orgId, EDIT_PERMISSION],
  );
  if (rows.length === 0) throw new Error(`Forbidden: missing ${EDIT_PERMISSION}.`);
}

async function selectDepartmentById(context: OrgContextLike, id: string): Promise<DepartmentRow> {
  const { rows } = await context.client.query<DepartmentRow>(
    `select id::text, org_id::text, code, name, display_order, active, created_at::text
       from public.npd_departments
      where id = $1::uuid
        and org_id = app.current_org_id()
      limit 1`,
    [id],
  );
  const row = rows[0];
  if (!row) throw new Error('NPD department not found.');
  return row;
}

async function selectFieldById(context: OrgContextLike, id: string): Promise<FieldCatalogRow> {
  const { rows } = await context.client.query<FieldCatalogRow>(
    `select id::text, org_id::text, code, label, data_type, validation_json, help_text, active, is_auto, auto_source_field
       from public.npd_field_catalog
      where id = $1::uuid
        and org_id = app.current_org_id()
      limit 1`,
    [id],
  );
  const row = rows[0];
  if (!row) throw new Error('NPD field not found.');
  return row;
}

async function selectAssignmentById(context: OrgContextLike, id: string): Promise<DepartmentFieldRow> {
  const { rows } = await context.client.query<DepartmentFieldRow>(
    `select id::text, org_id::text, department_id::text, field_id::text, required, visible, stage_code, display_order
       from public.npd_department_field
      where id = $1::uuid
        and org_id = app.current_org_id()
      limit 1`,
    [id],
  );
  const row = rows[0];
  if (!row) throw new Error('NPD department field assignment not found.');
  return row;
}

export async function listDepartments(): Promise<DepartmentRow[]> {
  return withOrgContext<DepartmentRow[]>(async (ctx): Promise<DepartmentRow[]> => {
    const context = ctx as OrgContextLike;
    const { rows } = await context.client.query<DepartmentRow>(
      `select id::text, org_id::text, code, name, display_order, active, created_at::text
         from public.npd_departments
        where org_id = app.current_org_id()
        order by display_order, lower(name), lower(code)`,
    );
    return rows;
  });
}

export async function createDepartment(input: unknown): Promise<DepartmentRow> {
  const parsed = parseCreateDepartment(input);
  return withOrgContext<DepartmentRow>(async (ctx): Promise<DepartmentRow> => {
    const context = ctx as OrgContextLike;
    await requireNpdSchemaEdit(context);
    const { rows } = await context.client.query<DepartmentRow>(
      `insert into public.npd_departments (org_id, code, name, display_order, active)
       values (app.current_org_id(), $1, $2, $3, $4)
       returning id::text, org_id::text, code, name, display_order, active, created_at::text`,
      [parsed.code, parsed.name, parsed.display_order ?? 0, parsed.active ?? true],
    );
    const row = rows[0];
    if (!row) throw new Error('Failed to create NPD department.');
    return row;
  });
}

export async function updateDepartment(id: string, patch: unknown): Promise<DepartmentRow> {
  const parsed = parseUpdateDepartmentPatch(patch);
  const updates = definedEntries(parsed);
  return withOrgContext<DepartmentRow>(async (ctx): Promise<DepartmentRow> => {
    const context = ctx as OrgContextLike;
    await requireNpdSchemaEdit(context);
    if (updates.length === 0) return selectDepartmentById(context, id);
    if (parsed.active === false) {
      const { rows: departmentRows } = await context.client.query<{ code: string }>(
        `select code
           from public.npd_departments
          where id = $1::uuid
            and org_id = app.current_org_id()
          limit 1`,
        [id],
      );
      if (departmentRows[0]?.code.toLowerCase() === 'core') {
        throw new Error('cannot_deactivate_core');
      }

      const { rows: activeRows } = await context.client.query<{ count: string }>(
        `select count(*)::text as count
           from public.npd_departments
          where org_id = app.current_org_id()
            and active = true
            and id <> $1::uuid`,
        [id],
      );
      if (activeRows[0]?.count === '0') {
        throw new Error('cannot_deactivate_last');
      }
    }
    const setClause = updates.map(([key], index) => `${key} = $${index + 2}`).join(', ');
    const { rows } = await context.client.query<DepartmentRow>(
      `update public.npd_departments
          set ${setClause}
        where id = $1::uuid
          and org_id = app.current_org_id()
        returning id::text, org_id::text, code, name, display_order, active, created_at::text`,
      [id, ...updates.map(([, value]) => value)],
    );
    const row = rows[0];
    if (!row) throw new Error('NPD department not found.');
    return row;
  });
}

export async function setDepartmentActive(id: string, active: boolean): Promise<DepartmentRow> {
  return updateDepartment(id, { active });
}

export async function deleteDepartment(id: string): Promise<DeleteDepartmentResult> {
  return withOrgContext<DeleteDepartmentResult>(async (ctx): Promise<DeleteDepartmentResult> => {
    const context = ctx as OrgContextLike;
    await requireNpdSchemaEdit(context);
    const { rows: departmentRows } = await context.client.query<{ code: string }>(
      `select code
         from public.npd_departments
        where id = $1::uuid
          and org_id = app.current_org_id()
        limit 1`,
      [id],
    );
    const department = departmentRows[0];
    if (!department) throw new Error('NPD department not found.');
    if (department.code.toLowerCase() === 'core') {
      return { ok: false, error: 'cannot_delete_core' };
    }

    const { rows: projectRows } = await context.client.query<{ exists: boolean }>(
      `select exists (
         select 1
           from public.npd_projects
          where department_id = $1::uuid
            and org_id = app.current_org_id()
       ) as exists`,
      [id],
    );
    if (projectRows[0]?.exists) {
      return { ok: false, error: 'department_in_use' };
    }

    await context.client.query(
      `delete from public.npd_departments
        where id = $1::uuid
          and org_id = app.current_org_id()`,
      [id],
    );
    return { ok: true, id };
  });
}

export async function listFieldCatalog(): Promise<FieldCatalogRow[]> {
  return withOrgContext<FieldCatalogRow[]>(async (ctx): Promise<FieldCatalogRow[]> => {
    const context = ctx as OrgContextLike;
    const { rows } = await context.client.query<FieldCatalogRow>(
      `select id::text, org_id::text, code, label, data_type, validation_json, help_text, active, is_auto, auto_source_field
         from public.npd_field_catalog
        where org_id = app.current_org_id()
        order by lower(label), lower(code)`,
    );
    return rows;
  });
}

export async function createField(input: unknown): Promise<FieldCatalogRow> {
  const parsed = parseCreateField(input);
  return withOrgContext<FieldCatalogRow>(async (ctx): Promise<FieldCatalogRow> => {
    const context = ctx as OrgContextLike;
    await requireNpdSchemaEdit(context);
    const { rows } = await context.client.query<FieldCatalogRow>(
      `insert into public.npd_field_catalog (org_id, code, label, data_type, validation_json, help_text, active)
       values (app.current_org_id(), $1, $2, $3, $4::jsonb, $5, $6)
       returning id::text, org_id::text, code, label, data_type, validation_json, help_text, active, is_auto, auto_source_field`,
      [
        parsed.code,
        parsed.label,
        parsed.data_type,
        JSON.stringify(parsed.validation_json ?? {}),
        parsed.help_text ?? null,
        parsed.active ?? true,
      ],
    );
    const row = rows[0];
    if (!row) throw new Error('Failed to create NPD field.');
    return row;
  });
}

export async function updateField(id: string, patch: unknown): Promise<UpdateFieldResult> {
  const parsed = parseUpdateFieldPatch(patch);
  let updates = definedEntries(parsed);
  return withOrgContext<UpdateFieldResult>(async (ctx): Promise<UpdateFieldResult> => {
    const context = ctx as OrgContextLike;
    await requireNpdSchemaEdit(context);
    if (updates.length === 0) return selectFieldById(context, id);
    const current = await selectFieldById(context, id);
    const resolvedIsAuto = parsed.is_auto ?? current.is_auto;
    let resolvedAutoSourceField = parsed.auto_source_field === undefined ? current.auto_source_field : parsed.auto_source_field;

    if (resolvedIsAuto) {
      if (resolvedAutoSourceField === null || resolvedAutoSourceField === '') {
        return { ok: false, error: 'auto_source_required' };
      }
      if (resolvedAutoSourceField === current.code) {
        return { ok: false, error: 'auto_source_self' };
      }
      const { rows: sourceRows } = await context.client.query<{
        code: string;
        is_auto: boolean;
        auto_source_field: string | null;
      }>(
        `select code, is_auto, auto_source_field
           from public.npd_field_catalog
          where org_id = app.current_org_id()
            and code = $1::text
            and active = true
          limit 1`,
        [resolvedAutoSourceField],
      );
      const source = sourceRows[0];
      if (!source) {
        return { ok: false, error: 'auto_source_not_found' };
      }
      if (source.is_auto && source.auto_source_field === current.code) {
        return { ok: false, error: 'auto_source_cycle' };
      }
    } else if (parsed.is_auto === false) {
      parsed.auto_source_field = null;
      updates = definedEntries(parsed);
    }

    const params = updates.map(([key, value]) => (key === 'validation_json' ? JSON.stringify(value ?? {}) : value));
    const casts: Record<keyof UpdateFieldPatch & string, string> = {
      label: 'text',
      data_type: 'text',
      validation_json: 'jsonb',
      help_text: 'text',
      active: 'boolean',
      is_auto: 'boolean',
      auto_source_field: 'text',
    };
    const setClause = updates
      .map(([key], index) => `${key} = $${index + 2}::${casts[key]}`)
      .join(', ');
    const { rows } = await context.client.query<FieldCatalogRow>(
      `update public.npd_field_catalog
          set ${setClause}
        where id = $1::uuid
          and org_id = app.current_org_id()
        returning id::text, org_id::text, code, label, data_type, validation_json, help_text, active, is_auto, auto_source_field`,
      [id, ...params],
    );
    const row = rows[0];
    if (!row) throw new Error('NPD field not found.');
    return row;
  });
}

export async function setFieldActive(id: string, active: boolean): Promise<UpdateFieldResult> {
  return updateField(id, { active });
}

export async function deleteField(id: string): Promise<DeleteFieldResult> {
  return withOrgContext<DeleteFieldResult>(async (ctx): Promise<DeleteFieldResult> => {
    const context = ctx as OrgContextLike;
    await requireNpdSchemaEdit(context);
    const { rows: fieldRows } = await context.client.query<{ ok: number }>(
      `select 1 as ok
         from public.npd_field_catalog
        where id = $1::uuid
          and org_id = app.current_org_id()
        limit 1`,
      [id],
    );
    if (!fieldRows[0]) throw new Error('NPD field not found.');

    const { rows: assignmentRows } = await context.client.query<{ exists: boolean }>(
      `select exists (
         select 1
           from public.npd_department_field
          where field_id = $1::uuid
            and org_id = app.current_org_id()
       ) as exists`,
      [id],
    );
    if (assignmentRows[0]?.exists) {
      return { ok: false, error: 'field_in_use' };
    }

    // field VALUES live as physical columns on public.product / fg_npd_ext - this is metadata-only removal; orphaned physical columns are harmless.
    await context.client.query(
      `delete from public.npd_field_catalog
        where id = $1::uuid
          and org_id = app.current_org_id()`,
      [id],
    );
    return { ok: true, id };
  });
}

export async function listDepartmentFields(departmentId: string): Promise<DepartmentFieldRow[]> {
  return withOrgContext<DepartmentFieldRow[]>(async (ctx): Promise<DepartmentFieldRow[]> => {
    const context = ctx as OrgContextLike;
    const { rows } = await context.client.query<DepartmentFieldRow>(
      `select id::text, org_id::text, department_id::text, field_id::text, required, visible, stage_code, display_order
         from public.npd_department_field
        where org_id = app.current_org_id()
          and department_id = $1::uuid
        order by display_order, id`,
      [departmentId],
    );
    return rows;
  });
}

export async function assignFieldToDepartment(input: unknown): Promise<DepartmentFieldRow> {
  const parsed = parseAssignField(input);
  return withOrgContext<DepartmentFieldRow>(async (ctx): Promise<DepartmentFieldRow> => {
    const context = ctx as OrgContextLike;
    await requireNpdSchemaEdit(context);
    const { rows } = await context.client.query<DepartmentFieldRow>(
      `insert into public.npd_department_field
         (org_id, department_id, field_id, required, visible, stage_code, display_order)
       values (app.current_org_id(), $1::uuid, $2::uuid, $3, $4, $5, $6)
       returning id::text, org_id::text, department_id::text, field_id::text, required, visible, stage_code, display_order`,
      [
        parsed.department_id,
        parsed.field_id,
        parsed.required ?? false,
        parsed.visible ?? true,
        parsed.stage_code ?? 'brief',
        parsed.display_order ?? 0,
      ],
    );
    const row = rows[0];
    if (!row) throw new Error('Failed to assign NPD field to department.');
    return row;
  });
}

export async function updateAssignment(id: string, patch: unknown): Promise<DepartmentFieldRow> {
  const parsed = parseUpdateAssignmentPatch(patch);
  const updates = definedEntries(parsed);
  return withOrgContext<DepartmentFieldRow>(async (ctx): Promise<DepartmentFieldRow> => {
    const context = ctx as OrgContextLike;
    await requireNpdSchemaEdit(context);
    if (updates.length === 0) return selectAssignmentById(context, id);
    const setClause = updates.map(([key], index) => `${key} = $${index + 2}`).join(', ');
    const { rows } = await context.client.query<DepartmentFieldRow>(
      `update public.npd_department_field
          set ${setClause}
        where id = $1::uuid
          and org_id = app.current_org_id()
        returning id::text, org_id::text, department_id::text, field_id::text, required, visible, stage_code, display_order`,
      [id, ...updates.map(([, value]) => value)],
    );
    const row = rows[0];
    if (!row) throw new Error('NPD department field assignment not found.');
    return row;
  });
}

export async function removeAssignment(id: string): Promise<{ id: string }> {
  return withOrgContext<{ id: string }>(async (ctx): Promise<{ id: string }> => {
    const context = ctx as OrgContextLike;
    await requireNpdSchemaEdit(context);
    const { rows } = await context.client.query<{ id: string }>(
      `delete from public.npd_department_field
        where id = $1::uuid
          and org_id = app.current_org_id()
        returning id::text`,
      [id],
    );
    const row = rows[0];
    if (!row) throw new Error('NPD department field assignment not found.');
    return row;
  });
}
