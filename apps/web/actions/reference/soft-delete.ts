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

type SchemaReference = {
  table_code: string;
  column_code: string;
  dropdown_source: string;
};

type FkReferenceWarning = {
  code: 'REFERENCED_BY_SCHEMA';
  message: string;
  references: Array<{ tableCode: string; columnCode: string; activeRows: number }>;
};

export type SoftDeleteReferenceRowResult =
  | { ok: true; data: { tableCode: string; rowKey: string; version: number; isActive: boolean }; warning?: FkReferenceWarning }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'VERSION_CONFLICT' | 'persistence_failed' };

export async function softDeleteReferenceRow(rawInput: unknown): Promise<SoftDeleteReferenceRowResult> {
  const input = parseSoftDeleteInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<SoftDeleteReferenceRowResult> => {
      const allowed = await hasPermission({ client, userId, orgId }, EDIT_PERMISSION);
      if (!allowed) return { ok: false, error: 'forbidden' };

      const before = await getExistingRow(client, input.tableCode, input.rowKey);

      const warning = await buildReferencedBySchemaWarning(client, input.tableCode, input.rowKey);

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
        return before ? { ok: false, error: 'VERSION_CONFLICT' } : { ok: false, error: 'not_found' };
      }

      await refreshReferenceTableMv(client, orgId, input.tableCode);
      await writeAuditLog(client, {
        orgId,
        actorUserId: userId,
        action: 'reference.row.soft_delete',
        resourceId: `${input.tableCode}:${input.rowKey}`,
        beforeState: before ? { rowData: before.row_data, version: before.version, isActive: before.is_active } : null,
        afterState: { rowData: row.row_data, version: row.version, isActive: row.is_active, warning: warning ?? null },
      });
      await writeOutbox(client, {
        orgId,
        eventType: 'reference.row.soft_deleted',
        aggregateType: 'reference_table',
        aggregateId: orgId,
        payload: {
          tableCode: row.table_code,
          rowKey: row.row_key,
          version: row.version,
          referencedBySchema: Boolean(warning),
          references: warning?.references ?? [],
        },
      });

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

function parseSoftDeleteInput(raw: unknown): { tableCode: string; rowKey: string; expectedVersion: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as { tableCode?: unknown; rowKey?: unknown; expectedVersion?: unknown };
  const tableCode = normalizeCode(candidate.tableCode);
  const rowKey = normalizeRowKey(candidate.rowKey);
  const expectedVersion = Number(candidate.expectedVersion);
  if (!tableCode || !rowKey || !Number.isInteger(expectedVersion) || expectedVersion < 1) return null;
  return { tableCode, rowKey, expectedVersion };
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

async function buildReferencedBySchemaWarning(
  client: QueryClient,
  tableCode: string,
  rowKey: string,
): Promise<FkReferenceWarning | undefined> {
  // dropdown_source values are stored namespaced (e.g. 'reference.pack_sizes')
  // while the deleted tableCode arrives bare ('pack_sizes'). Match both forms,
  // and include universal (org_id IS NULL) schema rows alongside org overrides
  // so cross-table FK warnings defined at L1 are not silently dropped.
  const dropdownSources = tableCode.startsWith('reference.')
    ? [tableCode, tableCode.slice('reference.'.length)]
    : [tableCode, `reference.${tableCode}`];
  const { rows: schemaRows } = await client.query<SchemaReference>(
    `select table_code, column_code, dropdown_source
       from public.reference_schemas
      where dropdown_source = any($1::text[])
        and (org_id = app.current_org_id() or org_id is null)
        and deprecated_at is null`,
    [dropdownSources],
  );
  if (schemaRows.length === 0) return undefined;

  const references: Array<{ tableCode: string; columnCode: string; activeRows: number }> = [];
  for (const ref of schemaRows) {
    const { rows: countRows } = await client.query<{ active_count: number | string | null }>(
      `select count(*)::integer as active_count
         from public.reference_tables
        where org_id = app.current_org_id()
          and table_code = $1
          and is_active = true
          and (row_data ->> $2) = $3`,
      [ref.table_code, ref.column_code, rowKey],
    );
    const activeRows = Number(countRows[0]?.active_count ?? 0);
    if (activeRows > 0) {
      references.push({ tableCode: ref.table_code, columnCode: ref.column_code, activeRows });
    }
  }

  if (references.length === 0) return undefined;
  return {
    code: 'REFERENCED_BY_SCHEMA',
    message: 'This reference value is used by generated schema dropdown fields; soft-delete proceeds with a warning.',
    references,
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

async function writeOutbox(
  client: QueryClient,
  params: { orgId: string; eventType: string; aggregateType: string; aggregateId: string; payload: unknown },
): Promise<void> {
  await client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values ($1::uuid, $2, $3, $4::uuid, $5::jsonb, 'settings-reference-v1')`,
    [params.orgId, params.eventType, params.aggregateType, params.aggregateId, JSON.stringify(params.payload)],
  );
}
