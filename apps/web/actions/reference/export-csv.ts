'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';

const VIEW_PERMISSION = 'settings.reference.view';

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type ReferenceSchemaColumn = {
  column_code: string;
  presentation_json?: unknown;
};

type ReferenceRow = {
  table_code: string;
  row_key: string;
  row_data: Record<string, unknown>;
  is_active: boolean;
  display_order?: number | null;
};

export type ExportReferenceCsvResult = Response;

export async function exportReferenceCsv(rawInput: unknown): Promise<ExportReferenceCsvResult> {
  const input = parseExportInput(rawInput);
  if (!input) return csvErrorResponse('invalid_input', 400);

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<Response> => {
      const allowed = await hasPermission({ client, userId, orgId }, VIEW_PERMISSION);
      if (!allowed) return csvErrorResponse('forbidden', 403);

      const schemaColumns = await loadSchemaColumns(client, input.tableCode);
      if (schemaColumns.length === 0) return csvErrorResponse('schema_not_found', 404);

      const referenceRows = await loadActiveReferenceRows(client, input.tableCode);
      const headers = ['row_key', ...schemaColumns.map((column) => normalizeHeader(column.column_code))];
      const records = referenceRows.map((row) => {
        const record: Record<string, string> = { row_key: row.row_key };
        const normalizedData = normalizeRecordData(row.row_data);
        for (const header of headers.slice(1)) record[header] = normalizedData[header] ?? '';
        return record;
      });
      const csv = renderCsv(records, headers);

      return new Response(csv, {
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${input.tableCode}.csv"`,
          'cache-control': 'no-store',
        },
      });
    });
  } catch {
    return csvErrorResponse('persistence_failed', 500);
  }
}

function parseExportInput(raw: unknown): { tableCode: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const tableCode = normalizeCode((raw as { tableCode?: unknown }).tableCode);
  return tableCode ? { tableCode } : null;
}

function normalizeCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^[a-z0-9_][a-z0-9_-]{0,63}$/i.test(trimmed) ? trimmed : null;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase();
}

async function hasPermission(ctx: OrgActionContext, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}

async function loadSchemaColumns(client: QueryClient, tableCode: string): Promise<ReferenceSchemaColumn[]> {
  const { rows } = await client.query<ReferenceSchemaColumn>(
    `select column_code, presentation_json
       from public.reference_schemas
      where org_id = app.current_org_id()
        and table_code = $1
        and deprecated_at is null
      order by coalesce((presentation_json->>'display_order')::integer, 0), column_code`,
    [tableCode],
  );
  return rows;
}

async function loadActiveReferenceRows(client: QueryClient, tableCode: string): Promise<ReferenceRow[]> {
  const { rows } = await client.query<ReferenceRow>(
    `select table_code, row_key, row_data, is_active, display_order
       from public.reference_tables
      where org_id = app.current_org_id()
        and table_code = $1
        and is_active = true
      order by display_order asc nulls last, row_key asc`,
    [tableCode],
  );
  return rows;
}

function renderCsv(records: Array<Record<string, string>>, headers: string[]): string {
  return [headers.join(','), ...records.map((record) => headers.map((header) => escapeCsvCell(record[header] ?? '')).join(','))].join('\n');
}

// CWE-1236: defuse spreadsheet formula injection by prefixing cells that start
// with a metacharacter Excel/LibreOffice/Numbers would interpret as a formula.
const FORMULA_INJECTION_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

function escapeCsvCell(value: string): string {
  const sanitized = FORMULA_INJECTION_TRIGGERS.includes(value.charAt(0)) ? `'${value}` : value;
  if (!/[",\r\n]/.test(sanitized)) return sanitized;
  return `"${sanitized.replace(/"/g, '""')}"`;
}

function normalizeRecordData(value: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) normalized[normalizeHeader(key)] = entry === null || entry === undefined ? '' : String(entry).trim();
  return normalized;
}

function csvErrorResponse(error: string, status: number): Response {
  return new Response(error, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
