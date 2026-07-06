'use server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { revalidateLocalized } from '../../../../../../../lib/i18n/revalidate-localized';
import {
  SupplierCreateInput,
  SupplierStatusSchema,
  hasPlanningWritePermission,
  hasPlanningReadPermission,
  pgErrorToResult,
  toIso,
  uuidSchema,
  writeProcurementAudit,
  type OrgActionContext,
  type ProcurementError,
  type QueryClient,
} from '../../_actions/procurement-shared';

type SupplierRow = {
  id: string;
  code: string;
  name: string;
  contact_jsonb: Record<string, unknown>;
  currency: string;
  lead_time_days: number;
  status: string;
  notes: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type Supplier = {
  id: string;
  code: string;
  name: string;
  contact: Record<string, unknown>;
  currency: string;
  leadTimeDays: number;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type SupplierResult<T> = { ok: true; data: T } | { ok: false; error: ProcurementError; message?: string };

const SupplierUpdateInput = SupplierCreateInput.extend({
  id: uuidSchema,
});

// Family-(a) round-trip fix: the create/transition mutations had NO server-cache
// revalidation, so the supplier list (and the detail header) could re-render stale
// after a write — only the client's router.refresh() saved it, and a fresh server
// navigation showed the pre-write rows. Mirror the shipped location.ts / PO / TO
// revalidate pattern. The action has no locale in scope, so revalidate the dynamic
// [locale] page segment (covers en/pl/ro/uk) plus the per-id detail when known.
function revalidateSupplierPaths(supplierId?: string): void {
  try {
    revalidateLocalized('/planning/suppliers', 'page');
    if (supplierId) revalidateLocalized(`/planning/suppliers/${supplierId}`, 'page');
  } catch (err) {
    if (process.env.VITEST) return;
    console.warn('[planning/suppliers] revalidate_skipped', err instanceof Error ? { message: err.message } : { message: String(err) });
  }
}

function mapSupplier(row: SupplierRow): Supplier {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    contact: row.contact_jsonb,
    currency: row.currency,
    leadTimeDays: Number(row.lead_time_days),
    status: row.status,
    notes: row.notes,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function listSuppliers(params: unknown = {}): Promise<SupplierResult<Supplier[]>> {
  const input = (params ?? {}) as { status?: unknown; q?: unknown; limit?: unknown };
  const status = typeof input.status === 'string' ? SupplierStatusSchema.safeParse(input.status) : null;
  if (status && !status.success) return { ok: false, error: 'invalid_input' };
  const q = typeof input.q === 'string' && input.q.trim() ? input.q.trim() : null;
  const limit = typeof input.limit === 'number' && Number.isInteger(input.limit) ? Math.min(Math.max(input.limit, 1), 200) : 100;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<SupplierResult<Supplier[]>> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPlanningReadPermission(ctx))) return { ok: false, error: 'forbidden' };

      const { rows } = await ctx.client.query<SupplierRow>(
        `select id, code, name, contact_jsonb, currency, lead_time_days, status, notes, created_at, updated_at
           from public.suppliers
          where org_id = app.current_org_id()
            and ($1::text is null or status = $1)
            and ($2::text is null or code ilike '%' || $2 || '%' or name ilike '%' || $2 || '%')
          order by code asc
          limit $3::integer`,
        [status?.success ? status.data : null, q, limit],
      );
      return { ok: true, data: rows.map(mapSupplier) };
    });
  } catch (err) {
    console.error('[planning/suppliers] listSuppliers failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function getSupplier(id: string): Promise<SupplierResult<Supplier>> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<SupplierResult<Supplier>> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPlanningReadPermission(ctx))) return { ok: false, error: 'forbidden' };

      const { rows } = await ctx.client.query<SupplierRow>(
        `select id, code, name, contact_jsonb, currency, lead_time_days, status, notes, created_at, updated_at
           from public.suppliers
          where org_id = app.current_org_id()
            and id = $1::uuid
          limit 1`,
        [id],
      );
      const row = rows[0];
      return row ? { ok: true, data: mapSupplier(row) } : { ok: false, error: 'not_found' };
    });
  } catch (err) {
    console.error('[planning/suppliers] getSupplier failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function createSupplier(rawInput: unknown): Promise<SupplierResult<Supplier>> {
  const parsed = SupplierCreateInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<SupplierResult<Supplier>> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPlanningWritePermission(ctx))) return { ok: false, error: 'forbidden' };

      const { rows } = await ctx.client.query<SupplierRow>(
        `insert into public.suppliers
           (org_id, code, name, contact_jsonb, currency, lead_time_days, status, notes, created_by, updated_by)
         values
           (app.current_org_id(), $1, $2, $3::jsonb, $4, $5::integer, $6, $7, $8::uuid, $8::uuid)
         returning id, code, name, contact_jsonb, currency, lead_time_days, status, notes, created_at, updated_at`,
        [
          input.code,
          input.name,
          JSON.stringify(input.contact ?? {}),
          input.currency,
          input.leadTimeDays,
          input.status,
          input.notes ?? null,
          userId,
        ],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'persistence_failed' };
      await writeProcurementAudit(ctx, {
        action: 'planning.supplier.created',
        resourceType: 'supplier',
        resourceId: row.id,
        afterState: { code: row.code, name: row.name, status: row.status },
      });
      revalidateSupplierPaths(row.id);
      return { ok: true, data: mapSupplier(row) };
    });
  } catch (err) {
    const error = pgErrorToResult(err);
    if (error !== 'persistence_failed') return { ok: false, error };
    console.error('[planning/suppliers] createSupplier failed', err);
    return { ok: false, error };
  }
}

export async function updateSupplier(rawInput: unknown): Promise<SupplierResult<Supplier>> {
  const parsed = SupplierUpdateInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<SupplierResult<Supplier>> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPlanningWritePermission(ctx))) return { ok: false, error: 'forbidden' };

      const before = await ctx.client.query<SupplierRow>(
        `select id, code, name, contact_jsonb, currency, lead_time_days, status, notes, created_at, updated_at
           from public.suppliers
          where org_id = app.current_org_id()
            and id = $1::uuid
          limit 1
          for update`,
        [input.id],
      );
      const previous = before.rows[0];
      if (!previous) return { ok: false, error: 'not_found' };

      const { rows, rowCount } = await ctx.client.query<SupplierRow>(
        // `code` is the supplier natural key and is referenced by loose text
        // soft-refs (supplier_specs.supplier_code, npd_packaging_components.supplier_code)
        // that have NO FK cascade — editing it would silently desync them, so it is
        // intentionally immutable here (renames would be a separate, cascade-aware op).
        `update public.suppliers
            set name = $2,
                contact_jsonb = $3::jsonb,
                currency = $4,
                lead_time_days = $5::integer,
                status = $6,
                notes = $7,
                updated_by = $8::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
        returning id, code, name, contact_jsonb, currency, lead_time_days, status, notes, created_at, updated_at`,
        [
          input.id,
          input.name,
          JSON.stringify(input.contact ?? {}),
          input.currency,
          input.leadTimeDays,
          input.status,
          input.notes ?? null,
          userId,
        ],
      );
      const row = rows[0];
      if (rowCount === 0 || !row) return { ok: false, error: 'not_found' };

      await writeProcurementAudit(ctx, {
        action: 'planning.supplier.updated',
        resourceType: 'supplier',
        resourceId: row.id,
        beforeState: {
          code: previous.code,
          name: previous.name,
          contact: previous.contact_jsonb,
          currency: previous.currency,
          leadTimeDays: Number(previous.lead_time_days),
          status: previous.status,
          notes: previous.notes,
        },
        afterState: {
          code: row.code,
          name: row.name,
          contact: row.contact_jsonb,
          currency: row.currency,
          leadTimeDays: Number(row.lead_time_days),
          status: row.status,
          notes: row.notes,
        },
      });
      revalidateSupplierPaths(row.id);
      return { ok: true, data: mapSupplier(row) };
    });
  } catch (err) {
    const error = pgErrorToResult(err);
    if (error !== 'persistence_failed') return { ok: false, error };
    console.error('[planning/suppliers] updateSupplier failed', err);
    return { ok: false, error };
  }
}

export async function transitionSupplierStatus(id: string, status: string): Promise<SupplierResult<Supplier>> {
  const parsed = SupplierStatusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };

  try {
    return await withOrgContext(async ({ userId, orgId, client }): Promise<SupplierResult<Supplier>> => {
      const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
      if (!(await hasPlanningWritePermission(ctx))) return { ok: false, error: 'forbidden' };

      const before = await ctx.client.query<{ status: string }>(
        `select status from public.suppliers where org_id = app.current_org_id() and id = $1::uuid limit 1`,
        [id],
      );
      const previous = before.rows[0];
      if (!previous) return { ok: false, error: 'not_found' };

      const { rows } = await ctx.client.query<SupplierRow>(
        `update public.suppliers
            set status = $2,
                updated_by = $3::uuid
          where org_id = app.current_org_id()
            and id = $1::uuid
        returning id, code, name, contact_jsonb, currency, lead_time_days, status, notes, created_at, updated_at`,
        [id, parsed.data, userId],
      );
      const row = rows[0];
      if (!row) return { ok: false, error: 'not_found' };
      await writeProcurementAudit(ctx, {
        action: 'planning.supplier.status_changed',
        resourceType: 'supplier',
        resourceId: row.id,
        beforeState: { status: previous.status },
        afterState: { status: row.status },
      });
      revalidateSupplierPaths(row.id);
      return { ok: true, data: mapSupplier(row) };
    });
  } catch (err) {
    console.error('[planning/suppliers] transitionSupplierStatus failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}
