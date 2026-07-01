'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';
import { hasPermission } from '../../lib/auth/has-permission';

const VIEW_PERMISSION = 'settings.reference.view';

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

export type GetReferenceRowResult =
  | { ok: true; data: { tableCode: string; rowKey: string; rowData: Record<string, unknown>; version: number; isActive: boolean; displayOrder: number | null } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'persistence_failed' };

export async function getReferenceRow(rawInput: unknown): Promise<GetReferenceRowResult> {
  const input = parseGetInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<GetReferenceRowResult> => {
      const allowed = await hasPermission({ client, userId, orgId }, VIEW_PERMISSION);
      if (!allowed) return { ok: false, error: 'forbidden' };

      const { rows } = await client.query<ReferenceRow>(
        `select org_id, table_code, row_key, row_data, version, is_active, display_order
           from public.reference_tables
          where org_id = app.current_org_id()
            and table_code = $1
            and row_key = $2
            and is_active = true
          limit 1`,
        [input.tableCode, input.rowKey],
      );

      const row = rows[0];
      if (!row) return { ok: false, error: 'not_found' };
      return { ok: true, data: mapReferenceRow(row) };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

function parseGetInput(raw: unknown): { tableCode: string; rowKey: string } | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as { tableCode?: unknown; rowKey?: unknown };
  const tableCode = normalizeCode(candidate.tableCode);
  const rowKey = normalizeRowKey(candidate.rowKey);
  if (!tableCode || !rowKey) return null;
  return { tableCode, rowKey };
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
