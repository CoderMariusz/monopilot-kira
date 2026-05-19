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

type ReferenceUsage = {
  table_code: string;
  column_code: string;
  dropdown_source: string;
  referencing_active_rows?: number | string | null;
};

type FkWarning = {
  code: 'FK_REFERENCE_WARNING';
  message: string;
  references: Array<{ tableCode: string; columnCode: string; activeRows: number }>;
};

export type SoftDeleteReferenceRowResult =
  | { ok: true; data: { tableCode: string; rowKey: string; version: number; isActive: boolean }; warning?: FkWarning }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'VERSION_CONFLICT' | 'FK_REFERENCE_WARNING' | 'persistence_failed'; warning?: FkWarning };

export async function softDeleteReferenceRow(rawInput: unknown): Promise<SoftDeleteReferenceRowResult> {
  const input = parseSoftDeleteInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<SoftDeleteReferenceRowResult> => {
      const allowed = await hasPermission({ client, userId, orgId }, EDIT_PERMISSION);
      if (!allowed) return { ok: false, error: 'forbidden' };

      const warning = await buildFkWarning(client, input.tableCode);
      if (warning && !input.confirmReferenced) {
        return { ok: false, error: 'FK_REFERENCE_WARNING', warning };
      }

      const { rows, rowCount } = await client.query<ReferenceRow>(
        `update public.reference_tables
            set is_active = false
          where org_id = app.current_org_id()
            and table_code = $1
            and row_key = $2
            and version = $3::integer
            and is_active = true
          returning org_id, table_code, row_key, row_data, version, is_active, display_order`,
        [input.tableCode, input.rowKey, input.expectedVersion],
      );
      const row = rows[0];
      if ((rowCount ?? rows.length) < 1 || !row) {
        const exists = await getExistingRow(client, input.tableCode, input.rowKey);
        return exists ? { ok: false, error: 'VERSION_CONFLICT' } : { ok: false, error: 'not_found' };
      }

      await refreshReferenceTableMv(client, orgId, input.tableCode);
      return {
        ok: true,
        data: { tableCode: row.table_code, rowKey: row.row_key, version: row.version, isActive: row.is_active },
        ...(warning ? { warning } : {}),
      };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

function parseSoftDeleteInput(raw: unknown): { tableCode: string; rowKey: string; expectedVersion: number; confirmReferenced: boolean } | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as { tableCode?: unknown; rowKey?: unknown; expectedVersion?: unknown; confirmReferenced?: unknown };
  const tableCode = normalizeCode(candidate.tableCode);
  const rowKey = normalizeRowKey(candidate.rowKey);
  const expectedVersion = Number(candidate.expectedVersion);
  if (!tableCode || !rowKey || !Number.isInteger(expectedVersion) || expectedVersion < 1) return null;
  return { tableCode, rowKey, expectedVersion, confirmReferenced: candidate.confirmReferenced === true };
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

async function buildFkWarning(client: QueryClient, tableCode: string): Promise<FkWarning | undefined> {
  const { rows } = await client.query<ReferenceUsage>(
    `select table_code, column_code, dropdown_source, 0::integer as referencing_active_rows
       from public.reference_schemas
      where org_id = app.current_org_id()
        and dropdown_source = $1
        and deprecated_at is null`,
    [tableCode],
  );
  if (rows.length === 0) return undefined;
  return {
    code: 'FK_REFERENCE_WARNING',
    message: 'This reference value is used by generated schema dropdown fields; confirm before soft delete.',
    references: rows.map((row) => ({
      tableCode: row.table_code,
      columnCode: row.column_code,
      activeRows: Number(row.referencing_active_rows ?? 0),
    })),
  };
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
