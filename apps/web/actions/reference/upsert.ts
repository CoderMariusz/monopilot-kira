'use server';

import { hasPermission } from '../../lib/auth/has-permission';
import { withOrgContext } from '../../lib/auth/with-org-context';
import { writeSettingsReferenceOutbox } from './_shared/outbox';
import { revalidateLocalized } from '../../lib/i18n/revalidate-localized';

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

type ReferenceRowView = {
  tableCode: string;
  rowKey: string;
  rowData: Record<string, unknown>;
  version: number;
  isActive: boolean;
  displayOrder: number | null;
};

export type UpsertReferenceRowResult =
  | { ok: true; data: ReferenceRowView }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'persistence_failed'; message?: string }
  | { ok: false; error: 'VERSION_CONFLICT'; latest: ReferenceRowView };

export async function upsertReferenceRow(rawInput: unknown): Promise<UpsertReferenceRowResult> {
  const input = parseUpsertInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input', message: describeParseFailure(rawInput) };

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<UpsertReferenceRowResult> => {
      const allowed = await hasPermission({ client, userId, orgId }, EDIT_PERMISSION);
      if (!allowed) return { ok: false, error: 'forbidden' };

      const schemaColumns = await loadGeneratedSchema(client, input.tableCode);
      const schemaError = validateAgainstGeneratedSchema(input.rowData, schemaColumns, input.tableCode);
      if (schemaError) return { ok: false, error: 'invalid_input', message: schemaError };

      const existing = await getExistingRow(client, input.tableCode, input.rowKey);
      if (existing && input.expectedVersion !== undefined && existing.version !== input.expectedVersion) {
        return { ok: false, error: 'VERSION_CONFLICT', latest: mapReferenceRow(existing) };
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
        if ((rowCount ?? rows.length) < 1 || !updated) {
          const latest = await getExistingRow(client, input.tableCode, input.rowKey);
          if (!latest) return { ok: false, error: 'not_found' };
          return { ok: false, error: 'VERSION_CONFLICT', latest: mapReferenceRow(latest) };
        }
        if (rowDataChanged) await refreshReferenceTableMv(client, orgId, input.tableCode);
        await writeAuditLog(client, {
          orgId,
          actorUserId: userId,
          action: 'reference.row.upsert',
          resourceId: `${input.tableCode}:${input.rowKey}`,
          beforeState: { rowData: existing.row_data, version: existing.version, isActive: existing.is_active },
          afterState: { rowData: updated.row_data, version: updated.version, isActive: updated.is_active },
        });
        await writeSettingsReferenceOutbox(client, {
          orgId,
          eventType: 'reference.row.upserted',
          aggregateType: 'reference_table',
          aggregateId: orgId,
          payload: { tableCode: updated.table_code, rowKey: updated.row_key, version: updated.version, action: 'update' },
        });
        revalidateReferenceSettingsPaths(input.tableCode);
        return { ok: true, data: mapReferenceRow(updated) };
      }

      if (input.expectedVersion !== undefined) {
        return { ok: false, error: 'not_found' };
      }

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
      await writeAuditLog(client, {
        orgId,
        actorUserId: userId,
        action: 'reference.row.upsert',
        resourceId: `${input.tableCode}:${input.rowKey}`,
        beforeState: null,
        afterState: { rowData: inserted.row_data, version: inserted.version, isActive: inserted.is_active },
      });
      await writeSettingsReferenceOutbox(client, {
        orgId,
        eventType: 'reference.row.upserted',
        aggregateType: 'reference_table',
        aggregateId: orgId,
        payload: { tableCode: inserted.table_code, rowKey: inserted.row_key, version: inserted.version, action: 'insert' },
      });
      revalidateReferenceSettingsPaths(input.tableCode);
      return { ok: true, data: mapReferenceRow(inserted) };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

function revalidateReferenceSettingsPaths(tableCode: string): void {
  try {
    revalidateLocalized('/settings/reference', 'page');
    if (tableCode === 'processes') revalidateLocalized('/settings/processes', 'page');
    if (tableCode === 'partners') revalidateLocalized('/settings/partners', 'page');
  } catch (error) {
    console.warn('[settings/reference] revalidate_skipped', error instanceof Error ? { message: error.message } : { message: String(error) });
  }
}

/**
 * Pinpoints WHICH input field failed top-level parsing so the UI can show a
 * field hint instead of a bare `invalid_input` (2026-06-11 clickthrough §1).
 */
function describeParseFailure(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return 'request body must be an object';
  const candidate = raw as { tableCode?: unknown; rowKey?: unknown; rowData?: unknown; expectedVersion?: unknown; displayOrder?: unknown };
  if (!normalizeCode(candidate.tableCode)) return 'tableCode is missing or not a valid table code';
  if (!normalizeRowKey(candidate.rowKey)) return 'rowKey is required (1-128 chars)';
  if (!isPlainObject(candidate.rowData)) return 'rowData must be an object of column values';
  if (candidate.expectedVersion !== undefined) {
    const version = Number(candidate.expectedVersion);
    if (!Number.isInteger(version) || version < 1) return 'expectedVersion must be a positive integer';
  }
  if (candidate.displayOrder !== undefined && !Number.isInteger(Number(candidate.displayOrder))) {
    return 'displayOrder must be an integer';
  }
  return 'invalid input';
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

async function loadGeneratedSchema(client: QueryClient, tableCode: string): Promise<ReferenceSchemaColumn[]> {
  // reference_tables DATA rows use a bare table_code (e.g. 'processes'); the
  // reference_schemas SCHEMA rows live under the 'reference.<code>' namespace
  // (T-093 convention). Accept both so the bare code the UI passes still
  // resolves the schema.
  const schemaTableCodes = tableCode.startsWith('reference.')
    ? [tableCode, tableCode.slice('reference.'.length)]
    : [tableCode, `reference.${tableCode}`];

  // Universal L1 schemas are seeded with org_id IS NULL and must be visible to
  // every org's write validation. Match BOTH org-scoped overrides and universal
  // rows; dedupe per column_code preferring the org-scoped override (org_id not
  // null sorts before null via `nulls last`).
  const { rows } = await client.query<ReferenceSchemaColumn>(
    `select distinct on (column_code) column_code, data_type, required_for_done, validation_json
       from public.reference_schemas
      where table_code = any($1::text[])
        and (org_id = app.current_org_id() or org_id is null)
        and deprecated_at is null
      order by column_code, org_id nulls last`,
    [schemaTableCodes],
  );
  return rows;
}

function validateAgainstGeneratedSchema(rowData: Record<string, unknown>, schemaColumns: ReferenceSchemaColumn[], tableCode?: string): string | null {
  if (schemaColumns.length === 0) {
    return `reference schema is not configured for ${tableCode ?? 'this table'} (seed reference_schemas — see migration 286)`;
  }
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
      return isValidTextValue(value, column);
    case 'number':
      return isValidNumberValue(value, column);
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

function isValidTextValue(value: unknown, column: ReferenceSchemaColumn): boolean {
  if (!(typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) return false;
  if (isPlainObject(column.validation_json) && typeof column.validation_json.pattern === 'string') {
    return new RegExp(column.validation_json.pattern).test(String(value));
  }
  return true;
}

function isValidNumberValue(value: unknown, column: ReferenceSchemaColumn): boolean {
  if (!(typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))))) {
    return false;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return false;
  if (isPlainObject(column.validation_json)) {
    const min = column.validation_json.min;
    if (typeof min === 'number' && n < min) return false;
    const scale = column.validation_json.scale;
    if (typeof scale === 'number') {
      const [, decimals = ''] = String(value).split('.');
      if (decimals.length > scale) return false;
    }
  }
  return true;
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

async function writeAuditLog(
  client: QueryClient,
  params: { orgId: string; actorUserId: string; action: string; resourceId: string; beforeState: unknown; afterState: unknown },
): Promise<void> {
  await client.query(
    `insert into public.audit_log
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
     values ($1::uuid, $2::uuid, 'user', $3, 'reference_table', $4, $5::jsonb, $6::jsonb, 'standard')`,
    [
      params.orgId,
      params.actorUserId,
      params.action,
      params.resourceId,
      JSON.stringify(params.beforeState),
      JSON.stringify(params.afterState),
    ],
  );
}

function mapReferenceRow(row: ReferenceRow): ReferenceRowView {
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
