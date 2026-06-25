'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { withOrgContext } from '../../lib/auth/with-org-context';

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type LineStatus = 'draft' | 'active';
type LineRow = { id: string; code: string; name: string; status: LineStatus; default_output_location_id: string | null };
type MachineRow = { id: string; status: string };
type WarehouseRow = { id: string };
type LocationWarehouseRow = { warehouse_id: string | null };

type ParsedLineInput = {
  id: string | null;
  siteId: string | null;
  warehouseId: string | null;
  defaultOutputLocationId: string | null;
  code: string;
  name: string;
  status: LineStatus;
  machineIds: string[];
};

export type UpsertLineResult =
  | { ok: true; data: { id: string; status: LineStatus } }
  | {
      ok: false;
      error:
        | 'invalid_input'
        | 'forbidden'
        | 'line_requires_machine'
        | 'invalid_machine_reference'
        | 'invalid_warehouse_reference'
        | 'invalid_location_reference'
        | 'persistence_failed';
    };

const EDIT_PERMISSION = 'settings.infra.update';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UuidInput = z.string().trim().regex(UUID_RE);
const LineInput = z.object({
  id: z.preprocess((value) => (value === '' ? null : value), UuidInput.nullish()),
  siteId: z.preprocess((value) => (value === '' ? null : value), UuidInput.nullish()),
  warehouseId: z.preprocess((value) => (value === '' ? null : value), UuidInput.nullish()),
  defaultOutputLocationId: z.preprocess((value) => (value === '' ? null : value), UuidInput.nullish()),
  code: z.string().trim().min(1).max(64).transform((value) => value.toUpperCase()).pipe(z.string().regex(/^[A-Z0-9][A-Z0-9_-]{0,63}$/)),
  name: z.string().trim().min(1).max(128),
  status: z.enum(['draft', 'active']),
  machineIds: z.array(UuidInput).transform((ids) => Array.from(new Set(ids))),
});

export async function upsertLine(rawInput: unknown): Promise<UpsertLineResult> {
  const input = parseLineInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };
  if (input.status === 'active' && input.machineIds.length < 1) return { ok: false, error: 'line_requires_machine' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<UpsertLineResult> => {
      if (!(await hasPermission({ client, userId, orgId }, EDIT_PERMISSION))) return { ok: false, error: 'forbidden' };

      if (input.machineIds.length > 0) {
        const machines = await getMachines(client, input.machineIds);
        if (machines.length !== new Set(input.machineIds).size) return { ok: false, error: 'invalid_machine_reference' };
      }
      if (input.warehouseId) {
        const warehouse = await getWarehouse(client, input.warehouseId);
        if (!warehouse) return { ok: false, error: 'invalid_warehouse_reference' };
      }
      if (input.defaultOutputLocationId && input.warehouseId) {
        const location = await getLocationWarehouse(client, input.defaultOutputLocationId);
        if (!location || location.warehouse_id !== input.warehouseId) return { ok: false, error: 'invalid_location_reference' };
      }

      const { rows } = await client.query<LineRow>(
        `insert into public.production_lines
           (id, org_id, site_id, warehouse_id, default_output_location_id, code, name, status)
         values (coalesce($1::uuid, gen_random_uuid()), app.current_org_id(), $2::uuid, $3::uuid, $4::uuid, $5, $6, $7)
         on conflict (id) do update set
           site_id = excluded.site_id,
           warehouse_id = excluded.warehouse_id,
           default_output_location_id = excluded.default_output_location_id,
           code = excluded.code,
           name = excluded.name,
           status = excluded.status
         returning id, code, name, status, default_output_location_id, $8::uuid[] as machine_ids`,
        [input.id, input.siteId, input.warehouseId, input.defaultOutputLocationId, input.code, input.name, input.status, input.machineIds],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'persistence_failed' };

      await client.query(
        `delete from public.line_machines
          where line_id = $1::uuid`,
        [row.id],
      );
      for (const [index, machineId] of input.machineIds.entries()) {
        await client.query(
          `insert into public.line_machines
             (line_id, machine_id, sequence)
           values ($1::uuid, $2::uuid, $3::integer)`,
          [row.id, machineId, index + 1],
        );
      }

      await writeOutbox(client, {
        orgId,
        eventType: 'settings.line.upserted',
        aggregateType: 'production_line',
        aggregateId: row.id,
        payload: {
          line_id: row.id,
          status: row.status,
          warehouse_id: input.warehouseId,
          default_output_location_id: input.defaultOutputLocationId,
          machine_ids: input.machineIds,
          actor_user_id: userId,
        },
      });

      revalidateLinesPath();

      return { ok: true, data: { id: row.id, status: row.status } };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

function parseLineInput(raw: unknown): ParsedLineInput | null {
  const parsed = LineInput.safeParse(raw);
  if (!parsed.success) return null;
  return {
    id: parsed.data.id ?? null,
    siteId: parsed.data.siteId ?? null,
    warehouseId: parsed.data.warehouseId ?? null,
    defaultOutputLocationId: parsed.data.defaultOutputLocationId ?? null,
    code: parsed.data.code,
    name: parsed.data.name,
    status: parsed.data.status,
    machineIds: parsed.data.machineIds,
  };
}

async function getMachines(client: QueryClient, machineIds: string[]): Promise<MachineRow[]> {
  const { rows } = await client.query<MachineRow>(
    `select id, status
       from public.machines
      where org_id = app.current_org_id()
        and id = any($1::uuid[])`,
    [machineIds],
  );
  return rows;
}

async function getWarehouse(client: QueryClient, warehouseId: string): Promise<WarehouseRow | null> {
  const { rows } = await client.query<WarehouseRow>(
    `select id
       from public.warehouses
      where org_id = app.current_org_id()
        and id = $1::uuid
      limit 1`,
    [warehouseId],
  );
  return rows[0] ?? null;
}

async function getLocationWarehouse(client: QueryClient, locationId: string): Promise<LocationWarehouseRow | null> {
  const { rows } = await client.query<LocationWarehouseRow>(
    `select warehouse_id
       from public.locations
      where id = $1::uuid
        and org_id = (select app.current_org_id())
      limit 1`,
    [locationId],
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

function revalidateLinesPath(): void {
  try {
    revalidatePath('/[locale]/settings/infra/lines', 'page');
  } catch (e) {
    console.warn('revalidateLinesPath failed', e);
  }
}
