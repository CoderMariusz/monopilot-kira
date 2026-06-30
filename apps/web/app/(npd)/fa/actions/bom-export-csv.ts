'use server';

import { withOrgContext } from '../../../../lib/auth/with-org-context';
import { AuthError, ValidationError } from './errors';

const DASHBOARD_VIEW_PERMISSION = 'npd.dashboard.view';
const BOM_EXPORT_PERMISSION = 'npd.bom.export';
const CSV_COLUMNS = [
  'product_code',
  'component_type',
  'component_code',
  'quantity',
  'process_stage',
  'source',
  'd365_status',
] as const;

type QueryResult<T = Record<string, unknown>> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};
type OrgContextLike = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type BomExportRow = {
  product_code: string;
  component_type: string | null;
  component_code: string;
  quantity: string;
  process_stage: string;
  source: string;
  d365_status: string;
};

export async function bom_export_csv(productCode: string): Promise<Response> {
  return withOrgContext<Response>(async (ctx) => {
    const context = ctx as OrgContextLike;
    if (!(await hasPermission(context, DASHBOARD_VIEW_PERMISSION))) {
      throw new AuthError('FORBIDDEN', `${DASHBOARD_VIEW_PERMISSION} is required to read FA BOM exports`);
    }
    if (!(await hasPermission(context, BOM_EXPORT_PERMISSION))) {
      throw new AuthError('FORBIDDEN', `${BOM_EXPORT_PERMISSION} is required to export FA BOM CSV`);
    }

    const normalizedProductCode = normalizeProductCode(productCode);
    const rows = await readBomRows(context, normalizedProductCode);
    const csv = toCsv(rows);

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${csvFilename(normalizedProductCode)}"`,
      },
    });
  });
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

async function readBomRows(ctx: OrgContextLike, productCode: string): Promise<BomExportRow[]> {
  const { rows } = await ctx.client.query<BomExportRow>(
    `with selected_header as (
        select header.id, header.product_id
          from public.bom_headers header
         where header.org_id = app.current_org_id()
           and header.product_id = $1
           and header.status in ('active', 'technical_approved', 'in_review', 'draft')
         order by
           case header.status
             when 'active' then 1
             when 'technical_approved' then 2
             when 'in_review' then 3
             else 4
           end,
           header.version desc,
           header.created_at desc
         limit 1
      )
      select
        header.product_id as product_code,
        line.component_type,
        line.component_code,
        line.quantity::text as quantity,
        coalesce(nullif(line.manufacturing_operation_name, ''), '') as process_stage,
        coalesce(nullif(line.source, ''), '') as source,
        coalesce(nullif(d365.status, ''), 'Empty') as d365_status
       from selected_header header
       join public.bom_lines line
         on line.org_id = app.current_org_id()
        and line.bom_header_id = header.id
       left join public.d365_import_cache d365
         on d365.org_id = app.current_org_id()
        and d365.code = line.component_code
      order by line.line_no`,
    [productCode],
  );
  return rows;
}

function toCsv(rows: BomExportRow[]): string {
  const dataRows = rows.map((row) =>
    [
      row.product_code,
      row.component_type ?? '',
      row.component_code,
      row.quantity,
      row.process_stage,
      row.source,
      row.d365_status,
    ].map(escapeCsv).join(','),
  );
  return [CSV_COLUMNS.join(','), ...dataRows, ''].join('\n');
}

function escapeCsv(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

function normalizeProductCode(productCode: string): string {
  const normalized = productCode.trim();
  if (!normalized) throw new ValidationError('INVALID_PRODUCT_CODE', 'productCode is required');
  return normalized;
}

function csvFilename(productCode: string): string {
  return `${productCode.replaceAll(/[^A-Za-z0-9_-]/g, '_')}-bom.csv`;
}
