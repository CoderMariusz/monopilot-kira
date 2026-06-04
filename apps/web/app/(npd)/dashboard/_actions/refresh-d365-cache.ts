'use server';

import { withOrgContext } from '../../../../lib/auth/with-org-context';

const D365_EXECUTE_PERMISSIONS = ['npd.d365_builder.execute', 'd365_builder.execute'] as const;
const EVENT_TYPE = 'd365.cache.refreshed';
const THROTTLE_SECONDS = 60;

type D365Status = 'Found' | 'NoCost' | 'Missing';
type D365RefreshRow = {
  code: string;
  status: D365Status;
  comment?: string | null;
};
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};
type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};
type LastSyncedRow = {
  last_synced_at: string;
};

declare global {
  var __T051_D365_CACHE_REFRESH__: undefined | ((orgId: string) => Promise<D365RefreshRow[]>);
}

export type RefreshD365CacheResult = {
  lastSyncedAt: string;
};

export async function refreshD365Cache(): Promise<RefreshD365CacheResult> {
  return await withOrgContext<RefreshD365CacheResult>(async ({ userId, orgId, client }: OrgActionContext) => {
    if (!(await hasAnyPermission({ userId, orgId, client }, D365_EXECUTE_PERMISSIONS))) {
      throw new Error('FORBIDDEN');
    }

    await lockRefreshForOrg(client, orgId);
    await assertNotThrottled(client);

    const syncedRows = await refreshFromD365(orgId);
    const lastSyncedAt = await upsertCacheRows(client, orgId, syncedRows);
    await emitRefreshedEvent(client, orgId, userId, lastSyncedAt, syncedRows.length);

    return { lastSyncedAt };
  });
}

async function lockRefreshForOrg(client: QueryClient, orgId: string): Promise<void> {
  await client.query(
    `select pg_advisory_xact_lock(hashtextextended('npd-d365-cache-refresh:' || $1::text, 0))`,
    [orgId],
  );
}

async function assertNotThrottled(client: QueryClient): Promise<void> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.outbox_events
      where org_id = app.current_org_id()
        and event_type = $1
        and created_at > now() - make_interval(secs => $2::integer)
      limit 1`,
    [EVENT_TYPE, THROTTLE_SECONDS],
  );
  if (rows.length > 0) throw new Error('THROTTLED');
}

async function refreshFromD365(orgId: string): Promise<D365RefreshRow[]> {
  const adapter = globalThis.__T051_D365_CACHE_REFRESH__;
  if (!adapter) throw new Error('D365_ADAPTER_UNCONFIGURED');
  const rows = await adapter(orgId);
  return rows.map(normalizeD365Row);
}

function normalizeD365Row(row: D365RefreshRow): D365RefreshRow {
  const code = row.code.trim();
  if (!code) throw new Error('D365_ADAPTER_INVALID_ROW');
  if (!['Found', 'NoCost', 'Missing'].includes(row.status)) {
    throw new Error('D365_ADAPTER_INVALID_ROW');
  }
  return {
    code,
    status: row.status,
    comment: row.comment ?? null,
  };
}

async function upsertCacheRows(client: QueryClient, orgId: string, rows: D365RefreshRow[]): Promise<string> {
  const { rows: synced } = await client.query<LastSyncedRow>(
    `with incoming as (
       select *
       from jsonb_to_recordset($2::jsonb)
         as x(code text, status text, comment text)
     ),
     upserted as (
       insert into public.d365_import_cache (org_id, code, status, comment, last_synced_at)
       select $1::uuid, code, status, comment, now()
       from incoming
       on conflict (org_id, code) do update
         set status = excluded.status,
             comment = excluded.comment,
             last_synced_at = excluded.last_synced_at
       returning last_synced_at
     )
     select coalesce(max(last_synced_at), now())::text as last_synced_at
     from upserted`,
    [orgId, JSON.stringify(rows)],
  );
  return synced[0]?.last_synced_at ?? new Date().toISOString();
}

async function emitRefreshedEvent(
  client: QueryClient,
  orgId: string,
  userId: string,
  lastSyncedAt: string,
  rowCount: number,
): Promise<void> {
  await client.query(
    `insert into public.outbox_events (
       org_id, event_type, aggregate_type, aggregate_id, payload, app_version
     )
     values (
       $1::uuid,
       $2,
       'd365_import_cache',
       $1::text,
       jsonb_build_object(
         'org_id', $1::text,
         'actor_user_id', $3::text,
         'last_synced_at', $4::text,
         'row_count', $5::integer
       ),
       't-051'
     )`,
    [orgId, EVENT_TYPE, userId, lastSyncedAt, rowCount],
  );
}

async function hasAnyPermission(ctx: OrgActionContext, permissions: readonly string[]): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp
         on rp.role_id = r.id
        and rp.permission = any($3::text[])
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or exists (
            select 1
            from jsonb_array_elements_text(coalesce(r.permissions, '[]'::jsonb)) p(permission)
            where p.permission = any($3::text[])
          )
        )
      limit 1`,
    [ctx.userId, ctx.orgId, permissions],
  );
  return rows.length > 0;
}
