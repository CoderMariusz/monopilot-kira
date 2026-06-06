'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

const SETTINGS_UPDATE_PERMISSION = 'settings.org.update';
const SITES_ROUTE = '/settings/sites';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};

type OrgContextLike = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

export type SiteSettings = {
  primary: boolean;
  operating_hours: string;
  haccp_enabled: boolean;
  haccp_valid_until: string | null;
};

export type SiteRow = {
  id: string;
  org_id: string;
  code: string;
  name: string;
  address: string;
  country: string | null;
  latitude: string | null;
  longitude: string | null;
  map_x: number;
  map_y: number;
  line_count: number;
  worker_count: number;
  settings: SiteSettings;
  is_active: boolean;
};

export type LineRow = {
  id: string;
  org_id: string;
  code: string;
  name: string;
  type: string;
  workers: number;
  status: string;
};

export type SiteSettingsMutationResult =
  | { ok: true; data: SiteRow }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'persistence_failed' };

export type SitesSettingsData = {
  org_id: string;
  sites: SiteRow[];
  selected_site_id: string | null;
  lines: LineRow[];
  /**
   * Whether the current user may mutate sites (create/import/edit). Computed
   * from the SAME live `settings.org.update` check the write action gates on
   * (`hasSettingsUpdatePermission`), so the screen's affordances reflect the
   * caller's real DB permission rather than a hardcoded default.
   */
  can_edit: boolean;
};

type SiteDbRow = {
  id: string;
  org_id: string;
  site_code: string;
  name: string;
  is_default: boolean;
  country: string | null;
  address_text: string | null;
  latitude: string | null;
  longitude: string | null;
  map_x: number | string | null;
  map_y: number | string | null;
  operating_hours: string | null;
  haccp_enabled: boolean | null;
  haccp_valid_until: string | null;
  line_count: number | string | null;
  worker_count: number | string | null;
  is_active: boolean;
};

type LineDbRow = {
  id: string;
  org_id: string;
  code: string;
  name: string;
  type: string | null;
  workers: number | string | null;
  status: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UuidInput = z.string().trim().regex(UUID_RE);

const SiteSettingsInput = z
  .object({
    primary: z.boolean().optional(),
    operating_hours: z.string().trim().min(1).max(240).optional(),
    haccp_enabled: z.boolean().optional(),
    haccp_valid_until: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  })
  .strict();

function revalidateSitesRoute() {
  try {
    revalidatePath(SITES_ROUTE);
  } catch {
    /* no request store in action unit tests */
  }
}

function numeric(value: number | string | null, fallback = 0): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toSiteRow(row: SiteDbRow): SiteRow {
  return {
    id: row.id,
    org_id: row.org_id,
    code: row.site_code,
    name: row.name,
    address: row.address_text?.trim() || '',
    country: row.country,
    latitude: row.latitude,
    longitude: row.longitude,
    map_x: numeric(row.map_x, 50),
    map_y: numeric(row.map_y, 50),
    line_count: numeric(row.line_count),
    worker_count: numeric(row.worker_count),
    settings: {
      primary: row.is_default,
      operating_hours: row.operating_hours?.trim() || 'Mon-Fri 06:00-22:00',
      haccp_enabled: row.haccp_enabled ?? false,
      haccp_valid_until: row.haccp_valid_until,
    },
    is_active: row.is_active,
  };
}

function toLineRow(row: LineDbRow): LineRow {
  return {
    id: row.id,
    org_id: row.org_id,
    code: row.code,
    name: row.name,
    type: row.type?.trim() || 'production',
    workers: numeric(row.workers),
    status: row.status,
  };
}

async function hasSettingsUpdatePermission({ client, userId, orgId }: OrgContextLike): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or r.code = $3
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [userId, orgId, SETTINGS_UPDATE_PERMISSION],
  );
  return rows.length > 0;
}

async function querySites(context: OrgContextLike, orgId: string): Promise<SiteRow[]> {
  if (context.orgId !== orgId) return [];

  const { rows } = await context.client.query<SiteDbRow>(
    `select s.id::text,
            s.org_id::text,
            s.site_code,
            s.name,
            s.is_default,
            s.country,
            concat_ws(', ',
              nullif(s.address->>'street', ''),
              nullif(s.address->>'city', ''),
              nullif(s.address->>'postal_code', ''),
              nullif(s.address->>'country', '')
            ) as address_text,
            nullif(coalesce(s.address->>'lat', s.address->>'latitude'), '') as latitude,
            nullif(coalesce(s.address->>'lng', s.address->>'longitude'), '') as longitude,
            coalesce(nullif(s.l3_ext_cols->>'map_x', '')::numeric, 50)::text as map_x,
            coalesce(nullif(s.l3_ext_cols->>'map_y', '')::numeric, 50)::text as map_y,
            nullif(s.l3_ext_cols->>'operating_hours', '') as operating_hours,
            coalesce(nullif(s.l3_ext_cols->>'haccp_enabled', '')::boolean, false) as haccp_enabled,
            nullif(s.l3_ext_cols->>'haccp_valid_until', '') as haccp_valid_until,
            count(distinct pl.id)::text as line_count,
            coalesce(sum(coalesce((pl_stats.worker_count)::int, 0)), 0)::text as worker_count,
            s.is_active
       from public.sites s
       left join public.shift_patterns sp
         on sp.org_id = app.current_org_id()
        and sp.site_id = s.id
        and sp.is_active = true
       left join public.production_lines pl
         on pl.org_id = app.current_org_id()
        and (sp.line_id = pl.id::text or sp.line_id = pl.code)
       left join lateral (
         select count(distinct sp2.shift_id) as worker_count
           from public.shift_patterns sp2
          where sp2.org_id = app.current_org_id()
            and sp2.site_id = s.id
            and (sp2.line_id = pl.id::text or sp2.line_id = pl.code)
            and sp2.is_active = true
       ) pl_stats on true
      where s.org_id = app.current_org_id()
        and s.org_id = $1::uuid
        and s.is_active = true
      group by s.id, s.org_id, s.site_code, s.name, s.is_default, s.country, s.address, s.l3_ext_cols, s.is_active
      order by s.is_default desc, lower(s.name), lower(s.site_code)`,
    [orgId],
  );

  return rows.map(toSiteRow);
}

async function queryLinesForSite(context: OrgContextLike, orgId: string, siteId: string): Promise<LineRow[]> {
  const parsed = z.object({ orgId: UuidInput, siteId: UuidInput }).safeParse({ orgId, siteId });
  if (!parsed.success || context.orgId !== parsed.data.orgId) return [];

  const { rows } = await context.client.query<LineDbRow>(
    `select distinct
            pl.id::text,
            pl.org_id::text,
            pl.code,
            pl.name,
            coalesce(l.location_type, 'production') as type,
            count(distinct sp.shift_id)::text as workers,
            pl.status
       from public.production_lines pl
       join public.shift_patterns sp
         on sp.org_id = app.current_org_id()
        and (sp.line_id = pl.id::text or sp.line_id = pl.code)
        and sp.site_id = $2::uuid
        and sp.is_active = true
       left join public.locations l
         on l.id = pl.default_location_id
        and l.org_id = app.current_org_id()
      where pl.org_id = app.current_org_id()
        and pl.org_id = $1::uuid
      group by pl.id, pl.org_id, pl.code, pl.name, l.location_type, pl.status
      order by lower(pl.name), lower(pl.code)`,
    [parsed.data.orgId, parsed.data.siteId],
  );

  return rows.map(toLineRow);
}

export async function getSites(orgId: string): Promise<SiteRow[]> {
  return withOrgContext<SiteRow[]>(async (ctx): Promise<SiteRow[]> => querySites(ctx as OrgContextLike, orgId));
}

export async function getLinesForSite(orgId: string, siteId: string): Promise<LineRow[]> {
  return withOrgContext<LineRow[]>(async (ctx): Promise<LineRow[]> => queryLinesForSite(ctx as OrgContextLike, orgId, siteId));
}

export async function readSitesSettingsData(): Promise<SitesSettingsData> {
  return withOrgContext<SitesSettingsData>(async (ctx): Promise<SitesSettingsData> => {
    const context = ctx as OrgContextLike;
    const [sites, canEdit] = await Promise.all([
      querySites(context, context.orgId),
      hasSettingsUpdatePermission(context),
    ]);
    const selectedSiteId = sites[0]?.id ?? null;
    const lines = selectedSiteId ? await queryLinesForSite(context, context.orgId, selectedSiteId) : [];
    return { org_id: context.orgId, sites, selected_site_id: selectedSiteId, lines, can_edit: canEdit };
  });
}

export async function updateSiteSettings(
  orgId: string,
  siteId: string,
  settings: unknown,
): Promise<SiteSettingsMutationResult> {
  const parsed = z.object({ orgId: UuidInput, siteId: UuidInput, settings: SiteSettingsInput }).safeParse({ orgId, siteId, settings });
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext<SiteSettingsMutationResult>(async (ctx): Promise<SiteSettingsMutationResult> => {
      const context = ctx as OrgContextLike;
      if (context.orgId !== parsed.data.orgId) return { ok: false, error: 'forbidden' };
      if (!(await hasSettingsUpdatePermission(context))) return { ok: false, error: 'forbidden' };

      if (parsed.data.settings.primary === true) {
        await context.client.query(
          `update public.sites
              set is_default = false,
                  updated_by = $2::uuid,
                  updated_at = now()
            where org_id = app.current_org_id()
              and org_id = $1::uuid
              and id <> $3::uuid`,
          [parsed.data.orgId, context.userId, parsed.data.siteId],
        );
      }

      const { rows } = await context.client.query<SiteDbRow>(
        `update public.sites
            set is_default = coalesce($3::boolean, is_default),
                l3_ext_cols = l3_ext_cols
                  || jsonb_strip_nulls(jsonb_build_object(
                       'operating_hours', $4::text,
                       'haccp_enabled', $5::boolean,
                       'haccp_valid_until', $6::text
                     )),
                updated_by = $7::uuid,
                updated_at = now()
          where org_id = app.current_org_id()
            and org_id = $1::uuid
            and id = $2::uuid
          returning id::text,
                    org_id::text,
                    site_code,
                    name,
                    is_default,
                    country,
                    concat_ws(', ',
                      nullif(address->>'street', ''),
                      nullif(address->>'city', ''),
                      nullif(address->>'postal_code', ''),
                      nullif(address->>'country', '')
                    ) as address_text,
                    nullif(coalesce(address->>'lat', address->>'latitude'), '') as latitude,
                    nullif(coalesce(address->>'lng', address->>'longitude'), '') as longitude,
                    coalesce(nullif(l3_ext_cols->>'map_x', '')::numeric, 50)::text as map_x,
                    coalesce(nullif(l3_ext_cols->>'map_y', '')::numeric, 50)::text as map_y,
                    nullif(l3_ext_cols->>'operating_hours', '') as operating_hours,
                    coalesce(nullif(l3_ext_cols->>'haccp_enabled', '')::boolean, false) as haccp_enabled,
                    nullif(l3_ext_cols->>'haccp_valid_until', '') as haccp_valid_until,
                    0::text as line_count,
                    0::text as worker_count,
                    is_active`,
        [
          parsed.data.orgId,
          parsed.data.siteId,
          parsed.data.settings.primary ?? null,
          parsed.data.settings.operating_hours ?? null,
          parsed.data.settings.haccp_enabled ?? null,
          parsed.data.settings.haccp_valid_until ?? null,
          context.userId,
        ],
      );

      const row = rows[0];
      if (!row) return { ok: false, error: 'not_found' };
      revalidateSitesRoute();
      return { ok: true, data: toSiteRow(row) };
    });
  } catch (error) {
    console.error('[settings/sites] update_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return { ok: false, error: 'persistence_failed' };
  }
}
