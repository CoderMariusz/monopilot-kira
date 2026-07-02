'use server';

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';

const SETTINGS_UPDATE_PERMISSION = 'settings.org.update';
const DEVICES_ROUTE = '/settings/devices';

type QueryResult<T> = { rows: T[]; rowCount?: number | null };
type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
};

type OrgContextLike = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

export type DeviceStatus = 'online' | 'offline' | 'low_battery';

export type DeviceRow = {
  id: string;
  name: string;
  model: string;
  site_id: string | null;
  /** Resolved site display name (joined from public.sites). Null when unassigned. */
  site_name: string | null;
  line_id: string | null;
  /**
   * Resolved production-line display name. `line_id` is a free-text line code; we
   * left-join public.production_lines on (org_id, code) to surface the human name.
   * Falls back to the raw `line_id` text when no matching line exists.
   */
  line_name: string | null;
  battery_level: number;
  last_seen_at: string | null;
  status: DeviceStatus;
  org_id: string;
};

export type DeviceDefaultsRow = {
  auto_lock_minutes: number;
  login_per_shift: boolean;
  offline_mode: boolean;
  org_id: string;
};

/**
 * Site option for the Pair-device modal selector. `id` is the site UUID (the
 * value written to `scanner_devices.site_id`); `name` is the human label.
 */
export type DeviceSiteOption = {
  id: string;
  name: string;
};

/**
 * Production-line option for the Pair-device modal selector. NOTE the value is
 * the line `code` (free text), NOT the line UUID — `scanner_devices.line_id`
 * stores the code, and the devices list resolves the display name via
 * `production_lines.code = scanner_devices.line_id`. `site_id` lets the modal
 * filter lines to the chosen site.
 */
export type DeviceLineOption = {
  code: string;
  name: string;
  site_id: string | null;
};

type DeviceDbRow = DeviceRow;
type DeviceDefaultsDbRow = DeviceDefaultsRow;

export type PairDeviceResult =
  | { ok: true; data: DeviceRow }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'persistence_failed' };

export type UpdateDeviceDefaultsResult =
  | { ok: true; data: DeviceDefaultsRow }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'persistence_failed' };

export type DevicesSettingsData = {
  org_id: string;
  devices: DeviceRow[];
  defaults: DeviceDefaultsRow;
  sites: DeviceSiteOption[];
  lines: DeviceLineOption[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UuidInput = z.string().trim().regex(UUID_RE);
const OptionalUuidInput = z.preprocess((value) => (value === '' ? null : value), UuidInput.nullish());
const OptionalLineIdInput = z.preprocess(
  (value) => (value === '' ? null : value),
  z.string().trim().min(1).max(128).nullish(),
);

const PairDeviceInput = z
  .object({
    name: z.string().trim().min(1).max(160),
    model: z.string().trim().min(1).max(120),
    site_id: OptionalUuidInput,
    line_id: OptionalLineIdInput,
  })
  .strict();

const DeviceDefaultsInput = z
  .object({
    auto_lock_minutes: z.number().int().min(1).max(240),
    login_per_shift: z.boolean(),
    offline_mode: z.boolean(),
  })
  .strict();

export type PairDeviceInput = z.input<typeof PairDeviceInput>;
export type UpdateDeviceDefaultsInput = z.input<typeof DeviceDefaultsInput>;

function revalidateDevicesRoute() {
  try {
    revalidateLocalized(DEVICES_ROUTE);
  } catch {
    /* no request store in unit tests */
  }
}

function toDeviceRow(row: DeviceDbRow): DeviceRow {
  return {
    ...row,
    last_seen_at: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
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

async function queryDevices(context: OrgContextLike, orgId: string): Promise<DeviceRow[]> {
  if (!UuidInput.safeParse(orgId).success) return [];
  if (context.orgId !== orgId) return [];

  const { rows } = await context.client.query<DeviceDbRow>(
    `select d.id::text,
            d.name,
            d.model,
            d.site_id::text as site_id,
            s.name as site_name,
            d.line_id,
            coalesce(pl.name, d.line_id) as line_name,
            d.battery_level,
            d.last_seen_at::text as last_seen_at,
            d.status,
            d.org_id::text as org_id
       from public.scanner_devices d
       left join public.sites s
         on s.id = d.site_id and s.org_id = d.org_id
       left join public.production_lines pl
         on pl.code = d.line_id and pl.org_id = d.org_id
      where d.org_id = $1::uuid
      order by d.status, d.name`,
    [orgId],
  );

  return rows.map(toDeviceRow);
}

async function queryDeviceDefaults(context: OrgContextLike, orgId: string): Promise<DeviceDefaultsRow> {
  const parsed = UuidInput.safeParse(orgId);
  if (!parsed.success) {
    return { auto_lock_minutes: 5, login_per_shift: true, offline_mode: true, org_id: orgId };
  }
  if (context.orgId !== parsed.data) {
    return { auto_lock_minutes: 5, login_per_shift: true, offline_mode: true, org_id: parsed.data };
  }

  const { rows } = await context.client.query<DeviceDefaultsDbRow>(
    `select auto_lock_minutes, login_per_shift, offline_mode, org_id::text as org_id
       from public.scanner_device_defaults
      where org_id = $1::uuid
      limit 1`,
    [parsed.data],
  );

  return rows[0] ?? { auto_lock_minutes: 5, login_per_shift: true, offline_mode: true, org_id: parsed.data };
}

/**
 * Active org sites for the Pair-device modal Site selector. Mirrors the
 * sites read used by the shifts settings screen (org-scoped RLS via
 * app.current_org_id()), so the pair modal can persist a real site_id.
 */
async function queryDeviceSites(context: OrgContextLike): Promise<DeviceSiteOption[]> {
  const { rows } = await context.client.query<DeviceSiteOption>(
    `select id::text, name
       from public.sites
      where org_id = app.current_org_id()
        and is_active = true
      order by is_default desc, lower(name), lower(site_code)`,
  );
  return rows;
}

/**
 * Active org production lines for the Pair-device modal Line selector. Selects
 * the line `code` (what `scanner_devices.line_id` stores) plus its `site_id`
 * so the modal can filter lines to the chosen site. Only status='active' lines
 * are offered for pairing.
 */
async function queryDeviceLines(context: OrgContextLike): Promise<DeviceLineOption[]> {
  const { rows } = await context.client.query<DeviceLineOption>(
    `select code, name, site_id::text as site_id
       from public.production_lines
      where org_id = app.current_org_id()
        and status = 'active'
      order by lower(name), lower(code)`,
  );
  return rows;
}

export async function getDevices(orgId: string): Promise<DeviceRow[]> {
  return withOrgContext<DeviceRow[]>(async (ctx): Promise<DeviceRow[]> => queryDevices(ctx as OrgContextLike, orgId));
}

export async function getDeviceDefaults(orgId: string): Promise<DeviceDefaultsRow> {
  return withOrgContext<DeviceDefaultsRow>(async (ctx): Promise<DeviceDefaultsRow> =>
    queryDeviceDefaults(ctx as OrgContextLike, orgId),
  );
}

export async function readDevicesSettingsData(): Promise<DevicesSettingsData> {
  return withOrgContext<DevicesSettingsData>(async (ctx): Promise<DevicesSettingsData> => {
    const context = ctx as OrgContextLike;
    const [devices, defaults, sites, lines] = await Promise.all([
      queryDevices(context, context.orgId),
      queryDeviceDefaults(context, context.orgId),
      queryDeviceSites(context),
      queryDeviceLines(context),
    ]);
    return { org_id: context.orgId, devices, defaults, sites, lines };
  });
}

export async function pairDevice(rawInput: unknown): Promise<PairDeviceResult> {
  const parsed = PairDeviceInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext<PairDeviceResult>(async (ctx): Promise<PairDeviceResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasSettingsUpdatePermission(context))) return { ok: false, error: 'forbidden' };

      const { rows } = await context.client.query<DeviceDbRow>(
        `with inserted as (
           insert into public.scanner_devices
             (org_id, name, model, site_id, line_id, battery_level, last_seen_at, status, created_by, updated_by)
           values ($1::uuid, $2, $3, $4::uuid, $5, 100, now(), 'online', $6::uuid, $6::uuid)
           returning id, org_id, name, model, site_id, line_id, battery_level, last_seen_at, status
         )
         select d.id::text,
                d.name,
                d.model,
                d.site_id::text as site_id,
                s.name as site_name,
                d.line_id,
                coalesce(pl.name, d.line_id) as line_name,
                d.battery_level,
                d.last_seen_at::text as last_seen_at,
                d.status,
                d.org_id::text as org_id
           from inserted d
           left join public.sites s
             on s.id = d.site_id and s.org_id = d.org_id
           left join public.production_lines pl
             on pl.code = d.line_id and pl.org_id = d.org_id`,
        [
          context.orgId,
          parsed.data.name,
          parsed.data.model,
          parsed.data.site_id ?? null,
          parsed.data.line_id ?? null,
          context.userId,
        ],
      );

      const row = rows[0];
      if (!row) return { ok: false, error: 'persistence_failed' };
      revalidateDevicesRoute();
      return { ok: true, data: toDeviceRow(row) };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function updateDeviceDefaults(rawInput: unknown): Promise<UpdateDeviceDefaultsResult> {
  const parsed = DeviceDefaultsInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext<UpdateDeviceDefaultsResult>(async (ctx): Promise<UpdateDeviceDefaultsResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasSettingsUpdatePermission(context))) return { ok: false, error: 'forbidden' };

      const { rows } = await context.client.query<DeviceDefaultsDbRow>(
        `insert into public.scanner_device_defaults
           (org_id, auto_lock_minutes, login_per_shift, offline_mode, updated_by)
         values ($1::uuid, $2::integer, $3::boolean, $4::boolean, $5::uuid)
         on conflict (org_id) do update set
           auto_lock_minutes = excluded.auto_lock_minutes,
           login_per_shift = excluded.login_per_shift,
           offline_mode = excluded.offline_mode,
           updated_by = excluded.updated_by,
           updated_at = now()
         returning auto_lock_minutes, login_per_shift, offline_mode, org_id::text as org_id`,
        [
          context.orgId,
          parsed.data.auto_lock_minutes,
          parsed.data.login_per_shift,
          parsed.data.offline_mode,
          context.userId,
        ],
      );

      const row = rows[0];
      if (!row) return { ok: false, error: 'persistence_failed' };
      revalidateDevicesRoute();
      return { ok: true, data: row };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}
