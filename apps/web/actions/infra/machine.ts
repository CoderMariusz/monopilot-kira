'use server';

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

type LocationRow = { id: string; warehouse_id: string; level: number; path: string };
type MachineRow = { id: string; code: string; name: string; machine_type: string; status: string; location_id: string | null };

type MachineStatus = 'active' | 'inactive' | 'maintenance' | 'retired';

type ParsedMachineInput = {
  id: string | null;
  code: string;
  name: string;
  machineType: string;
  status: MachineStatus;
  locationId: string | null;
};

export type UpsertMachineResult =
  | { ok: true; data: { id: string; locationId: string | null; status: string } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'invalid_location' | 'location_must_be_bin_level' | 'persistence_failed' };

const EDIT_PERMISSION = 'settings.infra.update';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UuidInput = z.string().trim().regex(UUID_RE);
const MachineCodeInput = z.string().trim().min(1).max(64).transform((value) => value.toLowerCase()).pipe(z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/));
const MachineInput = z.object({
  id: z.preprocess((value) => (value === '' ? null : value), UuidInput.nullish()),
  code: MachineCodeInput,
  name: z.string().trim().min(1).max(128),
  machineType: MachineCodeInput,
  // Optional status — the infra / line-wizard create dialog has no status field,
  // so this defaults to 'active' (preserving the previous hardcoded behaviour),
  // but it now accepts the same status enum as the settings/machines path so the
  // two create paths agree when a caller does supply an explicit status.
  status: z.enum(['active', 'inactive', 'maintenance', 'retired']).optional().default('active'),
  // Optional: a fresh org has zero locations, so a machine can be created
  // unplaced (machines.location_id is nullable). V-SET-61 bin-level check
  // still applies when a location IS provided.
  locationId: z.preprocess((value) => (value === '' ? null : value), UuidInput.nullish()),
});

export async function upsertMachine(rawInput: unknown): Promise<UpsertMachineResult> {
  const input = parseMachineInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<UpsertMachineResult> => {
      if (!(await hasPermission({ client, userId, orgId }, EDIT_PERMISSION))) return { ok: false, error: 'forbidden' };

      // V-SET-61 only applies when a location is provided. An unplaced machine
      // (null location_id) is allowed so fresh orgs can build infra bottom-up.
      if (input.locationId) {
        const location = await getLocation(client, input.locationId);
        if (!location) return { ok: false, error: 'invalid_location' };
        if (location.level !== 4) return { ok: false, error: 'location_must_be_bin_level' };
      }

      const { rows } = await client.query<MachineRow>(
        `insert into public.machines
           (id, org_id, code, name, machine_type, status, location_id)
         values (coalesce($1::uuid, gen_random_uuid()), app.current_org_id(), $2, $3, $4, $6, $5::uuid)
         on conflict (id) do update set
           code = excluded.code,
           name = excluded.name,
           machine_type = excluded.machine_type,
           location_id = excluded.location_id
         returning id, code, name, machine_type, status, location_id`,
        [input.id, input.code, input.name, input.machineType, input.locationId, input.status],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'persistence_failed' };

      await writeOutbox(client, {
        orgId,
        eventType: 'settings.machine.upserted',
        aggregateType: 'machine',
        aggregateId: row.id,
        payload: { machine_id: row.id, location_id: row.location_id, actor_user_id: userId },
      });

      return { ok: true, data: { id: row.id, locationId: row.location_id, status: row.status } };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

function parseMachineInput(raw: unknown): ParsedMachineInput | null {
  const parsed = MachineInput.safeParse(raw);
  if (!parsed.success) return null;
  return {
    id: parsed.data.id ?? null,
    code: parsed.data.code,
    name: parsed.data.name,
    machineType: parsed.data.machineType,
    status: parsed.data.status,
    locationId: parsed.data.locationId ?? null,
  };
}

async function getLocation(client: QueryClient, id: string): Promise<LocationRow | null> {
  const { rows } = await client.query<LocationRow>(
    `select id, warehouse_id, level, path
       from public.locations
      where org_id = app.current_org_id()
        and id = $1::uuid
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
