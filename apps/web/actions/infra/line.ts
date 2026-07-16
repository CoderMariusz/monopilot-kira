'use server';

import { z } from 'zod';

import { writeSettingsInfraOutbox } from './_shared/outbox';
import { findProductionLineByCodeAndSite } from './line-resolve';
import { hasPermission } from '../../lib/auth/has-permission';
import { withOrgContext } from '../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../lib/i18n/revalidate-localized';

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type OrgActionContext = {
  userId: string;
  orgId: string;
  client: QueryClient;
};

type LineStatus = 'draft' | 'active' | 'inactive';
type LineRow = { id: string; code: string; name: string; status: LineStatus; default_output_location_id: string | null };
type WarehouseRow = { id: string; site_id: string | null };
type LocationWarehouseRow = { warehouse_id: string | null };

type ParsedLineInput = {
  id: string | null;
  siteId: string | null;
  warehouseId: string | null;
  defaultOutputLocationId: string | null;
  code: string;
  name: string;
  status: LineStatus;
};

export type UpsertLineResult =
  | { ok: true; data: { id: string; status: LineStatus } }
  | {
      ok: false;
      error:
        | 'invalid_input'
        | 'forbidden'
        | 'invalid_warehouse_reference'
        | 'warehouse_site_mismatch'
        | 'duplicate_code'
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
  status: z.enum(['draft', 'active', 'inactive']),
});

export async function upsertLine(rawInput: unknown): Promise<UpsertLineResult> {
  const input = parseLineInput(rawInput);
  if (!input) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }: OrgActionContext): Promise<UpsertLineResult> => {
      if (!(await hasPermission({ client, userId, orgId }, EDIT_PERMISSION))) return { ok: false, error: 'forbidden' };

      if (input.warehouseId) {
        const warehouse = await getWarehouse(client, input.warehouseId);
        if (!warehouse) return { ok: false, error: 'invalid_warehouse_reference' };
        if (!lineWarehouseSitesMatch(input.siteId, warehouse.site_id)) {
          return { ok: false, error: 'warehouse_site_mismatch' };
        }
      }
      if (input.defaultOutputLocationId && input.warehouseId) {
        const location = await getLocationWarehouse(client, input.defaultOutputLocationId);
        if (!location || location.warehouse_id !== input.warehouseId) return { ok: false, error: 'invalid_location_reference' };
      }

      const duplicate = await findProductionLineByCodeAndSite(client, {
        code: input.code,
        siteId: input.siteId,
        excludeId: input.id,
      });
      if (duplicate) return { ok: false, error: 'duplicate_code' };

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
         returning id, code, name, status, default_output_location_id`,
        [input.id, input.siteId, input.warehouseId, input.defaultOutputLocationId, input.code, input.name, input.status],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'persistence_failed' };

      await writeSettingsInfraOutbox(client, {
        orgId,
        eventType: 'settings.line.upserted',
        aggregateType: 'production_line',
        aggregateId: row.id,
        payload: {
          line_id: row.id,
          status: row.status,
          warehouse_id: input.warehouseId,
          default_output_location_id: input.defaultOutputLocationId,
          actor_user_id: userId,
        },
      });

      revalidateLinesPath();

      return { ok: true, data: { id: row.id, status: row.status } };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: 'duplicate_code' };
    return { ok: false, error: 'persistence_failed' };
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === '23505';
}

/** Null-safe site equality: line.site_id must match warehouse.site_id (including both NULL). */
function lineWarehouseSitesMatch(lineSiteId: string | null, warehouseSiteId: string | null): boolean {
  return lineSiteId === warehouseSiteId;
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
  };
}

async function getWarehouse(client: QueryClient, warehouseId: string): Promise<WarehouseRow | null> {
  const { rows } = await client.query<WarehouseRow>(
    `select id, site_id::text
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

function revalidateLinesPath(): void {
  try {
    revalidateLocalized('/settings/infra/lines', 'page');
  } catch (e) {
    console.warn('revalidateLinesPath failed', e);
  }
}
