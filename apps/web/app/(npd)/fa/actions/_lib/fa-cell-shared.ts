import { z, type ZodTypeAny } from 'zod';

import { ValidationError } from '../errors';
import { lengthBounds, numericBounds } from '../../../../../lib/schema/validation-rules';

export const FA_EDIT_EVENT = 'fa.edit';
export const APP_VERSION = 'update-fa-cell-v1';

const DEPT_PERMISSION: Record<string, string> = {
  core: 'npd.core.write',
  planning: 'npd.planning.write',
  commercial: 'npd.commercial.write',
  production: 'npd.production.write',
  technical: 'npd.technical.write',
  mrp: 'npd.mrp.write',
  procurement: 'npd.procurement.write',
};

export type QueryResult<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null };
export type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
export type OrgContextLike = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

export type DeptColumnRow = {
  dept_code: string;
  column_key: string;
  data_type: string | null;
  field_type: string | null;
  dropdown_source: string | null;
  required_for_done: boolean;
  /**
   * The rules the NPD field catalog already stores (`{"minimum":0,"maximum":100}`
   * on the yields, `{"minimum":0}` on cases/shelf life). They used to be loaded
   * by nobody, so `Infinity` / `1e309` / `-50` all persisted into master data and
   * one poisoned cell made `avg(yield_p1)` return Infinity for the whole org.
   */
  validation_json: unknown;
};

export type UpdateFaCellResult = {
  previousValue: string | null;
  newValue: string | null;
  builtReset: boolean;
};

export async function loadDeptColumn(ctx: OrgContextLike, columnName: string): Promise<DeptColumnRow> {
  const { rows } = await ctx.client.query<DeptColumnRow>(
    `select d.code as dept_code,
            lower(f.code) as column_key,
            f.data_type,
            null::text as field_type,
            f.dropdown_source,
            df.required as required_for_done,
            f.validation_json
       from public.npd_departments d
       join public.npd_department_field df on df.department_id = d.id and df.org_id = d.org_id and df.visible = true
       join public.npd_field_catalog f on f.id = df.field_id and f.org_id = df.org_id and f.active = true
      where d.org_id = app.current_org_id()
        and d.active = true
        and lower(f.code) = lower($1::text)
      order by df.display_order asc nulls last, f.code asc
      limit 1`,
    [columnName],
  );
  const row = rows[0];
  if (!row) {
    throw new ValidationError('UNKNOWN_COLUMN', 'Column is not registered in the NPD field catalog');
  }
  if (!/^[a-z][a-z0-9_]*$/.test(row.column_key)) {
    throw new ValidationError('UNSAFE_COLUMN', 'Column metadata references an unsafe product column');
  }
  return row;
}

export function permissionForDept(deptCode: string): string {
  const permission = DEPT_PERMISSION[deptCode.toLowerCase()];
  if (!permission) {
    throw new ValidationError('UNKNOWN_DEPT', `Unsupported department ${deptCode}`);
  }
  return permission;
}

export async function assertProductColumn(ctx: OrgContextLike, columnName: string): Promise<void> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'product'
        and column_name = $1
      limit 1`,
    [columnName],
  );
  if (!rows[0]?.ok) {
    throw new ValidationError('COLUMN_NOT_IN_PRODUCT', 'Registered column does not exist on product');
  }
}

export async function isAutoColumn(ctx: OrgContextLike, columnName: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.npd_field_catalog f
      where f.org_id = app.current_org_id()
        and lower(f.code) = $1::text
        and f.is_auto = true
      limit 1`,
    [columnName],
  );
  return rows.length > 0;
}

export async function validateValue(
  ctx: OrgContextLike,
  column: DeptColumnRow,
  value: unknown,
): Promise<string | number | boolean | Date | null> {
  const schema = await schemaForColumn(ctx, column);
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError('INVALID_VALUE', parsed.error.issues[0]?.message ?? 'Invalid cell value');
  }
  return parsed.data as string | number | boolean | Date | null;
}

async function schemaForColumn(ctx: OrgContextLike, column: DeptColumnRow): Promise<ZodTypeAny> {
  const dataType = normalizeDataType(column);
  const base = await baseSchemaForColumn(ctx, column, dataType);
  if (column.required_for_done) {
    return z
      .unknown()
      .refine((value) => value !== undefined && value !== null && value !== '', {
        message: `${column.column_key} is required`,
      })
      .pipe(base);
  }
  return z.preprocess((value) => (value === '' ? null : value), base.nullable());
}

function normalizeDataType(column: DeptColumnRow): string {
  if (column.dropdown_source && column.dropdown_source.trim() !== '') return 'dropdown';
  return (
    column.data_type ??
    ({
      string: 'text',
      enum: 'dropdown',
      integer: 'number',
      datetime: 'date',
      boolean: 'boolean',
      formula: 'formula',
    } as Record<string, string | undefined>)[column.field_type ?? ''] ??
    column.field_type ??
    'text'
  );
}

// Checkboxes send a real boolean; server-action callers send whatever they like.
// Anything not on this list is rejected rather than truthiness-coerced.
const BOOLEAN_STRINGS: Record<string, boolean> = {
  true: true,
  't': true,
  'yes': true,
  'y': true,
  '1': true,
  false: false,
  'f': false,
  'no': false,
  'n': false,
  '0': false,
};

function normalizeBoolean(value: unknown): unknown {
  if (typeof value === 'string') return BOOLEAN_STRINGS[value.trim().toLowerCase()];
  if (value === 1) return true;
  if (value === 0) return false;
  return value;
}

async function baseSchemaForColumn(
  ctx: OrgContextLike,
  column: DeptColumnRow,
  dataType: string,
): Promise<ZodTypeAny> {
  const key = column.column_key;
  switch (dataType) {
    case 'text': {
      const { min, max } = lengthBounds(column.validation_json);
      let schema = z.coerce.string();
      if (min !== null) schema = schema.min(min, { message: `${key} must be at least ${min} characters` });
      if (max !== null) schema = schema.max(max, { message: `${key} must be at most ${max} characters` });
      return schema;
    }
    case 'number':
    case 'integer': {
      const { min, max } = numericBounds(column.validation_json);
      // `.finite()` is NOT optional: `z.coerce.number()` turns '1e309' and the
      // literal 'Infinity' into Infinity, PG16 stores it in a numeric column, and
      // every aggregate over that column returns Infinity from then on.
      let schema = z.coerce.number().finite({ message: `${key} must be a finite number` });
      if (dataType === 'integer') schema = schema.int({ message: `${key} must be a whole number` });
      if (min !== null) schema = schema.min(min, { message: `${key} must be >= ${min}` });
      if (max !== null) schema = schema.max(max, { message: `${key} must be <= ${max}` });
      return schema;
    }
    case 'date':
      return z.coerce.date();
    case 'boolean':
      // z.coerce.boolean() is Boolean(value), so the string 'false' saved as TRUE.
      return z.preprocess(normalizeBoolean, z.boolean({ message: `${key} must be true or false` }));
    case 'dropdown':
      return dropdownSchema(ctx, column);
    case 'formula':
      throw new ValidationError('READ_ONLY_COLUMN', 'Formula columns cannot be edited');
    default:
      throw new ValidationError('UNSUPPORTED_DATA_TYPE', `Unsupported data type ${dataType}`);
  }
}

// Reference dropdown tables do NOT share one value-column name (caught live by the
// W1 Gate-5b walk: saving `line` hit `column "value" does not exist` against
// Lines_By_PackSize). Mirrors DROPDOWN_SOURCE_TABLE in load-stage-dept-sections.
const DROPDOWN_VALUE_COLUMN: Record<string, string> = {
  PackSizes: 'value',
  Templates: 'template_name',
  Lines_By_PackSize: 'line',
  Equipment_Setup_By_Line_Pack: 'equipment_setup',
  CloseConfirm: 'value',
  ManufacturingOperations: 'operation_name',
  Suppliers: 'value',
};

async function dropdownSchema(ctx: OrgContextLike, column: DeptColumnRow): Promise<ZodTypeAny> {
  if (!column.dropdown_source || !/^[A-Za-z][A-Za-z0-9_]*$/.test(column.dropdown_source)) {
    throw new ValidationError('INVALID_DROPDOWN_SOURCE', 'Dropdown source is missing or unsafe');
  }
  const valueColumn = DROPDOWN_VALUE_COLUMN[column.dropdown_source] ?? 'value';
  const { rows } = await ctx.client.query<{ value: string }>(
    `select "${valueColumn}" as value from "Reference"."${column.dropdown_source}" where org_id = app.current_org_id() order by 1`,
  );
  const values = rows.map((row) => row.value);
  if (values.length === 0) {
    throw new ValidationError('EMPTY_DROPDOWN_SOURCE', 'Dropdown source has no values');
  }
  return z.enum(values as [string, ...string[]]);
}

export async function syncProdDetailRows(ctx: OrgContextLike, productCode: string): Promise<void> {
  await ctx.client.query(`select public.sync_prod_detail_rows($1, $2)`, [
    productCode,
    'update-fa-cell-recipe-sync-v1',
  ]);
}

export function quoteIdentifier(identifier: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(identifier)) {
    throw new ValidationError('UNSAFE_COLUMN', 'Unsafe product column');
  }
  return `"${identifier.replace(/"/g, '""')}"`;
}
