'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

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
  line_id: string | null;
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
    revalidatePath(DEVICES_ROUTE);
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
    `select id::text,
            name,
            model,
            site_id::text as site_id,
            line_id,
            battery_level,
            last_seen_at::text as last_seen_at,
            status,
            org_id::text as org_id
       from public.scanner_devices
      where org_id = $1::uuid
      order by status, name`,
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
    const [devices, defaults] = await Promise.all([
      queryDevices(context, context.orgId),
      queryDeviceDefaults(context, context.orgId),
    ]);
    return { org_id: context.orgId, devices, defaults };
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
        `insert into public.scanner_devices
           (org_id, name, model, site_id, line_id, battery_level, last_seen_at, status, created_by, updated_by)
         values ($1::uuid, $2, $3, $4::uuid, $5, 100, now(), 'online', $6::uuid, $6::uuid)
         returning id::text,
                   name,
                   model,
                   site_id::text as site_id,
                   line_id,
                   battery_level,
                   last_seen_at::text as last_seen_at,
                   status,
                   org_id::text as org_id`,
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
