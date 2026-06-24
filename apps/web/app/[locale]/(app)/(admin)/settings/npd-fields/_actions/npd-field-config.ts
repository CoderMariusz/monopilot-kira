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
};

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
    `select id::text, org_id::text, code, label, data_type, validation_json, help_text, active
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

export async function listFieldCatalog(): Promise<FieldCatalogRow[]> {
  return withOrgContext<FieldCatalogRow[]>(async (ctx): Promise<FieldCatalogRow[]> => {
    const context = ctx as OrgContextLike;
    const { rows } = await context.client.query<FieldCatalogRow>(
      `select id::text, org_id::text, code, label, data_type, validation_json, help_text, active
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
       returning id::text, org_id::text, code, label, data_type, validation_json, help_text, active`,
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

export async function updateField(id: string, patch: unknown): Promise<FieldCatalogRow> {
  const parsed = parseUpdateFieldPatch(patch);
  const updates = definedEntries(parsed);
  return withOrgContext<FieldCatalogRow>(async (ctx): Promise<FieldCatalogRow> => {
    const context = ctx as OrgContextLike;
    await requireNpdSchemaEdit(context);
    if (updates.length === 0) return selectFieldById(context, id);
    const params = updates.map(([key, value]) => (key === 'validation_json' ? JSON.stringify(value ?? {}) : value));
    const setClause = updates
      .map(([key], index) => (key === 'validation_json' ? `${key} = $${index + 2}::jsonb` : `${key} = $${index + 2}`))
      .join(', ');
    const { rows } = await context.client.query<FieldCatalogRow>(
      `update public.npd_field_catalog
          set ${setClause}
        where id = $1::uuid
          and org_id = app.current_org_id()
        returning id::text, org_id::text, code, label, data_type, validation_json, help_text, active`,
      [id, ...params],
    );
    const row = rows[0];
    if (!row) throw new Error('NPD field not found.');
    return row;
  });
}

export async function setFieldActive(id: string, active: boolean): Promise<FieldCatalogRow> {
  return updateField(id, { active });
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
