'use server';

import { z } from 'zod';

import { writeSettingsInfraOutbox } from './_shared/outbox';
import { hasPermission } from '../../lib/auth/has-permission';
import { withOrgContext } from '../../lib/auth/with-org-context';

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type WarehouseRow = { id: string; code?: string; name?: string; site_id?: string | null; address_label?: string | null; is_active?: boolean | null; deactivated_at?: string | null };
type WarehouseDependencyRow = {
  on_hand_stock: number | string | null;
  open_work_orders: number | string | null;
  reservations: number | string | null;
  locations: number | string | null;
  production_lines: number | string | null;
};

export type WarehouseDependents = {
  onHandStock: number;
  openWorkOrders: number;
  reservations: number;
  locations: number;
  productionLines: number;
};

type ParsedCreateInput = {
  code: string;
  name: string;
  site_id: string;
  address: string | null;
};

export type DeactivateWarehouseResult =
  | { ok: true; data: { warehouseId: string; isActive: boolean } }
  | {
      ok: false;
      error: 'invalid_input' | 'forbidden' | 'not_found' | 'has_dependents' | 'persistence_failed';
      message?: string;
      dependents?: WarehouseDependents;
    };

export type RenameWarehouseResult =
  | { ok: true; data: { id: string; name: string } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'persistence_failed' };

export type DeleteWarehouseResult =
  | { ok: true; data: { warehouseId: string } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'has_dependents' | 'persistence_failed'; message?: string; dependents?: WarehouseDependents };

export type CreateWarehouseResult =
  | { ok: true; data: { id: string; code: string; name: string; site_id: string; address: string | null; deactivated_at: null; active_wo_count: 0 } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'already_exists' | 'persistence_failed' };

export type BinAssignmentStrategy = 'FEFO' | 'FIFO' | 'LIFO' | 'Manual';

export type WarehouseStorageRules = {
  binAssignmentStrategy: BinAssignmentStrategy;
  mixedLotBins: boolean;
  expiryWarningDays: number;
  blockExpiredStock: boolean;
};

export type UpdateWarehouseStorageRulesInput = {
  warehouseId: string;
} & Partial<WarehouseStorageRules>;

export type UpdateWarehouseStorageRulesResult =
  | { ok: true; data: { warehouseId: string } & WarehouseStorageRules }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'persistence_failed' };

const EDIT_PERMISSION = 'settings.infra.update';

const BIN_ASSIGNMENT_STRATEGIES: readonly BinAssignmentStrategy[] = ['FEFO', 'FIFO', 'LIFO', 'Manual'];

const createWarehouseInputSchema = z.object({
  code: z
    .string()
    .transform((value) => value.trim().toUpperCase())
    .refine((value) => /^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(value)),
  name: z.string().trim().min(1).max(128),
  site_id: z.string().uuid(),
  address: z
    .union([z.string().trim().min(1).max(256), z.literal(''), z.null(), z.undefined()])
    .transform((value) => (typeof value === 'string' && value.trim().length > 0 ? value.trim() : null)),
});

const warehouseIdSchema = z.object({ warehouseId: z.string().uuid() });
const renameWarehouseSchema = warehouseIdSchema.extend({ name: z.string().trim().min(1).max(128) });

export async function createWarehouse(rawInput: unknown): Promise<CreateWarehouseResult> {
  const input = parseCreateInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<CreateWarehouseResult> => {
      if (!(await hasPermission({ client, userId, orgId }, EDIT_PERMISSION))) return { ok: false, error: 'forbidden' };
      const { rows } = await client.query<WarehouseRow>(
        `insert into public.warehouses (org_id, site_id, code, name, warehouse_type, address)
         values (app.current_org_id(), $1::uuid, $2, $3, 'storage', $4::jsonb)
         on conflict (org_id, code) do nothing
         returning id,
                   code,
                   name,
                   site_id::text as site_id,
                   nullif(concat_ws(', ', address->>'line1'), '') as address_label,
                   null::text as deactivated_at`,
        [input.site_id, input.code, input.name, JSON.stringify(input.address ? { line1: input.address } : {})],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'already_exists' };
      return {
        ok: true,
        data: {
          id: row.id,
          code: row.code ?? input.code,
          name: row.name ?? input.name,
          site_id: input.site_id,
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

      const dependents = await getWarehouseDependents(client, input.warehouseId);
      if (hasActiveDependents(dependents)) {
        return { ok: false, error: 'has_dependents', message: activeDependentsMessage(dependents), dependents };
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

      await writeSettingsInfraOutbox(client, {
        orgId,
        eventType: 'settings.warehouse.deactivated',
        aggregateType: 'warehouse',
        aggregateId: row.id,
        payload: { warehouse_id: row.id, actor_user_id: userId },
      });

      return { ok: true, data: { warehouseId: row.id, isActive: false } };
    });
  } catch {
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function renameWarehouse(rawInput: unknown): Promise<RenameWarehouseResult> {
  const parsed = renameWarehouseSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<RenameWarehouseResult> => {
      if (!(await hasPermission({ client, userId, orgId }, EDIT_PERMISSION))) return { ok: false, error: 'forbidden' };
      const { rows } = await client.query<{ id: string; name: string }>(
        `update public.warehouses
            set name = $2
          where org_id = app.current_org_id()
            and id = $1::uuid
        returning id::text, name`,
        [parsed.data.warehouseId, parsed.data.name],
      );
      const row = rows[0];
      return row ? { ok: true, data: row } : { ok: false, error: 'not_found' };
    });
  } catch (error) {
    console.error('[settings/infra/warehouse:rename] persistence_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function deleteWarehouse(rawInput: unknown): Promise<DeleteWarehouseResult> {
  const parsed = warehouseIdSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<DeleteWarehouseResult> => {
      if (!(await hasPermission({ client, userId, orgId }, EDIT_PERMISSION))) return { ok: false, error: 'forbidden' };
      if (!(await getWarehouse(client, parsed.data.warehouseId))) return { ok: false, error: 'not_found' };

      const dependents = await getWarehouseDependents(client, parsed.data.warehouseId);
      if (Object.values(dependents).some((count) => count > 0)) {
        return { ok: false, error: 'has_dependents', message: 'This warehouse still has dependent records and cannot be deleted.', dependents };
      }

      const { rows } = await client.query<{ id: string }>(
        `delete from public.warehouses
          where org_id = app.current_org_id()
            and id = $1::uuid
        returning id::text`,
        [parsed.data.warehouseId],
      );
      return rows[0] ? { ok: true, data: { warehouseId: rows[0].id } } : { ok: false, error: 'not_found' };
    });
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      return { ok: false, error: 'has_dependents', message: 'This warehouse still has dependent records and cannot be deleted.' };
    }
    console.error('[settings/infra/warehouse:delete] persistence_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return { ok: false, error: 'persistence_failed' };
  }
}


type StorageRulesRow = {
  warehouse_id: string;
  bin_assignment_strategy: string;
  mixed_lot_bins: boolean;
  expiry_warning_days: number | string;
  block_expired_stock: boolean;
};

export async function updateWarehouseStorageRules(rawInput: unknown): Promise<UpdateWarehouseStorageRulesResult> {
  const input = parseStorageRulesInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<UpdateWarehouseStorageRulesResult> => {
      if (!(await hasPermission({ client, userId, orgId }, EDIT_PERMISSION))) return { ok: false, error: 'forbidden' };

      const warehouse = await getWarehouse(client, input.warehouseId);
      if (!warehouse) return { ok: false, error: 'not_found' };

      // Upsert the per-warehouse storage rules row (one per org_id + warehouse_id).
      // Only overwrite columns that were supplied; coalesce keeps existing/default values otherwise.
      const { rows } = await client.query<StorageRulesRow>(
        `insert into public.warehouse_storage_settings
           (org_id, warehouse_id, bin_assignment_strategy, mixed_lot_bins, expiry_warning_days, block_expired_stock, created_by, updated_by)
         values (
           app.current_org_id(),
           $1::uuid,
           coalesce($2::text, 'FEFO'),
           coalesce($3::boolean, false),
           coalesce($4::integer, 7),
           coalesce($5::boolean, true),
           $6::uuid,
           $6::uuid
         )
         on conflict (org_id, warehouse_id) do update
            set bin_assignment_strategy = coalesce($2::text, public.warehouse_storage_settings.bin_assignment_strategy),
                mixed_lot_bins          = coalesce($3::boolean, public.warehouse_storage_settings.mixed_lot_bins),
                expiry_warning_days     = coalesce($4::integer, public.warehouse_storage_settings.expiry_warning_days),
                block_expired_stock     = coalesce($5::boolean, public.warehouse_storage_settings.block_expired_stock),
                updated_by              = $6::uuid
         returning warehouse_id, bin_assignment_strategy, mixed_lot_bins, expiry_warning_days, block_expired_stock`,
        [
          input.warehouseId,
          input.binAssignmentStrategy ?? null,
          input.mixedLotBins ?? null,
          input.expiryWarningDays ?? null,
          input.blockExpiredStock ?? null,
          userId,
        ],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'persistence_failed' };

      await writeSettingsInfraOutbox(client, {
        orgId,
        eventType: 'settings.warehouse.storage_rules_updated',
        aggregateType: 'warehouse',
        aggregateId: row.warehouse_id,
        payload: {
          warehouse_id: row.warehouse_id,
          bin_assignment_strategy: row.bin_assignment_strategy,
          mixed_lot_bins: row.mixed_lot_bins,
          expiry_warning_days: Number(row.expiry_warning_days),
          block_expired_stock: row.block_expired_stock,
          actor_user_id: userId,
        },
      });

      return {
        ok: true,
        data: {
          warehouseId: row.warehouse_id,
          binAssignmentStrategy: normalizeStrategy(row.bin_assignment_strategy) ?? 'FEFO',
          mixedLotBins: row.mixed_lot_bins === true,
          expiryWarningDays: Number(row.expiry_warning_days) || 0,
          blockExpiredStock: row.block_expired_stock === true,
        },
      };
    });
  } catch (error) {
    console.error('[settings/infra/warehouse:storage-rules] persistence_failed', error instanceof Error ? { message: error.message } : { message: String(error) });
    return { ok: false, error: 'persistence_failed' };
  }
}

function normalizeStrategy(value: unknown): BinAssignmentStrategy | null {
  if (typeof value !== 'string') return null;
  return (BIN_ASSIGNMENT_STRATEGIES as readonly string[]).includes(value) ? (value as BinAssignmentStrategy) : null;
}

function parseStorageRulesInput(raw: unknown): (Partial<WarehouseStorageRules> & { warehouseId: string }) | null {
  if (!raw || typeof raw !== 'object') return null;
  const input = raw as Record<string, unknown>;
  const warehouseId = requiredUuid(input.warehouseId);
  if (!warehouseId) return null;

  const parsed: Partial<WarehouseStorageRules> & { warehouseId: string } = { warehouseId };

  if (input.binAssignmentStrategy !== undefined) {
    const strategy = normalizeStrategy(input.binAssignmentStrategy);
    if (!strategy) return null;
    parsed.binAssignmentStrategy = strategy;
  }
  if (input.mixedLotBins !== undefined) {
    if (typeof input.mixedLotBins !== 'boolean') return null;
    parsed.mixedLotBins = input.mixedLotBins;
  }
  if (input.expiryWarningDays !== undefined) {
    const days = Number(input.expiryWarningDays);
    if (!Number.isInteger(days) || days < 0 || days > 3650) return null;
    parsed.expiryWarningDays = days;
  }
  if (input.blockExpiredStock !== undefined) {
    if (typeof input.blockExpiredStock !== 'boolean') return null;
    parsed.blockExpiredStock = input.blockExpiredStock;
  }
  return parsed;
}

function parseCreateInput(raw: unknown): ParsedCreateInput | null {
  const parsed = createWarehouseInputSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function parseDeactivateInput(raw: unknown): { warehouseId: string } | null {
  const parsed = warehouseIdSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
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

async function getWarehouseDependents(client: QueryClient, warehouseId: string): Promise<WarehouseDependents> {
  const { rows } = await client.query<WarehouseDependencyRow>(
    `select
       (select count(*)::integer
          from public.license_plates lp
         where lp.org_id = app.current_org_id()
           and lp.warehouse_id = $1::uuid
           and lp.quantity > 0::numeric
           and lp.status in ('received', 'available', 'reserved', 'allocated', 'blocked', 'returned', 'quarantine')) as on_hand_stock,
       (select count(*)::integer
          from public.work_orders wo
          join public.production_lines pl
            on pl.org_id = app.current_org_id()
           and pl.id = wo.production_line_id
         where wo.org_id = app.current_org_id()
           and pl.warehouse_id = $1::uuid
           and wo.status in ('DRAFT', 'RELEASED', 'IN_PROGRESS', 'ON_HOLD')) as open_work_orders,
       (select count(*)::integer
          from public.license_plates lp
         where lp.org_id = app.current_org_id()
           and lp.warehouse_id = $1::uuid
           and lp.reserved_qty > 0::numeric) as reservations,
       (select count(*)::integer
          from public.locations l
         where l.org_id = app.current_org_id()
           and l.warehouse_id = $1::uuid) as locations,
       (select count(*)::integer
          from public.production_lines pl
         where pl.org_id = app.current_org_id()
           and pl.warehouse_id = $1::uuid) as production_lines`,
    [warehouseId],
  );
  const row = rows[0];
  return {
    onHandStock: count(row?.on_hand_stock),
    openWorkOrders: count(row?.open_work_orders),
    reservations: count(row?.reservations),
    locations: count(row?.locations),
    productionLines: count(row?.production_lines),
  };
}

function count(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function hasActiveDependents(dependents: WarehouseDependents): boolean {
  return dependents.onHandStock > 0 || dependents.openWorkOrders > 0 || dependents.reservations > 0;
}

function activeDependentsMessage(dependents: WarehouseDependents): string {
  const reasons = [
    dependents.onHandStock > 0 ? `${dependents.onHandStock} on-hand stock record(s)` : null,
    dependents.openWorkOrders > 0 ? `${dependents.openWorkOrders} open work order(s)` : null,
    dependents.reservations > 0 ? `${dependents.reservations} reservation(s)` : null,
  ].filter(Boolean);
  return `Warehouse cannot be deactivated while it has ${reasons.join(', ')}.`;
}

function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === '23503';
}

function requiredUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 128 ? trimmed : null;
}
