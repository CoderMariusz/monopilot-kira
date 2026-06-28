'use server';

import { z } from 'zod';

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import { ValidationError } from './errors';

/**
 * T-022 — Server-side readiness probe for the Dept Close modal.
 *
 * Returns the per-dept required-field checklist used by the dept-close modal:
 * one row per NPD field catalog entry with `required = true`,
 * each carrying a `pass` flag computed from the real `public.product` row
 * (NOT a hardcoded checklist — the prototype's static arrays are replaced by
 * live catalog + product reads). Mirrors the readiness contract that
 * `closeDeptSection` (T-017) enforces via `public.is_all_required_filled`, so
 * the modal cannot surface a green checklist the action would reject.
 *
 * Red lines:
 *   - DB is only touched server-side (this module is 'use server'); the client
 *     modal imports the typed result, never a query.
 *   - Org scoping + RLS come from `withOrgContext` (app.current_org_id()).
 *   - `allPass` is recomputed by the action; the client must not be trusted to
 *     decide readiness on its own.
 */

const DEPT_VALUES = [
  'Core',
  'Planning',
  'Commercial',
  'Production',
  'Technical',
  'MRP',
  'Procurement',
] as const;

export type Dept = (typeof DEPT_VALUES)[number];

export type RequiredFieldStatus = {
  /** Physical column key (lower-cased product column / DeptColumns.column_key). */
  key: string;
  /** Human-readable label derived from the column key (no label column exists). */
  name: string;
  /** True when the product row has a non-empty value for this required column. */
  ok: boolean;
};

export type RequiredFieldsForDept = {
  dept: Dept;
  fields: RequiredFieldStatus[];
  /** True iff every required field is filled (server-authoritative). */
  allPass: boolean;
};

type QueryResult<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type RequiredColumnRow = {
  column_key: string;
  physical_column: string;
  field_value: string | null;
};

const inputSchema = z.object({
  productCode: z.string().trim().min(1),
  dept: z.enum(DEPT_VALUES),
});

/**
 * Humanize a `column_key` (e.g. `product_name`, `Pack_Size`) into a label
 * ("Product Name", "Pack Size"). The NPD field catalog has no separate display-label
 * column, so the key is the source of truth for the checklist label.
 */
function humanizeColumnKey(columnKey: string): string {
  return columnKey
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export async function getRequiredFieldsForDept(
  productCode: string,
  dept: string,
): Promise<RequiredFieldsForDept> {
  const parsed = inputSchema.safeParse({ productCode, dept });
  if (!parsed.success) {
    throw new ValidationError('INVALID_INPUT', 'Invalid product code or department');
  }

  return withOrgContext<RequiredFieldsForDept>(async (ctx) => {
    const context = ctx as OrgContextLike;

    const { rows } = await context.client.query<RequiredColumnRow>(
      `with product_row as (
         select to_jsonb(p.*) as product_json
           from public.product p
          where p.org_id = app.current_org_id()
            and p.product_code = $1::text
          limit 1
       ),
       required_columns as (
         select f.code as column_key,
                lower(f.code) as physical_column,
                df.display_order
           from public.npd_departments d
           join public.npd_department_field df on df.department_id = d.id and df.org_id = d.org_id
           join public.npd_field_catalog f on f.id = df.field_id and f.org_id = df.org_id and f.active = true
          where d.org_id = app.current_org_id()
            and lower(d.code) = lower($2::text)
            and d.active = true
            and df.required = true
       )
       select rc.column_key,
              rc.physical_column,
              pr.product_json ->> rc.physical_column as field_value
         from required_columns rc
         left join product_row pr on true
        order by rc.display_order nulls last, rc.column_key`,
      [parsed.data.productCode, parsed.data.dept],
    );

    const fields: RequiredFieldStatus[] = rows.map((row) => {
      const value = row.field_value;
      const ok = value !== null && value !== undefined && value.trim() !== '';
      return {
        key: row.physical_column,
        name: humanizeColumnKey(row.column_key),
        ok,
      };
    });

    return {
      dept: parsed.data.dept,
      fields,
      allPass: fields.length > 0 && fields.every((field) => field.ok),
    };
  });
}
