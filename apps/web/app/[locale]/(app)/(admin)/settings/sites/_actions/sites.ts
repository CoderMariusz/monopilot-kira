'use server';

import { z } from 'zod';

import { upsertLine } from '../../../../../../../actions/infra/line';
import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';

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
  timezone?: string;
  country?: string | null;
  legal_entity?: string | null;
};

export type SiteRow = {
  id: string;
  org_id: string;
  code: string;
  name: string;
  address: string;
  country: string | null;
  timezone: string;
  legal_entity: string | null;
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
  | {
      ok: false;
      error: 'invalid_input' | 'forbidden' | 'not_found' | 'persistence_failed';
      message?: string;
      field?: string;
    };

/** Friendly error union shared by the create/update mutations. */
export type SiteMutationError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'duplicate_code'
  | 'warehouse_site_mismatch'
  | 'invalid_location_reference'
  | 'inactive_location_reference'
  | 'location_requires_warehouse'
  | 'persistence_failed';

export type SiteLifecycleError = SiteMutationError | 'has_dependents';

/**
 * `message` (already human-readable) and `field` (the offending input) are set
 * whenever the server can name *why* a payload was rejected, so the modal can
 * show an actionable reason next to the right input instead of guessing.
 */
export type CreateSiteResult =
  | { ok: true; data: { id: string; code: string; name: string } }
  | { ok: false; error: SiteMutationError; message?: string; field?: string };

export type RenameSiteInput = { id: string; name: string };
export type RenameSiteResult =
  | { ok: true; data: { id: string; name: string } }
  | { ok: false; error: SiteMutationError; message?: string; field?: string };

export type DeleteSiteInput = { id: string };
export type DeleteSiteResult =
  | { ok: true; data: { id: string } }
  | { ok: false; error: SiteLifecycleError; message?: string };

export type LineMutationResult =
  | { ok: true; data: { id: string; code: string; name: string; status: string } }
  | { ok: false; error: SiteMutationError; message?: string; field?: string };

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
  site_id?: string;
  siteId?: string | null;
  warehouseId?: string | null;
  defaultOutputLocationId?: string | null;
  code: string;
  name: string;
  status?: 'draft' | 'active' | 'inactive';
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

export type LineFormSiteOption = { id: string; code: string; name: string; isDefault?: boolean };
export type LineFormWarehouseOption = { id: string; name: string; siteId: string | null };
export type LineFormLocationOption = { id: string; code: string; name: string; warehouseId: string | null; path: string | null; isActive: boolean };

export type LineFormOptions = {
  sites: LineFormSiteOption[];
  warehouses: LineFormWarehouseOption[];
  locations: LineFormLocationOption[];
};

type SiteDbRow = {
  id: string;
  org_id: string;
  site_code: string;
  name: string;
  is_default: boolean;
  country: string | null;
  timezone: string | null;
  legal_entity: string | null;
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

/**
 * `Intl.supportedValuesOf('timeZone')` does NOT contain 'UTC' — it lists primary
 * IANA zone identifiers only. 'UTC' is this app's own default time zone (the
 * `coalesce($3, 'UTC')` in the createSite INSERT, and the fallback in
 * `toSiteRow`), so the previous version rejected the value the form ships with,
 * using a message that offers UTC as a valid example. It also rejected every
 * IANA alias (Etc/GMT+5, US/Pacific). The DateTimeFormat constructor is the
 * authority that actually matters — it accepts UTC, aliases and offset zones,
 * and throws RangeError on anything Postgres would not accept either.
 */
function isValidIanaTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const IanaTimezoneInput = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(isValidIanaTimezone, {
    // Surfaced verbatim to the user by describeRejection() — keep it actionable:
    // the field is free text, so "invalid" alone gives no way to fix it.
    message: 'not a valid IANA time zone name (for example Europe/Warsaw or UTC)',
  });

const SiteSettingsInput = z
  .object({
    primary: z.boolean().optional(),
    operating_hours: z.string().trim().min(1).max(240).optional(),
    haccp_enabled: z.boolean().optional(),
    haccp_valid_until: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    timezone: IanaTimezoneInput.optional(),
    country: z.string().trim().max(120).nullable().optional(),
    legal_entity: z.string().trim().max(200).nullable().optional(),
  })
  .strict();

const LINE_STATUSES = ['draft', 'active', 'inactive'] as const;
const CREATE_LINE_STATUSES = LINE_STATUSES;

/**
 * Codes are uppercased on write. Without this a site could be created as `waw`
 * while `WAW` already existed: `sites_org_code_uq` is a plain unique index on
 * (org_id, site_code), so it compares case-SENSITIVELY and both rows were
 * accepted. Line codes were already uppercased downstream by `upsertLine`, so
 * this only tightens the site path (and makes the echoed code match the stored
 * one).
 * ponytail: normalises new writes only — rows already stored in mixed case stay
 * as they are. Backfilling would need collision handling, and the durable fix is
 * a unique index on (org_id, upper(site_code)); do that if legacy dupes appear.
 */
const CodeInput = z.string().trim().min(1).max(64).transform((value) => value.toUpperCase());
const NameInput = z.string().trim().min(1).max(200);

const CreateSiteSchema = z
  .object({
    site_code: CodeInput,
    name: NameInput,
    timezone: IanaTimezoneInput.optional(),
    country: z.string().trim().min(1).max(120).nullable().optional(),
    legal_entity: z.string().trim().min(1).max(200).nullable().optional(),
    is_default: z.boolean().optional(),
  })
  .strict();

const RenameSiteSchema = z.object({ id: UuidInput, name: NameInput }).strict();
const DeleteSiteSchema = z.object({ id: UuidInput }).strict();

const CreateLineSchema = z
  .object({
    site_id: UuidInput.optional(),
    siteId: UuidInput.nullish(),
    warehouseId: UuidInput.nullish(),
    defaultOutputLocationId: UuidInput.nullish(),
    code: CodeInput,
    name: NameInput,
    status: z.enum(CREATE_LINE_STATUSES).optional(),
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
/** Thrown inside the transaction so `withOrgContext` ROLLBACKs, then mapped back to `not_found`. */
const SITE_NOT_FOUND_SENTINEL = 'site_not_found';
const DUPLICATE_SITE_CODE_MESSAGE = 'That site code is already in use in this organisation. Choose a different one.';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const ACTIVE_WORK_ORDER_STATUSES = ['DRAFT', 'RELEASED', 'IN_PROGRESS', 'ON_HOLD'] as const;

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === PG_UNIQUE_VIOLATION;
}

/** Human labels for the schema paths a user can actually see in a modal. */
const FIELD_LABELS: Record<string, string> = {
  site_code: 'Site code',
  name: 'Name',
  timezone: 'Timezone',
  country: 'Country',
  legal_entity: 'Legal entity',
  operating_hours: 'Operating hours',
  haccp_valid_until: 'HACCP valid until',
  code: 'Code',
  status: 'Status',
};

/**
 * Turn a schema rejection into an actionable message plus the field that caused
 * it. A bare `'invalid_input'` used to be rendered as "This field is required."
 * — so a fully-filled form rejected on, say, a free-text timezone read as a
 * missing field and left the user with nothing to act on. A genuinely absent
 * value still says "is required"; anything else reports the real reason.
 */
function describeRejection(error: z.ZodError): { message: string; field?: string } {
  const issue = error.issues[0];
  if (!issue) return { message: 'Some of the submitted values were rejected. Check the form and try again.' };

  // `updateSiteSettings` validates its payload nested under `settings`; the user
  // sees plain field names, so drop that wrapper before labelling.
  const segments = issue.path.map(String);
  const path = (segments[0] === 'settings' ? segments.slice(1) : segments).join('.');
  const missing = issue.code === 'invalid_type' && (issue as { received?: string }).received === 'undefined';
  const reason = missing ? 'this field is required' : issue.message;
  const label = FIELD_LABELS[path];

  return {
    field: path || undefined,
    message: label ? `${label}: ${reason}.` : `${reason}.`,
  };
}

function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === PG_FOREIGN_KEY_VIOLATION;
}

function revalidateSitesRoute() {
  try {
    revalidateLocalized(SITES_ROUTE);
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
    timezone: row.timezone?.trim() || 'UTC',
    legal_entity: row.legal_entity,
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
            s.timezone,
            s.legal_entity,
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
      group by s.id, s.org_id, s.site_code, s.name, s.is_default, s.country, s.timezone, s.legal_entity, s.address, s.l3_ext_cols, s.is_active
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

export async function getLineFormOptions(): Promise<LineFormOptions> {
  return withOrgContext<LineFormOptions>(async (ctx): Promise<LineFormOptions> => {
    const context = ctx as OrgContextLike;
    const [sitesResult, warehousesResult, locationsResult] = await Promise.all([
      context.client.query<{ id: string; site_code: string; name: string; is_default: boolean }>(
        `select id::text, site_code, name, is_default
           from public.sites
          where org_id = app.current_org_id()
            and is_active = true
          order by is_default desc, lower(name), lower(site_code)`,
      ),
      context.client.query<{ id: string; name: string; site_id: string | null }>(
        `select id::text, name, site_id::text
           from public.warehouses
          where org_id = app.current_org_id()
          order by lower(name), id`,
      ),
      // Inactive locations are returned WITH the flag rather than filtered out:
      // the picker needs them to keep rendering a line's existing (since
      // deactivated) location, and the client-side "does the stored value still
      // exist in the option list?" reconciliation would otherwise null it out
      // and silently wipe the setting on the next save. The picker offers only
      // active ones; `upsertLine` re-validates server-side.
      context.client.query<{ id: string; code: string; name: string; warehouse_id: string | null; path: string | null; is_active: boolean }>(
        `select id::text, code, name, warehouse_id::text, path, is_active
           from public.locations
          where org_id = app.current_org_id()
          order by lower(code), lower(name), id`,
      ),
    ]);

    return {
      sites: sitesResult.rows.map((row) => ({ id: row.id, code: row.site_code, name: row.name, isDefault: row.is_default })),
      warehouses: warehousesResult.rows.map((row) => ({ id: row.id, name: row.name, siteId: row.site_id })),
      locations: locationsResult.rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        warehouseId: row.warehouse_id,
        path: row.path,
        isActive: row.is_active !== false,
      })),
    };
  });
}

export async function updateSiteSettings(
  orgId: string,
  siteId: string,
  settings: unknown,
): Promise<SiteSettingsMutationResult> {
  const parsed = z.object({ orgId: UuidInput, siteId: UuidInput, settings: SiteSettingsInput }).safeParse({ orgId, siteId, settings });
  if (!parsed.success) return { ok: false, error: 'invalid_input', ...describeRejection(parsed.error) };

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

      const input = parsed.data.settings;
      const { rows } = await context.client.query<SiteDbRow>(
        `update public.sites
            set is_default = coalesce($3::boolean, is_default),
                timezone = case when $7::boolean then $8::text else timezone end,
                country = case when $9::boolean then $10::text else country end,
                legal_entity = case when $11::boolean then $12::text else legal_entity end,
                l3_ext_cols = l3_ext_cols
                  || jsonb_strip_nulls(jsonb_build_object(
                       'operating_hours', $4::text,
                       'haccp_enabled', $5::boolean,
                       'haccp_valid_until', $6::text
                     )),
                updated_by = $13::uuid,
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
                    timezone,
                    legal_entity,
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
          input.primary ?? null,
          input.operating_hours ?? null,
          input.haccp_enabled ?? null,
          input.haccp_valid_until ?? null,
          input.timezone !== undefined,
          input.timezone ?? null,
          input.country !== undefined,
          input.country ?? null,
          input.legal_entity !== undefined,
          input.legal_entity ?? null,
          context.userId,
        ],
      );

      const row = rows[0];
      // MUST throw, not return — same partial-commit trap that was closed in
      // `createSite`. `withOrgContext` COMMITs on a normal return and ROLLBACKs
      // only on a throw, and the `primary` clear-down above has already run: a
      // plain `return` here commits an org whose default site was switched off
      // with nothing promoted in its place. The catch maps the sentinel back to
      // the `not_found` this action has always returned, so the contract is
      // unchanged — only the transaction outcome is.
      if (!row) throw new Error(SITE_NOT_FOUND_SENTINEL);
      revalidateSitesRoute();
      return { ok: true, data: toSiteRow(row) };
    });
  } catch (error) {
    if (error instanceof Error && error.message === SITE_NOT_FOUND_SENTINEL) {
      return { ok: false, error: 'not_found' };
    }
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
/**
 * Case-insensitive "is this site code already taken" probe, used ONLY on the
 * schema-rejection path of {@link createSite} so a duplicate is not masked by an
 * unrelated field error. `upper()` on both sides deliberately: `sites_org_code_uq`
 * is case-SENSITIVE, so a legacy lowercase `waw` would otherwise not be reported
 * as clashing with the uppercased `WAW` the user is about to submit.
 * Reads only sites in the caller's own org (RLS + `app.current_org_id()`), which
 * every member can already list through `readSitesSettingsData`. Never throws —
 * a failure here must not swallow the real rejection.
 */
async function siteCodeTaken(code: string): Promise<boolean> {
  try {
    return await withOrgContext<boolean>(async (ctx): Promise<boolean> => {
      const { rows } = await (ctx as OrgContextLike).client.query<{ taken: boolean }>(
        `select true as taken
           from public.sites
          where org_id = app.current_org_id()
            and upper(site_code) = upper($1)
          limit 1`,
        [code],
      );
      return rows.length > 0;
    });
  } catch {
    return false;
  }
}

export async function createSite(input: unknown): Promise<CreateSiteResult> {
  const parsed = CreateSiteSchema.safeParse(input);
  if (!parsed.success) {
    // A rejection ANYWHERE in the payload must not hide an already-taken site
    // code. The duplicate is only detected by the 23505 on INSERT, which never
    // runs when validation fails — so a form carrying both a duplicate code and,
    // say, the default 'UTC' time zone (rejected outright until the
    // `isValidIanaTimezone` fix above) reported only the time zone, and the user
    // fixed that just to be told on the next attempt that the code was taken.
    // The duplicate is the blocking reason, so it is reported first and the
    // schema rejection is reported only when the code itself is free.
    const code = CodeInput.safeParse((input as { site_code?: unknown } | null | undefined)?.site_code);
    if (code.success && (await siteCodeTaken(code.data))) {
      return { ok: false, error: 'duplicate_code', field: 'site_code', message: DUPLICATE_SITE_CODE_MESSAGE };
    }
    return { ok: false, error: 'invalid_input', ...describeRejection(parsed.error) };
  }
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
      // MUST throw, not return: `withOrgContext` COMMITs on a normal return and
      // only ROLLBACKs on a throw. Returning here would commit the is_default
      // clear-down above while no new site was inserted, leaving the org with no
      // default site at all. (The 23505 duplicate path already threw, so it was
      // always rolled back — this closes the one remaining non-throwing exit
      // after the first write.)
      if (!row) throw new Error('site_insert_returned_no_row');
      revalidateSitesRoute();
      return { ok: true, data: { id: row.id, code: row.site_code, name: row.name } };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: 'duplicate_code', field: 'site_code', message: DUPLICATE_SITE_CODE_MESSAGE };
    }
    console.error('[settings/sites] create_site_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function renameSite(input: unknown): Promise<RenameSiteResult> {
  const parsed = RenameSiteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input', ...describeRejection(parsed.error) };

  try {
    return await withOrgContext<RenameSiteResult>(async (ctx): Promise<RenameSiteResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasSettingsUpdatePermission(context))) return { ok: false, error: 'forbidden' };

      const { rows } = await context.client.query<{ id: string; name: string }>(
        `update public.sites
            set name = $2,
                updated_by = $3::uuid,
                updated_at = now()
          where org_id = app.current_org_id()
            and id = $1::uuid
        returning id::text, name`,
        [parsed.data.id, parsed.data.name, context.userId],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'not_found' };
      revalidateSitesRoute();
      return { ok: true, data: row };
    });
  } catch (error) {
    console.error('[settings/sites] rename_site_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function deleteSite(input: unknown): Promise<DeleteSiteResult> {
  const parsed = DeleteSiteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext<DeleteSiteResult>(async (ctx): Promise<DeleteSiteResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasSettingsUpdatePermission(context))) return { ok: false, error: 'forbidden' };

      const siteId = parsed.data.id;

      // All dependency guards run before the first write — returning ok:false here is safe
      // (withOrgContext commits only on a normal return after writes).
      const { rows: activeWoRows } = await context.client.query<{ active_count: number | string | null }>(
        `select count(*)::integer as active_count
           from public.work_orders wo
           join public.production_lines pl
             on pl.id = wo.production_line_id
            and pl.org_id = app.current_org_id()
          where wo.org_id = app.current_org_id()
            and pl.site_id = $1::uuid
            and wo.status::text = any($2::text[])`,
        [siteId, ACTIVE_WORK_ORDER_STATUSES],
      );
      if (numeric(activeWoRows[0]?.active_count ?? 0) > 0) {
        return {
          ok: false,
          error: 'has_dependents',
          message: 'This site has production lines with active work orders and cannot be deleted.',
        };
      }

      const { rows: warehouseDependents } = await context.client.query<{ blocked: boolean }>(
        `select exists (
           select 1
             from public.warehouses w
            where w.org_id = app.current_org_id()
              and w.site_id = $1::uuid
              and (
                exists (
                  select 1 from public.license_plates lp
                   where lp.org_id = app.current_org_id()
                     and lp.warehouse_id = w.id
                     and lp.quantity > 0::numeric
                     and lp.status in ('received', 'available', 'reserved', 'allocated', 'blocked', 'returned', 'quarantine')
                )
                or exists (
                  select 1 from public.license_plates lp
                   where lp.org_id = app.current_org_id()
                     and lp.warehouse_id = w.id
                     and lp.reserved_qty > 0::numeric
                )
                or exists (
                  select 1 from public.work_orders wo
                   where wo.org_id = app.current_org_id()
                     and wo.status::text = any($2::text[])
                     and exists (
                       select 1 from public.production_lines pl
                        where pl.org_id = app.current_org_id()
                          and pl.id = wo.production_line_id
                          and pl.warehouse_id = w.id
                     )
                )
                or exists (
                  select 1 from public.locations l
                   where l.org_id = app.current_org_id()
                     and l.warehouse_id = w.id
                )
              )
         ) as blocked`,
        [siteId, ACTIVE_WORK_ORDER_STATUSES],
      );
      if (warehouseDependents[0]?.blocked) {
        return {
          ok: false,
          error: 'has_dependents',
          message: 'This site has warehouses with dependent records and cannot be deleted.',
        };
      }

      // Cascade deletes — any failure after this point must throw so withOrgContext rolls back.
      await context.client.query(
        `delete from public.production_lines
          where org_id = app.current_org_id()
            and site_id = $1::uuid`,
        [siteId],
      );

      await context.client.query(
        `delete from public.warehouses
          where org_id = app.current_org_id()
            and site_id = $1::uuid`,
        [siteId],
      );

      const { rows } = await context.client.query<{ id: string }>(
        `delete from public.sites
          where org_id = app.current_org_id()
            and id = $1::uuid
        returning id::text`,
        [siteId],
      );
      const row = rows[0];
      if (!row) throw new Error('site_not_found_after_cascade');
      revalidateSitesRoute();
      return { ok: true, data: row };
    });
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      return {
        ok: false,
        error: 'has_dependents',
        message: 'This site still has dependent records and cannot be deleted.',
      };
    }
    if (error instanceof Error && error.message === 'site_not_found_after_cascade') {
      return { ok: false, error: 'not_found' };
    }
    console.error('[settings/sites] delete_site_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return { ok: false, error: 'persistence_failed' };
  }
}

/**
 * Translate an {@link upsertLine} failure into this screen's error shape. The
 * location failures carry their own message because no modal label describes
 * them — without one the modal would fall back to a generic "something went
 * wrong" for a precisely-known cause.
 */
function toLineMutationFailure(error: string): LineMutationResult {
  if (error === 'forbidden') return { ok: false, error: 'forbidden' };
  if (error === 'warehouse_site_mismatch') return { ok: false, error: 'warehouse_site_mismatch' };
  if (error === 'duplicate_code') return { ok: false, error: 'duplicate_code' };
  if (error === 'invalid_input') return { ok: false, error: 'invalid_input' };
  if (error === 'inactive_location_reference') {
    return {
      ok: false,
      error: 'inactive_location_reference',
      field: 'defaultOutputLocationId',
      message: 'That location is deactivated and cannot be set as a default output location. Pick an active location, or reactivate it first.',
    };
  }
  if (error === 'invalid_location_reference') {
    return {
      ok: false,
      error: 'invalid_location_reference',
      field: 'defaultOutputLocationId',
      message: 'The selected location does not belong to the selected warehouse.',
    };
  }
  if (error === 'location_requires_warehouse') {
    return {
      ok: false,
      error: 'location_requires_warehouse',
      field: 'warehouseId',
      message: 'Pick a warehouse for this line first — a default output location can only be validated against one.',
    };
  }
  return { ok: false, error: 'persistence_failed' };
}

/** Create a production line through the canonical settings/infra upsertLine action. */
export async function createLine(input: unknown): Promise<LineMutationResult> {
  const parsed = CreateLineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input', ...describeRejection(parsed.error) };
  const data = parsed.data;
  const siteId = data.siteId ?? data.site_id ?? null;
  if (!siteId) return { ok: false, error: 'invalid_input', field: 'site_id', message: 'Site: this field is required.' };

  const result = await upsertLine({
    siteId,
    warehouseId: data.warehouseId ?? null,
    defaultOutputLocationId: data.defaultOutputLocationId ?? null,
    code: data.code,
    name: data.name,
    status: data.status ?? 'draft',
  });

  if (result.ok) {
    revalidateSitesRoute();
    return { ok: true, data: { id: result.data.id, code: data.code, name: data.name, status: result.data.status } };
  }

  return toLineMutationFailure(result.error);
}

type ExistingLineForUpsert = {
  warehouse_id: string | null;
  default_location_id: string | null;
};

/**
 * Reads the line's current default location so {@link updateLine} (which has no
 * location field of its own) can carry it through the upsert unchanged. MUST
 * read the same column `upsertLine` writes — `default_location_id`. While this
 * read pointed at the dead `default_output_location_id`, every rename/status
 * edit from the sites screen silently wiped the line's default location.
 */
async function getExistingLineForUpsert(lineId: string): Promise<ExistingLineForUpsert | null> {
  return withOrgContext<ExistingLineForUpsert | null>(async (ctx): Promise<ExistingLineForUpsert | null> => {
    const context = ctx as OrgContextLike;
    const { rows } = await context.client.query<ExistingLineForUpsert>(
      `select pl.warehouse_id::text,
              pl.default_location_id::text
         from public.production_lines pl
        where pl.org_id = app.current_org_id()
          and pl.id = $1::uuid
        limit 1`,
      [lineId],
    );
    return rows[0] ?? null;
  });
}

/** Update a production line through the canonical settings/infra upsertLine action. */
export async function updateLine(input: unknown): Promise<LineMutationResult> {
  const parsed = UpdateLineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'invalid_input', ...describeRejection(parsed.error) };
  const data = parsed.data;

  const existing = await getExistingLineForUpsert(data.id);
  if (!existing) return { ok: false, error: 'not_found' };

  const result = await upsertLine({
    id: data.id,
    siteId: data.site_id,
    warehouseId: existing.warehouse_id,
    defaultOutputLocationId: existing.default_location_id,
    code: data.code,
    name: data.name,
    status: data.status ?? 'draft',
  });

  if (result.ok) {
    revalidateSitesRoute();
    return { ok: true, data: { id: result.data.id, code: data.code, name: data.name, status: result.data.status } };
  }

  return toLineMutationFailure(result.error);
}
