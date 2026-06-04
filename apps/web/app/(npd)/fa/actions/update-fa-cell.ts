'use server';

import { revalidatePath } from 'next/cache';
import { z, type ZodTypeAny } from 'zod';

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import { AuthError, ValidationError } from './errors';

const FA_EDIT_EVENT = 'fa.edit';
const APP_VERSION = 'update-fa-cell-v1';

const DEPT_PERMISSION: Record<string, string> = {
  core: 'npd.core.write',
  planning: 'npd.planning.write',
  commercial: 'npd.commercial.write',
  production: 'npd.production.write',
  technical: 'npd.technical.write',
  mrp: 'npd.mrp.write',
  procurement: 'npd.procurement.write',
};

const inputSchema = z.object({
  productCode: z.string().trim().min(1),
  columnName: z.string().trim().regex(/^[a-z][a-z0-9_]*$/),
  value: z.unknown(),
});

type QueryResult<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type DeptColumnRow = {
  dept_code: string;
  column_key: string;
  data_type: string | null;
  field_type: string | null;
  dropdown_source: string | null;
  required_for_done: boolean;
};

type UpdateRow = {
  previous_value: string | null;
  new_value: string | null;
  built_reset: boolean;
};

export type UpdateFaCellResult = {
  previousValue: string | null;
  newValue: string | null;
  builtReset: boolean;
};

export async function updateFaCell(
  productCode: string,
  columnName: string,
  value: unknown,
): Promise<UpdateFaCellResult> {
  const parsed = inputSchema.safeParse({ productCode, columnName, value });
  if (!parsed.success) {
    throw new ValidationError('INVALID_INPUT', 'Invalid FA cell update input');
  }

  return withOrgContext<UpdateFaCellResult>(async (ctx) => {
    const context = ctx as OrgContextLike;
    const column = await loadDeptColumn(context, parsed.data.columnName);
    const permission = permissionForDept(column.dept_code);
    if (!(await hasPermission(context, permission))) {
      throw new AuthError('FORBIDDEN', `${permission} is required to update ${parsed.data.columnName}`);
    }

    await assertProductColumn(context, column.column_key);
    const newValue = await validateValue(context, column, parsed.data.value);

    await context.client.query(`select set_config('app.fa_actor_user_id', $1, true)`, [context.userId]);
    const result = await updateProductCell(
      context,
      parsed.data.productCode,
      column.column_key,
      newValue,
    );

    await writeEditOutbox(context, parsed.data.productCode, column.column_key, result);
    safeRevalidatePath(`/npd/fa/${parsed.data.productCode}`);
    safeRevalidatePath('/npd/fa');

    return result;
  });
}

async function loadDeptColumn(ctx: OrgContextLike, columnName: string): Promise<DeptColumnRow> {
  const { rows } = await ctx.client.query<DeptColumnRow>(
    `select dept_code, lower(column_key) as column_key, data_type, field_type, dropdown_source, required_for_done
       from "Reference"."DeptColumns"
      where org_id = app.current_org_id()
        and lower(column_key) = $1
      order by schema_version desc
      limit 1`,
    [columnName],
  );
  const row = rows[0];
  if (!row) {
    throw new ValidationError('UNKNOWN_COLUMN', 'Column is not registered in Reference.DeptColumns');
  }
  if (!/^[a-z][a-z0-9_]*$/.test(row.column_key)) {
    throw new ValidationError('UNSAFE_COLUMN', 'Column metadata references an unsafe product column');
  }
  return row;
}

function permissionForDept(deptCode: string): string {
  const permission = DEPT_PERMISSION[deptCode.toLowerCase()];
  if (!permission) {
    throw new ValidationError('UNKNOWN_DEPT', `Unsupported department ${deptCode}`);
  }
  return permission;
}

async function hasPermission(ctx: OrgContextLike, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}

async function assertProductColumn(ctx: OrgContextLike, columnName: string): Promise<void> {
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

async function validateValue(ctx: OrgContextLike, column: DeptColumnRow, value: unknown): Promise<string | number | boolean | Date | null> {
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

async function baseSchemaForColumn(
  ctx: OrgContextLike,
  column: DeptColumnRow,
  dataType: string,
): Promise<ZodTypeAny> {
  switch (dataType) {
    case 'text':
      return z.coerce.string();
    case 'number':
      return z.coerce.number();
    case 'date':
      return z.coerce.date();
    case 'boolean':
      return z.coerce.boolean();
    case 'dropdown':
      return dropdownSchema(ctx, column);
    case 'formula':
      throw new ValidationError('READ_ONLY_COLUMN', 'Formula columns cannot be edited');
    default:
      throw new ValidationError('UNSUPPORTED_DATA_TYPE', `Unsupported data type ${dataType}`);
  }
}

async function dropdownSchema(ctx: OrgContextLike, column: DeptColumnRow): Promise<ZodTypeAny> {
  if (!column.dropdown_source || !/^[A-Za-z][A-Za-z0-9_]*$/.test(column.dropdown_source)) {
    throw new ValidationError('INVALID_DROPDOWN_SOURCE', 'Dropdown source is missing or unsafe');
  }
  const { rows } = await ctx.client.query<{ value: string }>(
    `select value from "Reference"."${column.dropdown_source}" where org_id = app.current_org_id() order by value`,
  );
  const values = rows.map((row) => row.value);
  if (values.length === 0) {
    throw new ValidationError('EMPTY_DROPDOWN_SOURCE', 'Dropdown source has no values');
  }
  return z.enum(values as [string, ...string[]]);
}

async function updateProductCell(
  ctx: OrgContextLike,
  productCode: string,
  columnName: string,
  value: string | number | boolean | Date | null,
): Promise<UpdateFaCellResult> {
  const { rows } = await ctx.client.query<UpdateRow>(
    `with current_row as (
       select ${quoteIdentifier(columnName)}::text as previous_value,
              built as previous_built
         from public.product
        where org_id = app.current_org_id()
          and product_code = $1
        for update
     ),
     updated as (
       update public.product p
          set ${quoteIdentifier(columnName)} = $2
         from current_row
        where p.org_id = app.current_org_id()
          and p.product_code = $1
        returning p.${quoteIdentifier(columnName)}::text as new_value,
                  p.built as new_built,
                  current_row.previous_value,
                  current_row.previous_built
     )
     select previous_value,
            new_value,
            (previous_built is true and new_built is false) as built_reset
       from updated`,
    [productCode, value],
  );
  const row = rows[0];
  if (!row) {
    throw new ValidationError('PRODUCT_NOT_FOUND', 'Product is not visible in the current organization');
  }
  return {
    previousValue: row.previous_value,
    newValue: row.new_value,
    builtReset: row.built_reset,
  };
}

async function writeEditOutbox(
  ctx: OrgContextLike,
  productCode: string,
  columnName: string,
  result: UpdateFaCellResult,
): Promise<void> {
  await ctx.client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values
       (app.current_org_id(), $1, 'fa', $2, $3::jsonb, $4)`,
    [
      FA_EDIT_EVENT,
      productCode,
      JSON.stringify({
        org_id: ctx.orgId,
        actor_user_id: ctx.userId,
        product_code: productCode,
        diff: {
          [columnName]: {
            prev: result.previousValue,
            next: result.newValue,
          },
        },
        built_reset: result.builtReset,
      }),
      APP_VERSION,
    ],
  );
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(identifier)) {
    throw new ValidationError('UNSAFE_COLUMN', 'Unsafe product column');
  }
  return `"${identifier.replace(/"/g, '""')}"`;
}

function safeRevalidatePath(path: string): void {
  try {
    revalidatePath(path);
  } catch {
    // Vitest imports Server Actions outside a Next request/static generation store.
  }
}