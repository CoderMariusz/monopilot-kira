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

/** Friendly error union shared by the create/update mutations. */
export type SiteMutationError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'duplicate_code'
  | 'persistence_failed';

export type CreateSiteResult =
  | { ok: true; data: { id: string; code: string; name: string } }
  | { ok: false; error: SiteMutationError };

export type LineMutationResult =
  | { ok: true; data: { id: string; code: string; name: string; status: string } }
  | { ok: false; error: SiteMutationError };

/** Input for {@link createSite}. */
export type CreateSiteInput = {
  site_code: string;
  name: string;
  timezone?: string;
  country?: string | null;
  legal_entity?: string | null;
  is_default?: boolean;
};

/** Input for {@link createLine}. A line is associated to a site (see below). */
export type CreateLineInput = {
  site_id: string;
  code: string;
  name: string;
  status?: string;
};

/** Input for {@link updateLine}. */
export type UpdateLineInput = {
  id: string;
  site_id: string;
  code: string;
  name: string;
  status?: string;
};

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

// Format-only UUID check (8-4-4-4-12 hex). MUST NOT enforce the RFC-4122
// version/variant bytes ([1-5] / [89ab]): the seed org UUIDs are
// 00000000-0000-0000-0000-0000000000xx (version=0, variant=0) and a strict
// regex rejected them at the queryLinesForSite guard → the per-site lines list
// returned [] for every user (querySites used a plain string guard, hence worked).
// The real org security guard is `context.orgId !== orgId`, not this format check.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UuidInput = z.string().trim().regex(UUID_RE);

const SiteSettingsInput = z
  .object({
    primary: z.boolean().optional(),
    operating_hours: z.string().trim().min(1).max(240).optional(),
    haccp_enabled: z.boolean().optional(),
    haccp_valid_until: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  })
  .strict();

const LINE_STATUSES = ['active', 'maintenance', 'inactive'] as const;

const CodeInput = z.string().trim().min(1).max(64);
const NameInput = z.string().trim().min(1).max(200);

const CreateSiteSchema = z
  .object({
    site_code: CodeInput,
    name: NameInput,
    timezone: z.string().trim().min(1).max(64).optional(),
    country: z.string().trim().min(1).max(120).nullable().optional(),
    legal_entity: z.string().trim().min(1).max(200).nullable().optional(),
    is_default: z.boolean().optional(),
  })
  .strict();

const CreateLineSchema = z
  .object({
    site_id: UuidInput,
    code: CodeInput,
    name: NameInput,
    status: z.enum(LINE_STATUSES).optional(),
  })
  .strict();

const UpdateLineSchema = z
  .object({
    id: UuidInput,
    site_id: UuidInput,
    code: CodeInput,
    name: NameInput,
    status: z.enum(LINE_STATUSES).optional(),
  })
  .strict();

/**
 * Postgres unique-violation SQLSTATE. We map it to the friendly
 * `'duplicate_code'` error so the UI can surface a field-level message rather
 * than a generic failure (the unique constraints are `sites_org_code_uq` and
 * the site-scoped production line unique indexes from migration 268).
 */
const PG_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === PG_UNIQUE_VIOLATION;
}

const SETTINGS_LINE_EVENT = 'settings.line.upserted';

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
            coalesce(case when (s.l3_ext_cols->>'map_x') ~ '^-?[0-9]+(\.[0-9]+)?$' then (s.l3_ext_cols->>'map_x')::numeric else null end, 50)::text as map_x,
            coalesce(case when (s.l3_ext_cols->>'map_y') ~ '^-?[0-9]+(\.[0-9]+)?$' then (s.l3_ext_cols->>'map_y')::numeric else null end, 50)::text as map_y,
            nullif(s.l3_ext_cols->>'operating_hours', '') as operating_hours,
            coalesce(nullif(s.l3_ext_cols->>'haccp_enabled', '')::boolean, false) as haccp_enabled,
            nullif(s.l3_ext_cols->>'haccp_valid_until', '') as haccp_valid_until,
            count(distinct pl.id)::text as line_count,
            coalesce(sum(coalesce((pl_stats.worker_count)::int, 0)), 0)::text as worker_count,
            s.is_active
       from public.sites s
       left join public.production_lines pl
         on pl.org_id = app.current_org_id()
        and pl.site_id = s.id
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
    `select
            pl.id::text,
            pl.org_id::text,
            pl.code,
            pl.name,
            coalesce(l.location_type, 'production') as type,
            count(distinct sp.shift_id)::text as workers,
            pl.status
       from public.production_lines pl
       left join public.shift_patterns sp
         on sp.org_id = app.current_org_id()
        and (sp.line_id = pl.id::text or sp.line_id = pl.code)
        and sp.site_id = $2::uuid
        and sp.is_active = true
       left join public.locations l
         on l.id = pl.default_location_id
        and l.org_id = app.current_org_id()
      where pl.org_id = app.current_org_id()
        and pl.org_id = $1::uuid
        and pl.site_id = $2::uuid
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
                    coalesce(case when (l3_ext_cols->>'map_x') ~ '^-?[0-9]+(\.[0-9]+)?$' then (l3_ext_cols->>'map_x')::numeric else null end, 50)::text as map_x,
                    coalesce(case when (l3_ext_cols->>'map_y') ~ '^-?[0-9]+(\.[0-9]+)?$' then (l3_ext_cols->>'map_y')::numeric else null end, 50)::text as map_y,
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

/**
 * Create a new site for the caller's org.
 *
 * Mirrors {@link updateSiteSettings}: zod-validated, org-context wrapped,
 * gated on the live `settings.org.update` permission, org-scoped INSERT under
 * RLS. A duplicate `site_code` (unique `sites_org_code_uq`) is surfaced as the
 * friendly `'duplicate_code'`. When `is_default` is requested we first clear
 * the existing default in the org so the partial unique index `idx_sites_default`
 * (one default per org) cannot conflict.
 *
 * No outbox event is emitted: `outbox_events_event_type_check` has no allowed
 * `settings.site.*` event_type, and inventing one would violate the CHECK.
 */
export async function createSite(input: unknown): Promise<CreateSiteResult> {
  const parsed = CreateSiteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const data = parsed.data;

  try {
    return await withOrgContext<CreateSiteResult>(async (ctx): Promise<CreateSiteResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasSettingsUpdatePermission(context))) return { ok: false, error: 'forbidden' };

      if (data.is_default === true) {
        await context.client.query(
          `update public.sites
              set is_default = false,
                  updated_by = $1::uuid,
                  updated_at = now()
            where org_id = app.current_org_id()
              and is_default = true`,
          [context.userId],
        );
      }

      const { rows } = await context.client.query<{ id: string; site_code: string; name: string }>(
        `insert into public.sites (org_id, site_code, name, timezone, country, legal_entity, is_default, created_by, updated_by)
         values (app.current_org_id(), $1, $2, coalesce($3, 'UTC'), $4, $5, coalesce($6::boolean, false), $7::uuid, $7::uuid)
         returning id::text, site_code, name`,
        [
          data.site_code,
          data.name,
          data.timezone ?? null,
          data.country ?? null,
          data.legal_entity ?? null,
          data.is_default ?? false,
          context.userId,
        ],
      );

      const row = rows[0];
      if (!row) return { ok: false, error: 'persistence_failed' };
      revalidateSitesRoute();
      return { ok: true, data: { id: row.id, code: row.site_code, name: row.name } };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: 'duplicate_code' };
    console.error('[settings/sites] create_site_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return { ok: false, error: 'persistence_failed' };
  }
}

/**
 * Ensure the target site belongs to this org, and optionally that no sibling
 * line at the same site already uses the requested code.
 */
async function siteExists(context: OrgContextLike, siteId: string): Promise<boolean> {
  const { rows } = await context.client.query<{ ok: boolean }>(
    `select true as ok
       from public.sites
      where org_id = app.current_org_id()
        and id = $1::uuid
        and is_active = true
      limit 1`,
    [siteId],
  );
  return rows.length > 0;
}

async function lineCodeExistsAtSite(context: OrgContextLike, siteId: string, code: string, exceptLineId?: string): Promise<boolean> {
  const { rows } = await context.client.query<{ ok: boolean }>(
    `select true as ok
       from public.production_lines
      where org_id = app.current_org_id()
        and site_id = $1::uuid
        and lower(code) = lower($2)
        and ($3::uuid is null or id <> $3::uuid)
      limit 1`,
    [siteId, code, exceptLineId ?? null],
  );
  return rows.length > 0;
}

function emitLineUpserted(context: OrgContextLike, lineId: string, action: 'created' | 'updated'): Promise<unknown> {
  // `settings.line.upserted` is an allowed event_type in
  // outbox_events_event_type_check — safe to emit (do NOT invent new ones).
  return context.client.query(
    `insert into public.outbox_events (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values (app.current_org_id(), $1, 'production_line', $2, $3::jsonb, coalesce(current_setting('app.app_version', true), 'dev'))`,
    [SETTINGS_LINE_EVENT, lineId, JSON.stringify({ line_id: lineId, action })],
  );
}

/**
 * Create a production line at the selected site. Org-context wrapped,
 * admin-gated, RLS-scoped, duplicate `code` at the same site →
 * `'duplicate_code'`.
 */
export async function createLine(input: unknown): Promise<LineMutationResult> {
  const parsed = CreateLineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const data = parsed.data;

  try {
    return await withOrgContext<LineMutationResult>(async (ctx): Promise<LineMutationResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasSettingsUpdatePermission(context))) return { ok: false, error: 'forbidden' };
      if (!(await siteExists(context, data.site_id))) return { ok: false, error: 'not_found' };
      if (await lineCodeExistsAtSite(context, data.site_id, data.code)) return { ok: false, error: 'duplicate_code' };

      const { rows } = await context.client.query<{ id: string; code: string; name: string; status: string }>(
        `insert into public.production_lines (org_id, site_id, code, name, status)
         values (app.current_org_id(), $1::uuid, $2, $3, coalesce($4, 'active'))
         returning id::text, code, name, status`,
        [data.site_id, data.code, data.name, data.status ?? null],
      );

      const row = rows[0];
      if (!row) return { ok: false, error: 'persistence_failed' };

      await emitLineUpserted(context, row.id, 'created');

      revalidateSitesRoute();
      return { ok: true, data: row };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: 'duplicate_code' };
    console.error('[settings/sites] create_line_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return { ok: false, error: 'persistence_failed' };
  }
}

/**
 * Update an existing production line (site/code/name/status) and re-affirm its site
 * association. Org-context wrapped, admin-gated, RLS-scoped, duplicate `code`
 * → `'duplicate_code'`, missing row → `'not_found'`.
 */
export async function updateLine(input: unknown): Promise<LineMutationResult> {
  const parsed = UpdateLineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const data = parsed.data;

  try {
    return await withOrgContext<LineMutationResult>(async (ctx): Promise<LineMutationResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasSettingsUpdatePermission(context))) return { ok: false, error: 'forbidden' };
      if (!(await siteExists(context, data.site_id))) return { ok: false, error: 'not_found' };
      if (await lineCodeExistsAtSite(context, data.site_id, data.code, data.id)) return { ok: false, error: 'duplicate_code' };

      const { rows } = await context.client.query<{ id: string; code: string; name: string; status: string }>(
        `update public.production_lines
            set site_id = $2::uuid,
                code = $3,
                name = $4,
                status = coalesce($5, status)
          where org_id = app.current_org_id()
            and id = $1::uuid
          returning id::text, code, name, status`,
        [data.id, data.site_id, data.code, data.name, data.status ?? null],
      );

      const row = rows[0];
      if (!row) return { ok: false, error: 'not_found' };

      await emitLineUpserted(context, row.id, 'updated');

      revalidateSitesRoute();
      return { ok: true, data: row };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: 'duplicate_code' };
    console.error('[settings/sites] update_line_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return { ok: false, error: 'persistence_failed' };
  }
}
