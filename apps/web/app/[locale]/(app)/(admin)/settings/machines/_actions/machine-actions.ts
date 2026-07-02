'use server';

/**
 * Wave 8a / Lane K4 (C) — Machines CRUD data layer.
 *
 * public.machines already exists (migration 042-infra-master.sql: id, org_id,
 * code, name, machine_type, status, capacity_per_hour, specs jsonb, ...). This
 * is the org-scoped read + create/update layer following the company-profile
 * pattern (withOrgContext, zod parse inside the action, admin permission gate,
 * revalidatePath). RLS already enforces org_id = app.current_org_id().
 */
import { z } from 'zod';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';

const ADMIN_PERMISSION = 'settings.flags.edit' as const;
const MACHINES_ROUTE = '/settings/machines';

type QueryResult<T = Record<string, unknown>> = { rows: T[] };
type QueryClient = { query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> };
type OrgContextLike = { userId: string; orgId: string; client: QueryClient };

export type Machine = {
  id: string;
  code: string;
  name: string;
  machineType: string;
  status: string;
  capacityPerHour: number | null;
};

type MachineRow = {
  id: string;
  code: string;
  name: string;
  machine_type: string;
  status: string;
  capacity_per_hour: string | number | null;
};

export type ListMachinesResult =
  | { state: 'ready'; machines: Machine[]; canEdit: boolean }
  | { state: 'error'; machines: []; canEdit: false };

const upsertSchema = z
  .object({
    id: z.string().uuid().nullable().optional().default(null),
    code: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(200),
    machineType: z.string().trim().min(1).max(80),
    status: z.enum(['active', 'inactive', 'maintenance', 'retired']),
    capacityPerHour: z.number().min(0).nullable().optional().default(null),
  })
  .strict();

export type UpsertMachineInput = z.input<typeof upsertSchema>;

export type UpsertMachineResult =
  | { ok: true; machine: Machine }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'duplicate_code' | 'not_found' | 'persistence_failed' };

async function hasAdminPermission({ client, userId, orgId }: OrgContextLike): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or r.code in ('owner', 'admin')
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [userId, orgId, ADMIN_PERMISSION],
  );
  return rows.length > 0;
}

function toMachine(row: MachineRow): Machine {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    machineType: row.machine_type,
    status: row.status,
    capacityPerHour: row.capacity_per_hour == null ? null : Number(row.capacity_per_hour),
  };
}

export async function listMachines(): Promise<ListMachinesResult> {
  try {
    return await withOrgContext<ListMachinesResult>(async (ctx): Promise<ListMachinesResult> => {
      const context = ctx as OrgContextLike;
      const canEdit = await hasAdminPermission(context);
      const { rows } = await context.client.query<MachineRow>(
        `select id, code, name, machine_type, status, capacity_per_hour
           from public.machines
          where org_id = $1::uuid
          order by code asc`,
        [context.orgId],
      );
      return { state: 'ready', machines: rows.map(toMachine), canEdit };
    });
  } catch (error) {
    console.error(
      '[settings/machines] load_failed',
      error instanceof Error ? { message: error.message } : { message: String(error) },
    );
    return { state: 'error', machines: [], canEdit: false };
  }
}

export async function upsertMachine(rawInput: UpsertMachineInput): Promise<UpsertMachineResult> {
  const parsed = upsertSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input' };
  }
  const input = parsed.data;

  try {
    return await withOrgContext<UpsertMachineResult>(async (ctx): Promise<UpsertMachineResult> => {
      const context = ctx as OrgContextLike;
      if (!(await hasAdminPermission(context))) {
        return { ok: false, error: 'forbidden' };
      }

      try {
        if (input.id) {
          const { rows } = await context.client.query<MachineRow>(
            `update public.machines
                set code = $3, name = $4, machine_type = $5, status = $6, capacity_per_hour = $7
              where id = $1::uuid and org_id = $2::uuid
              returning id, code, name, machine_type, status, capacity_per_hour`,
            [
              input.id,
              context.orgId,
              input.code,
              input.name,
              input.machineType,
              input.status,
              input.capacityPerHour,
            ],
          );
          const row = rows[0];
          if (!row) return { ok: false, error: 'not_found' };
          revalidateMachinesRoute();
          return { ok: true, machine: toMachine(row) };
        }

        const { rows } = await context.client.query<MachineRow>(
          `insert into public.machines (org_id, code, name, machine_type, status, capacity_per_hour)
           values ($1::uuid, $2, $3, $4, $5, $6)
           returning id, code, name, machine_type, status, capacity_per_hour`,
          [context.orgId, input.code, input.name, input.machineType, input.status, input.capacityPerHour],
        );
        const row = rows[0];
        if (!row) return { ok: false, error: 'persistence_failed' };
        revalidateMachinesRoute();
        return { ok: true, machine: toMachine(row) };
      } catch (err) {
        // unique (org_id, code) violation
        if (err instanceof Error && /duplicate key|unique/i.test(err.message)) {
          return { ok: false, error: 'duplicate_code' };
        }
        throw err;
      }
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

function revalidateMachinesRoute() {
  try {
    revalidateLocalized(MACHINES_ROUTE);
  } catch {
    /* no request store (test context) */
  }
}
