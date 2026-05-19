'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';

const EDIT_PERMISSION = 'settings.reference.edit';

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type ReferenceRow = {
  org_id: string;
  table_code: string;
  row_key: string;
  row_data: Record<string, unknown>;
  version: number;
  is_active: boolean;
  display_order: number | null;
};

type ReferenceSchemaColumn = {
  column_code: string;
  data_type: string;
  required_for_done?: boolean | null;
  is_required?: boolean | null;
  required?: boolean | null;
  enum_values?: unknown;
  validation_json?: unknown;
};

export type UpsertReferenceRowResult =
  | { ok: true; data: { tableCode: string; rowKey: string; rowData: Record<string, unknown>; version: number; isActive: boolean; displayOrder: number | null } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'VERSION_CONFLICT' | 'persistence_failed'; message?: string };

export async function upsertReferenceRow(rawInput: unknown): Promise<UpsertReferenceRowResult> {
  const input = parseUpsertInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<UpsertReferenceRowResult> => {
      const allowed = await hasPermission({ client, userId, orgId }, EDIT_PERMISSION);
      if (!allowed) return { ok: false, error: 'forbidden' };

      const schemaColumns = await loadGeneratedSchema(client, input.tableCode);
      const schemaError = validateAgainstGeneratedSchema(input.rowData, schemaColumns);
      if (schemaError) return { ok: false, error: 'invalid_input', message: schemaError };

      const existing = await getExistingRow(client, input.tableCode, input.rowKey);
      if (existing && input.expectedVersion !== undefined && existing.version !== input.expectedVersion) {
        return { ok: false, error: 'VERSION_CONFLICT' };
      }

      if (existing) {
        const rowDataChanged = stableStringify(existing.row_data) !== stableStringify(input.rowData);
        const { rows, rowCount } = await client.query<ReferenceRow>(
          `update public.reference_tables
              set row_data = $3::jsonb,
                  display_order = $4
            where org_id = app.current_org_id()
              and table_code = $1
              and row_key = $2
              and ($5::integer is null or version = $5::integer)
            returning org_id, table_code, row_key, row_data, version, is_active, display_order`,
          [input.tableCode, input.rowKey, input.rowData, input.displayOrder, input.expectedVersion ?? null],
        );
        const updated = rows[0];
        if ((rowCount ?? rows.length) < 1 || !updated) return { ok: false, error: 'VERSION_CONFLICT' };
        if (rowDataChanged) await refreshReferenceTableMv(client, orgId, input.tableCode);
        return { ok: true, data: mapReferenceRow(updated) };
      }

      if (input.expectedVersion !== undefined) return { ok: false, error: 'VERSION_CONFLICT' };

      const { rows } = await client.query<ReferenceRow>(
        `insert into public.reference_tables
           (org_id, table_code, row_key, row_data, display_order, created_by)
         values ($1::uuid, $2, $3, $4::jsonb, $5, $6::uuid)
         returning org_id, table_code, row_key, row_data, version, is_active, display_order`,
        [orgId, input.tableCode, input.rowKey, input.rowData, input.displayOrder, userId],
      );
      const inserted = rows[0];
      if (!inserted) return { ok: false, error: 'persistence_failed' };
      await refreshReferenceTableMv(client, orgId, input.tableCode);
      return { ok: true, data: mapReferenceRow(inserted) };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

function parseUpsertInput(raw: unknown): { tableCode: string; rowKey: string; rowData: Record<string, unknown>; expectedVersion?: number; displayOrder: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as { tableCode?: unknown; rowKey?: unknown; rowData?: unknown; expectedVersion?: unknown; displayOrder?: unknown };
  const tableCode = normalizeCode(candidate.tableCode);
  const rowKey = normalizeRowKey(candidate.rowKey);
  const rowData = isPlainObject(candidate.rowData) ? candidate.rowData : null;
  const expectedVersion = candidate.expectedVersion === undefined ? undefined : Number(candidate.expectedVersion);
  const displayOrder = candidate.displayOrder === undefined ? 0 : Number(candidate.displayOrder);
  if (!tableCode || !rowKey || !rowData) return null;
  if (expectedVersion !== undefined && (!Number.isInteger(expectedVersion) || expectedVersion < 1)) return null;
  if (!Number.isInteger(displayOrder)) return null;
  return { tableCode, rowKey, rowData, expectedVersion, displayOrder };
}

function normalizeCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^[a-z0-9_][a-z0-9_-]{0,63}$/i.test(trimmed) ? trimmed : null;
}

function normalizeRowKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

async function loadGeneratedSchema(client: QueryClient, tableCode: string): Promise<ReferenceSchemaColumn[]> {
  const { rows } = await client.query<ReferenceSchemaColumn>(
    `select column_code, data_type, required_for_done, validation_json
       from public.reference_schemas
      where org_id = app.current_org_id()
        and table_code = $1
        and deprecated_at is null
      order by column_code`,
    [tableCode],
  );
  return rows;
}

function validateAgainstGeneratedSchema(rowData: Record<string, unknown>, schemaColumns: ReferenceSchemaColumn[]): string | null {
  if (schemaColumns.length === 0) return 'reference schema is not configured';
  for (const column of schemaColumns) {
    const required = Boolean(column.required_for_done ?? column.is_required ?? column.required);
    const value = rowData[column.column_code];
    if (required && (value === undefined || value === null || value === '')) return `${column.column_code} is required`;
    if (value === undefined || value === null || value === '') continue;
    if (!isValidGeneratedColumnValue(value, column)) return `${column.column_code} has invalid ${column.data_type} value`;
  }
  return null;
}

function isValidGeneratedColumnValue(value: unknown, column: ReferenceSchemaColumn): boolean {
  switch (column.data_type) {
    case 'text':
    case 'formula':
    case 'relation':
      return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
    case 'number':
      return typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)));
    case 'date':
      return typeof value === 'string' && !Number.isNaN(Date.parse(value));
    case 'enum': {
      const values = enumValues(column);
      return values.length === 0 || values.includes(String(value));
    }
    default:
      return false;
  }
}

function enumValues(column: ReferenceSchemaColumn): string[] {
  if (Array.isArray(column.enum_values)) return column.enum_values.map(String);
  if (isPlainObject(column.validation_json) && Array.isArray(column.validation_json.enum_values)) {
    return column.validation_json.enum_values.map(String);
  }
  if (isPlainObject(column.validation_json) && Array.isArray(column.validation_json.values)) {
    return column.validation_json.values.map(String);
  }
  return [];
}

async function getExistingRow(client: QueryClient, tableCode: string, rowKey: string): Promise<ReferenceRow | null> {
  const { rows } = await client.query<ReferenceRow>(
    `select org_id, table_code, row_key, row_data, version, is_active, display_order
       from public.reference_tables
      where org_id = app.current_org_id()
        and table_code = $1
        and row_key = $2
      limit 1`,
    [tableCode, rowKey],
  );
  return rows[0] ?? null;
}

async function refreshReferenceTableMv(client: QueryClient, orgId: string, tableCode: string): Promise<void> {
  await client.query(`select app.refresh_reference_table_mv($1::uuid, $2)`, [orgId, tableCode]);
}

function mapReferenceRow(row: ReferenceRow): { tableCode: string; rowKey: string; rowData: Record<string, unknown>; version: number; isActive: boolean; displayOrder: number | null } {
  return {
    tableCode: row.table_code,
    rowKey: row.row_key,
    rowData: row.row_data,
    version: row.version,
    isActive: row.is_active,
    displayOrder: row.display_order,
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
