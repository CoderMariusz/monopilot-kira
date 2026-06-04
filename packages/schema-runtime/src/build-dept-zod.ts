import pg from 'pg';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { z, type ZodObject, type ZodRawShape, type ZodTypeAny } from 'zod';
import { getAppConnection } from '@monopilot/db/clients.js';

import {
  clearDeptZodCache,
  getCachedDeptZod,
  setCachedDeptZod,
} from './cache.js';

type Queryable = pg.Pool | pg.PoolClient;

type BuildDeptZodOptions = {
  db?: Queryable;
};

type DeptColumnRow = {
  column_key: string;
  data_type: 'text' | 'number' | 'date' | 'dropdown' | 'boolean' | 'formula';
  dropdown_source: string | null;
  required_for_done: boolean;
  schema_version: number;
};

let pool: pg.Pool | undefined;

function getDefaultPool(): pg.Pool {
  if (!pool) {
    pool = getAppConnection();
  }
  return pool;
}

function assertIdentifier(identifier: string): string {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe dropdown_source identifier: ${identifier}`);
  }
  return identifier;
}

function quoteIdentifier(identifier: string): string {
  return `"${assertIdentifier(identifier).replace(/"/g, '""')}"`;
}

async function queryDeptColumns(db: Queryable, orgId: string, dept: string): Promise<DeptColumnRow[]> {
  const drizzleDb = drizzle(db);
  const result = await drizzleDb.execute<DeptColumnRow>(sql`
    select
      column_key,
      case
        when dropdown_source is not null and btrim(dropdown_source) <> '' then 'dropdown'
        else coalesce(
          data_type,
          case field_type
            when 'string' then 'text'
            when 'enum' then 'dropdown'
            when 'integer' then 'number'
            when 'datetime' then 'date'
            when 'boolean' then 'boolean'
            when 'formula' then 'formula'
            else field_type
          end
        )
      end as data_type,
      dropdown_source,
      required_for_done,
      schema_version
    from "Reference"."DeptColumns"
    where org_id = ${orgId}::uuid
      and dept_code = ${dept}
    order by display_order nulls last, column_key
  `);

  return [...result.rows];
}

async function queryDropdownValues(
  db: Queryable,
  orgId: string,
  dropdownSource: string,
): Promise<string[]> {
  const tableName = quoteIdentifier(dropdownSource);
  const result = await db.query<{ value: string }>(
    `select value
     from "Reference".${tableName}
     where org_id = $1::uuid
     order by value`,
    [orgId],
  );
  return result.rows.map((row) => row.value);
}

function maxSchemaVersion(rows: DeptColumnRow[]): number {
  return rows.reduce((max, row) => Math.max(max, row.schema_version), 0);
}

async function zodForColumn(
  db: Queryable,
  orgId: string,
  row: DeptColumnRow,
): Promise<ZodTypeAny | null> {
  switch (row.data_type) {
    case 'text':
      return z.string({
        required_error: `${row.column_key} is required`,
      });
    case 'number':
      return z.coerce.number({
        required_error: `${row.column_key} is required`,
        invalid_type_error: `${row.column_key} must be a number`,
      });
    case 'date':
      return z.coerce.date({
        required_error: `${row.column_key} is required`,
        invalid_type_error: `${row.column_key} must be a date`,
      });
    case 'boolean':
      return z.coerce.boolean({
        required_error: `${row.column_key} is required`,
        invalid_type_error: `${row.column_key} must be a boolean`,
      });
    case 'formula':
      return null;
    case 'dropdown': {
      if (!row.dropdown_source) {
        throw new Error(`Dropdown column ${row.column_key} is missing dropdown_source`);
      }
      const values = await queryDropdownValues(db, orgId, row.dropdown_source);
      if (values.length === 0) {
        throw new Error(`Dropdown source ${row.dropdown_source} has no rows for org ${orgId}`);
      }
      return z.enum(values as [string, ...string[]], {
        required_error: `${row.column_key} is required`,
      });
    }
    default:
      row.data_type satisfies never;
      throw new Error(`Unsupported DeptColumns data_type: ${String(row.data_type)}`);
  }
}

function requirePresence(row: DeptColumnRow, schema: ZodTypeAny): ZodTypeAny {
  return z
    .unknown()
    .refine((value) => value !== undefined && value !== null && value !== '', {
      message: `${row.column_key} is required`,
    })
    .pipe(schema);
}

export async function buildDeptZod(
  orgId: string,
  dept: string,
  options: BuildDeptZodOptions = {},
): Promise<ZodObject<ZodRawShape>> {
  const db = options.db ?? getDefaultPool();
  const rows = await queryDeptColumns(db, orgId, dept);
  const schemaVersion = maxSchemaVersion(rows);
  const cached = getCachedDeptZod(orgId, dept, schemaVersion);
  if (cached) {
    return cached;
  }

  const shape: ZodRawShape = {};
  for (const row of rows) {
    const columnSchema = await zodForColumn(db, orgId, row);
    if (!columnSchema) {
      continue;
    }
    shape[row.column_key] = row.required_for_done
      ? requirePresence(row, columnSchema)
      : columnSchema.optional();
  }

  const schema = z.object(shape);
  setCachedDeptZod(orgId, dept, schemaVersion, schema);
  return schema;
}

export { clearDeptZodCache };
