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

type WarehouseRow = { id: string; is_active?: boolean | null; deactivated_at?: string | null };
type CountRow = { active_count?: number | string | null; count?: number | string | null };

type ParsedDeactivateInput = {
  warehouseId: string;
  force: boolean;
};

export type DeactivateWarehouseResult =
  | { ok: true; data: { warehouseId: string; isActive: boolean }; warning?: { code: 'ACTIVE_WO_REFERENCES'; activeWorkOrders: number } }
  | {
      ok: false;
      error: 'invalid_input' | 'forbidden' | 'not_found' | 'active_work_orders_reference_warehouse' | 'persistence_failed';
      warning?: { code: 'ACTIVE_WO_REFERENCES'; activeWorkOrders: number };
    };

const EDIT_PERMISSION = 'settings.infrastructure.edit';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  return typeof value === 'string' && UUID_RE.test(value.trim()) ? value.trim() : null;
}
