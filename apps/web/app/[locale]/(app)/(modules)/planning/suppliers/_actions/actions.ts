'use server';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import {
  SupplierCreateInput,
  SupplierStatusSchema,
  hasPlanningWritePermission,
  pgErrorToResult,
  toIso,
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
    return await withOrgContext(async ({ client }): Promise<SupplierResult<Supplier[]>> => {
      const { rows } = await (client as QueryClient).query<SupplierRow>(
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
    return await withOrgContext(async ({ client }): Promise<SupplierResult<Supplier>> => {
      const { rows } = await (client as QueryClient).query<SupplierRow>(
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
      return { ok: true, data: mapSupplier(row) };
    });
  } catch (err) {
    const error = pgErrorToResult(err);
    if (error !== 'persistence_failed') return { ok: false, error };
    console.error('[planning/suppliers] createSupplier failed', err);
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
      return { ok: true, data: mapSupplier(row) };
    });
  } catch (err) {
    console.error('[planning/suppliers] transitionSupplierStatus failed', err);
    return { ok: false, error: 'persistence_failed' };
  }
}
