'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';
import { revalidatePath } from 'next/cache';

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

export type UpsertLocationResult =
  | { ok: true; data: { id: string; path: string; level: number } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'invalid_parent_location' | 'invalid_parent_level' | 'persistence_failed' };

const EDIT_PERMISSION = 'settings.infra.update';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
           (id, org_id, warehouse_id, parent_id, code, name, location_type, level, path)
         values (coalesce($1::uuid, gen_random_uuid()), app.current_org_id(), $2::uuid, $3::uuid, $4, $5, $6, $7::integer, $8)
         on conflict (id) do update set
           warehouse_id = excluded.warehouse_id,
           parent_id = excluded.parent_id,
           code = excluded.code,
           name = excluded.name,
           location_type = excluded.location_type,
           level = excluded.level,
           path = excluded.path
         returning id, warehouse_id, parent_id, code, name, location_type, level, path`,
        [input.id, input.warehouseId, input.parentId, input.code, input.name, input.locationType, input.level, path],
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

      revalidatePath('/en/settings/infra/locations');

      return { ok: true, data: { id: row.id, path: row.path, level: row.level } };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

function parseLocationInput(raw: unknown): ParsedLocationInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const input = raw as Record<string, unknown>;
  const id = optionalUuid(input.id);
  const warehouseId = requiredUuid(input.warehouseId);
  const parentId = input.parentId === null || input.parentId === undefined ? null : normalizeIdentifier(input.parentId);
  const code = normalizeCode(input.code);
  const name = normalizeText(input.name, 128);
  const locationType = normalizeCode(input.locationType);
  const active = typeof input.active === 'boolean' ? input.active : true;
  const barcode = input.barcode === null || input.barcode === undefined || input.barcode === '' ? null : normalizeText(input.barcode, 128);
  const level = Number(input.level);
  if (input.id !== undefined && id === null) return null;
  if (!warehouseId || (input.parentId !== null && input.parentId !== undefined && !parentId)) return null;
  if (input.barcode !== null && input.barcode !== undefined && input.barcode !== '' && !barcode) return null;
  if (!code || !name || !locationType || !Number.isInteger(level) || level < 1 || level > 4) return null;
  return { id, warehouseId, parentId, code, name, level, locationType, active, barcode };
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

function requiredUuid(value: unknown): string | null {
  return typeof value === 'string' && UUID_RE.test(value.trim()) ? value.trim() : null;
}

function optionalUuid(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  return requiredUuid(value);
}

function normalizeIdentifier(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : null;
}

function normalizeCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(trimmed) ? trimmed : null;
}

function normalizeText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}
