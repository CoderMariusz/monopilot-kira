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

type WarehouseRow = { id: string; code?: string; name?: string; address_label?: string | null; is_active?: boolean | null; deactivated_at?: string | null };
type CountRow = { active_count?: number | string | null; count?: number | string | null };

type ParsedDeactivateInput = {
  warehouseId: string;
  force: boolean;
};

type ParsedCreateInput = {
  code: string;
  name: string;
  address: string | null;
};

export type DeactivateWarehouseResult =
  | { ok: true; data: { warehouseId: string; isActive: boolean }; warning?: { code: 'ACTIVE_WO_REFERENCES'; activeWorkOrders: number } }
  | {
      ok: false;
      error: 'invalid_input' | 'forbidden' | 'not_found' | 'active_work_orders_reference_warehouse' | 'persistence_failed';
      warning?: { code: 'ACTIVE_WO_REFERENCES'; activeWorkOrders: number };
    };

export type CreateWarehouseResult =
  | { ok: true; data: { id: string; code: string; name: string; address: string | null; deactivated_at: null; active_wo_count: 0 } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'already_exists' | 'persistence_failed' };

const EDIT_PERMISSION = 'settings.infra.update';

export async function createWarehouse(rawInput: unknown): Promise<CreateWarehouseResult> {
  const input = parseCreateInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<CreateWarehouseResult> => {
      if (!(await hasPermission({ client, userId, orgId }, EDIT_PERMISSION))) return { ok: false, error: 'forbidden' };
      const { rows } = await client.query<WarehouseRow>(
        `insert into public.warehouses (org_id, code, name, warehouse_type, address)
         values (app.current_org_id(), $1, $2, 'storage', $3::jsonb)
         on conflict (org_id, code) do nothing
         returning id,
                   code,
                   name,
                   nullif(concat_ws(', ', address->>'line1'), '') as address_label,
                   null::text as deactivated_at`,
        [input.code, input.name, JSON.stringify(input.address ? { line1: input.address } : {})],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'already_exists' };
      return {
        ok: true,
        data: {
          id: row.id,
          code: row.code ?? input.code,
          name: row.name ?? input.name,
          address: row.address_label ?? input.address,
          deactivated_at: null,
          active_wo_count: 0,
        },
      };
    });
  } catch (error) {
    console.error('[settings/infra/warehouse:create] persistence_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function deactivateWarehouse(rawInput: unknown): Promise<DeactivateWarehouseResult> {
  const input = parseDeactivateInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<DeactivateWarehouseResult> => {
      if (!(await hasPermission({ client, userId, orgId }, EDIT_PERMISSION))) return { ok: false, error: 'forbidden' };

      const warehouse = await getWarehouse(client, input.warehouseId);
      if (!warehouse) return { ok: false, error: 'not_found' };

      const activeWorkOrders = await countActiveWorkOrders(client, input.warehouseId);
      const warning = activeWorkOrders > 0 ? { code: 'ACTIVE_WO_REFERENCES' as const, activeWorkOrders } : undefined;
      if (warning && !input.force) {
        return { ok: false, error: 'active_work_orders_reference_warehouse', warning };
      }

      const { rows } = await client.query<WarehouseRow>(
        `update public.warehouses
            set address = coalesce(address, '{}'::jsonb)
                          || jsonb_build_object('deactivated_at', now(), 'deactivated_by', $2::uuid)
          where org_id = app.current_org_id()
            and id = $1::uuid
        returning id, false as is_active`,
        [input.warehouseId, userId],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'not_found' };

      await writeOutbox(client, {
        orgId,
        eventType: 'settings.warehouse.deactivated',
        aggregateType: 'warehouse',
        aggregateId: row.id,
        payload: { warehouse_id: row.id, force: input.force, active_work_orders: activeWorkOrders, actor_user_id: userId },
      });

      return { ok: true, data: { warehouseId: row.id, isActive: false }, ...(warning ? { warning } : {}) };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}


function parseCreateInput(raw: unknown): ParsedCreateInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const input = raw as Record<string, unknown>;
  const code = normalizeCode(input.code);
  const name = normalizeText(input.name, 128);
  const address = optionalText(input.address, 256);
  if (!code || !name) return null;
  return { code, name, address };
}

function normalizeCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(trimmed) ? trimmed : null;
}

function normalizeText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}

function optionalText(value: unknown, max: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  return normalizeText(value, max);
}

function parseDeactivateInput(raw: unknown): ParsedDeactivateInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const input = raw as Record<string, unknown>;
  const warehouseId = requiredUuid(input.warehouseId);
  if (!warehouseId) return null;
  return { warehouseId, force: input.force === true };
}

async function getWarehouse(client: QueryClient, warehouseId: string): Promise<WarehouseRow | null> {
  const { rows } = await client.query<WarehouseRow>(
    `select id, true as is_active
       from public.warehouses
      where org_id = app.current_org_id()
        and id = $1::uuid
      limit 1`,
    [warehouseId],
  );
  return rows[0] ?? null;
}

async function countActiveWorkOrders(client: QueryClient, warehouseId: string): Promise<number> {
  const { rows } = await client.query<CountRow>(
    `select count(*)::integer as active_count
       from public.work_orders
      where org_id = app.current_org_id()
        and warehouse_id = $1::uuid
        and status in ('draft', 'released', 'in_progress', 'active')`,
    [warehouseId],
  );
  const value = rows[0]?.active_count ?? rows[0]?.count ?? 0;
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? count : 0;
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
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : null;
}
