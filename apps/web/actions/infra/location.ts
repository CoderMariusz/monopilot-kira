'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type LocationRow = {
  id: string;
  warehouse_id: string;
  parent_id: string | null;
  code: string;
  name?: string;
  location_type?: string;
  level: number;
  path: string;
  barcode?: string | null;
  is_active?: boolean;
};

type ParsedLocationInput = {
  id: string | null;
  warehouseId: string;
  parentId: string | null;
  code: string;
  name: string;
  level: number;
  locationType: string;
  active: boolean;
  barcode: string | null;
};

type ParsedDeleteLocationInput = {
  locationId: string;
  warehouseId: string;
};

export type UpsertLocationResult =
  | { ok: true; data: { id: string; path: string; level: number } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'invalid_parent_location' | 'invalid_parent_level' | 'persistence_failed' };

export type DeleteLocationResult =
  | { ok: true; data: { locationId: string; warehouseId: string } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'has_child_locations' | 'persistence_failed' };

const EDIT_PERMISSION = 'settings.infra.update';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuidSchema = z.string().trim().regex(UUID_RE);
const locationCodeSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{0,63}$/);
const locationTextSchema = (max: number) => z.string().trim().min(1).max(max);
const optionalUuidSchema = z.preprocess((value) => (value === undefined || value === null || value === '' ? null : value), uuidSchema.nullable());
const optionalTextSchema = (max: number) => z.preprocess((value) => (value === undefined || value === null || value === '' ? null : value), locationTextSchema(max).nullable());

const locationInputSchema = z.object({
  id: optionalUuidSchema,
  warehouseId: uuidSchema,
  parentId: optionalUuidSchema,
  code: locationCodeSchema,
  name: locationTextSchema(128),
  level: z.coerce.number().int().min(1).max(4),
  locationType: locationCodeSchema,
  active: z.boolean().default(true),
  barcode: optionalTextSchema(128),
});

const deleteLocationInputSchema = z.object({
  locationId: uuidSchema,
  warehouseId: uuidSchema,
});

export async function upsertLocation(rawInput: unknown): Promise<UpsertLocationResult> {
  const input = parseLocationInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<UpsertLocationResult> => {
      if (!(await hasPermission({ client, userId, orgId }, EDIT_PERMISSION))) return { ok: false, error: 'forbidden' };

      let parent: LocationRow | null = null;
      if (input.parentId) {
        parent = await getLocation(client, input.parentId);
        if (!parent || parent.warehouse_id !== input.warehouseId) return { ok: false, error: 'invalid_parent_location' };
        if (input.level !== parent.level + 1) return { ok: false, error: 'invalid_parent_level' };
      } else if (input.level !== 1) {
        return { ok: false, error: 'invalid_parent_level' };
      }

      const path = parent ? `${parent.path}.${input.code}` : input.code;
      const { rows } = await client.query<LocationRow>(
        `insert into public.locations
           (id, org_id, warehouse_id, parent_id, code, name, location_type, level, path, barcode, is_active)
         values (coalesce($1::uuid, gen_random_uuid()), app.current_org_id(), $2::uuid, $3::uuid, $4, $5, $6, $7::integer, $8, $9, $10::boolean)
         on conflict (id) do update set
           warehouse_id = excluded.warehouse_id,
           parent_id = excluded.parent_id,
           code = excluded.code,
           name = excluded.name,
           location_type = excluded.location_type,
           level = excluded.level,
           path = excluded.path,
           barcode = excluded.barcode,
           is_active = excluded.is_active
         returning id, warehouse_id, parent_id, code, name, location_type, level, path, barcode, is_active`,
        [input.id, input.warehouseId, input.parentId, input.code, input.name, input.locationType, input.level, path, input.barcode, input.active],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'persistence_failed' };

      await writeOutbox(client, {
        orgId,
        eventType: 'settings.location.upserted',
        aggregateType: 'location',
        aggregateId: row.id,
        payload: { location_id: row.id, warehouse_id: input.warehouseId, path: row.path, level: row.level, active: input.active, barcode: input.barcode, actor_user_id: userId },
      });

      revalidateLocationsPath();

      return { ok: true, data: { id: row.id, path: row.path, level: row.level } };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function deleteLocation(rawInput: unknown): Promise<DeleteLocationResult> {
  const input = parseDeleteLocationInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<DeleteLocationResult> => {
      if (!(await hasPermission({ client, userId, orgId }, EDIT_PERMISSION))) return { ok: false, error: 'forbidden' };

      const location = await getLocation(client, input.locationId);
      if (!location || location.warehouse_id !== input.warehouseId) return { ok: false, error: 'not_found' };

      const { rows: childRows } = await client.query<{ child_count: number | string }>(
        `select count(*)::integer as child_count
           from public.locations
          where org_id = app.current_org_id()
            and parent_id = $1::uuid`,
        [input.locationId],
      );
      if (Number(childRows[0]?.child_count ?? 0) > 0) return { ok: false, error: 'has_child_locations' };

      const { rows } = await client.query<LocationRow>(
        `delete from public.locations
          where org_id = app.current_org_id()
            and warehouse_id = $2::uuid
            and id = $1::uuid
        returning id, warehouse_id, parent_id, code, name, location_type, level, path`,
        [input.locationId, input.warehouseId],
      );
      const deleted = rows[0];
      if (!deleted) return { ok: false, error: 'not_found' };

      await writeOutbox(client, {
        orgId,
        eventType: 'settings.location.deleted',
        aggregateType: 'location',
        aggregateId: deleted.id,
        payload: { location_id: deleted.id, warehouse_id: deleted.warehouse_id, path: deleted.path, actor_user_id: userId },
      });

      revalidateLocationsPath();

      return { ok: true, data: { locationId: deleted.id, warehouseId: deleted.warehouse_id } };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

// Locale-aware revalidation. The page lives at app/[locale]/.../settings/infra/locations
// — route groups (app)/(admin) are not URL segments. The server action has no locale
// in scope, so we revalidate the dynamic [locale] segment with the 'page' type, which
// covers every locale variant (en/pl/ro/uk) instead of the old hardcoded /en/ path.
function revalidateLocationsPath(): void {
  try {
    revalidatePath('/[locale]/settings/infra/locations', 'page');
  } catch (error) {
    console.warn('[settings/infra/locations] revalidate_skipped', error instanceof Error ? { message: error.message } : { message: String(error) });
  }
}

function parseLocationInput(raw: unknown): ParsedLocationInput | null {
  const parsed = locationInputSchema.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data;
}

function parseDeleteLocationInput(raw: unknown): ParsedDeleteLocationInput | null {
  const parsed = deleteLocationInputSchema.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data;
}

async function getLocation(client: QueryClient, id: string): Promise<LocationRow | null> {
  const { rows } = await client.query<LocationRow>(
    `select id, warehouse_id, parent_id, code, name, location_type, level, path
       from public.locations
      where org_id = app.current_org_id()
        and id::text = $1
      limit 1`,
    [id],
  );
  return rows[0] ?? null;
}

async function hasPermission(ctx: OrgActionContext, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or r.permissions ? $3 or r.code = any($4::text[]) or r.slug = any($4::text[]))
      limit 1`,
    [ctx.userId, ctx.orgId, permission, ['owner', 'admin', 'module_admin']],
  );
  return rows.length > 0;
}

async function writeOutbox(
  client: QueryClient,
  params: { orgId: string; eventType: string; aggregateType: string; aggregateId: string; payload: unknown },
): Promise<void> {
  await client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values ($1::uuid, $2, $3, $4::uuid, $5::jsonb, 'settings-infra-v1')`,
    [params.orgId, params.eventType, params.aggregateType, params.aggregateId, JSON.stringify(params.payload)],
  );
}
