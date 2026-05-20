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

type ReferenceRow = {
  org_id: string;
  table_code: string;
  row_key: string;
  row_data: Record<string, unknown>;
  version: number;
  is_active: boolean;
  display_order: number | null;
};

export type ListReferenceRowsResult =
  | { ok: true; data: Array<{ tableCode: string; rowKey: string; rowData: Record<string, unknown>; version: number; isActive: boolean; displayOrder: number | null }> }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'persistence_failed' };

export async function listReferenceRows(rawInput: unknown): Promise<ListReferenceRowsResult> {
  const input = parseListInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<ListReferenceRowsResult> => {
      const allowed = await hasPermission({ client, userId, orgId }, VIEW_PERMISSION);
      if (!allowed) return { ok: false, error: 'forbidden' };

      const { rows } = await client.query<ReferenceRow>(
        `select org_id, table_code, row_key, row_data, version, is_active, display_order
           from public.reference_tables
          where org_id = app.current_org_id()
            and table_code = $1
            and ($2::boolean = true or is_active = true)
          order by display_order asc nulls last, row_key asc`,
        [input.tableCode, input.includeInactive],
      );

      return { ok: true, data: rows.map(mapReferenceRow) };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

function parseListInput(raw: unknown): { tableCode: string; includeInactive: boolean } | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as { tableCode?: unknown; includeInactive?: unknown };
  const tableCode = normalizeCode(candidate.tableCode);
  if (!tableCode) return null;
  return { tableCode, includeInactive: candidate.includeInactive === true };
}

function normalizeCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^[a-z0-9_][a-z0-9_-]{0,63}$/i.test(trimmed) ? trimmed : null;
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
