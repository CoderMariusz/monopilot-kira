'use server';

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
type LineRow = { id: string; code: string; name: string; status: LineStatus };
type MachineRow = { id: string; status: string };

type ParsedLineInput = {
  id: string | null;
  code: string;
  name: string;
  status: LineStatus;
  machineIds: string[];
};

export type UpsertLineResult =
  | { ok: true; data: { id: string; status: LineStatus } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'line_requires_machine' | 'invalid_machine_reference' | 'persistence_failed' };

const EDIT_PERMISSION = 'settings.infra.update';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

      const { rows } = await client.query<LineRow>(
        `insert into public.production_lines
           (id, org_id, code, name, status)
         values (coalesce($1::uuid, gen_random_uuid()), app.current_org_id(), $2, $3, $4)
         on conflict (id) do update set
           code = excluded.code,
           name = excluded.name,
           status = excluded.status
         returning id, code, name, status, $5::uuid[] as machine_ids`,
        [input.id, input.code, input.name, input.status, input.machineIds],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'persistence_failed' };

      await writeOutbox(client, {
        orgId,
        eventType: 'settings.line.upserted',
        aggregateType: 'production_line',
        aggregateId: row.id,
        payload: { line_id: row.id, status: row.status, machine_ids: input.machineIds, actor_user_id: userId },
      });

      return { ok: true, data: { id: row.id, status: row.status } };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

function parseLineInput(raw: unknown): ParsedLineInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const input = raw as Record<string, unknown>;
  const id = optionalUuid(input.id);
  const code = normalizeCode(input.code);
  const name = normalizeText(input.name, 128);
  const status = input.status === 'active' || input.status === 'draft' ? input.status : null;
  const machineIds = Array.isArray(input.machineIds) ? input.machineIds.map(requiredUuid) : null;
  if (input.id !== undefined && id === null) return null;
  if (!code || !name || !status || !machineIds || machineIds.some((machineId) => !machineId)) return null;
  return { id, code, name, status, machineIds: Array.from(new Set(machineIds as string[])) };
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
