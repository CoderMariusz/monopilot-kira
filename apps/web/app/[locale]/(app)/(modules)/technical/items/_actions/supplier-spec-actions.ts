'use server';

/**
 * ITEM SUPPLIER MANAGEMENT — attach/approve a supplier_spec from the Item Detail
 * supplier-specs tab (the gap fix for items NOT born in NPD).
 *
 * CAUSAL CHAIN (why this exists):
 *   apps/web/lib/technical/rm-usability.ts hard-blocks a BOM component with
 *     - SUPPLIER_NOT_APPROVED      when supplier_specs.supplier_status !== 'approved'
 *     - SUPPLIER_SPEC_NOT_ACTIVE   unless lifecycle_status='active' AND
 *                                  review_status='approved' AND not expired
 *   Before this action there was NO write path to satisfy those checks for an item
 *   that wasn't seeded through NPD (mig 251/257). createItemSupplierSpec writes the
 *   exact column shape those predicates read, so an approve-now insert clears both
 *   warnings for that item the moment the supplier-specs tab refreshes.
 *
 * Schema (public.supplier_specs, packages/db/migrations/162-lab-supplier.sql):
 *   supplier_status   ∈ pending|approved|blocked      → SUPPLIER_NOT_APPROVED gate
 *   lifecycle_status  ∈ draft|active|expired|superseded|blocked
 *   review_status     ∈ pending|approved|rejected|blocked
 *   effective_from/expiry_date (date)  → in-date check
 *   cost_review_blocked / spec_review_blocked (bool)  → COST/SPEC_REVIEW gates
 *   PARTIAL UNIQUE supplier_specs_one_active_approved
 *     (org_id, item_id, supplier_code) where lifecycle_status='active' and
 *     review_status='approved'  → the idempotency conflict target.
 *
 * supplier_code is TEXT (no FK to public.suppliers); we write the supplier master
 * `code` resolved from the chosen supplierId. RBAC mirrors updateItem
 * (technical.items.edit — attaching a supplier to an existing item is an edit).
 * Real Supabase only (withOrgContext + RLS); no mocks.
 */

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { safeRevalidatePath } from './revalidate';
import {
  hasPermission,
  isPgError,
  ITEMS_EDIT_PERMISSION,
  type OrgActionContext,
  type QueryClient,
  writeAudit,
} from './shared';
import {
  listSupplierSpecs,
  type SupplierSpecsData,
} from '../[item_code]/_actions/list-supplier-specs';

// ── Read — REUSE the existing item-detail supplier-specs loader ───────────────
// The supplier-specs tab already reads via [item_code]/_actions/list-supplier-specs.
// We re-export it through the items _actions barrel so callers (the modal's
// refresh, tests) have a single import surface and never re-author the query.
export async function listItemSupplierSpecs(itemCode: string): Promise<SupplierSpecsData> {
  return listSupplierSpecs(itemCode);
}

// ── Write input ───────────────────────────────────────────────────────────────
const OptionalIsoDate = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
    .optional(),
);
const OptionalUnitPrice = z
  .number()
  .nonnegative()
  .or(z.string().regex(/^\d+(\.\d+)?$/).transform(Number))
  .optional();

// NOT exported: a zod schema is an OBJECT and 'use server' files may only export
// async functions (turbopack build error: "found object"). Types below stay.
const CreateItemSupplierSpecInput = z
  .object({
    itemCode: z.string().trim().min(1).max(64),
    supplierId: z.string().uuid(),
    specVersion: z.string().trim().min(1).max(64).optional().default('v1'),
    issuedDate: OptionalIsoDate,
    effectiveFrom: OptionalIsoDate,
    expiryDate: OptionalIsoDate,
    unitPrice: OptionalUnitPrice,
    priceCurrency: z.string().max(3).optional(),
    /**
     * approve-now: writes the APPROVED + ACTIVE state that satisfies the
     * rm-usability supplier gates. When false the row lands as pending/draft and
     * the BOM readiness warnings stay (honest — nothing is silently approved).
     */
    approveNow: z.boolean().optional().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.effectiveFrom && value.expiryDate && value.expiryDate < value.effectiveFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiryDate'],
        message: 'expiry_date must be on or after effective_from',
      });
    }
  });

export type CreateItemSupplierSpecInputType = z.input<typeof CreateItemSupplierSpecInput>;

export type SupplierSpecActionError =
  | 'invalid_input'
  | 'forbidden'
  | 'item_not_found'
  | 'supplier_not_found'
  | 'already_exists'
  | 'persistence_failed';

export type CreateItemSupplierSpecResult =
  | { ok: true; data: { id: string; supplierCode: string; updated: boolean } }
  | { ok: false; error: SupplierSpecActionError; message?: string };

const UpdateItemSupplierSpecInput = z
  .object({
    specId: z.string().uuid(),
    specVersion: z.string().trim().min(1).max(64).optional(),
    issuedDate: OptionalIsoDate,
    effectiveFrom: OptionalIsoDate,
    expiryDate: OptionalIsoDate,
    unitPrice: OptionalUnitPrice,
    priceCurrency: z.string().max(3).optional(),
    approveNow: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.effectiveFrom && value.expiryDate && value.expiryDate < value.effectiveFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiryDate'],
        message: 'expiry_date must be on or after effective_from',
      });
    }
  });

export type UpdateItemSupplierSpecResult =
  | { ok: true; data: { id: string } }
  | { ok: false; error: SupplierSpecActionError; message?: string };

export type DeactivateItemSupplierSpecResult =
  | { ok: true; data: { id: string; alreadyInactive: boolean } }
  | { ok: false; error: SupplierSpecActionError };

export async function createItemSupplierSpec(
  rawInput: unknown,
): Promise<CreateItemSupplierSpecResult> {
  const parsed = CreateItemSupplierSpecInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(
      async ({ userId, orgId, client }): Promise<CreateItemSupplierSpecResult> => {
        const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
        if (!(await hasPermission(ctx, ITEMS_EDIT_PERMISSION))) return { ok: false, error: 'forbidden' };

        // Resolve item_id (org-scoped under RLS).
        const itemRes = await ctx.client.query<{ id: string }>(
          `select id from public.items
            where org_id = app.current_org_id() and item_code = $1
            limit 1`,
          [input.itemCode],
        );
        const itemId = itemRes.rows[0]?.id;
        if (!itemId) return { ok: false, error: 'item_not_found' };

        // Resolve the supplier master code from the chosen supplierId.
        const supRes = await ctx.client.query<{ code: string }>(
          `select code from public.suppliers
            where org_id = app.current_org_id() and id = $1::uuid
            limit 1`,
          [input.supplierId],
        );
        const supplierId = input.supplierId;
        const supplierCode = supRes.rows[0]?.code;
        if (!supplierCode) return { ok: false, error: 'supplier_not_found' };

        const approve = input.approveNow;
        const supplierStatus = approve ? 'approved' : 'pending';
        const lifecycleStatus = approve ? 'active' : 'draft';
        const reviewStatus = approve ? 'approved' : 'pending';

        // When NOT approving there is no partial-unique conflict target (the index
        // is WHERE active+approved), so guard against an existing active+approved
        // row for the same supplier+item and report honestly.
        if (!approve) {
          const dup = await ctx.client.query<{ id: string }>(
            `select id from public.supplier_specs
              where org_id = app.current_org_id()
                and item_id = $1::uuid
                and supplier_code = $2
                and lifecycle_status = 'active'
                and review_status = 'approved'
              limit 1`,
            [itemId, supplierCode],
          );
          if (dup.rows[0]) return { ok: false, error: 'already_exists' };
        }

        // Idempotent upsert keyed on the mig-162 partial unique index. For an
        // approve-now write a duplicate supplier+item refreshes the in-date window
        // (updated=true); a brand-new row inserts (updated=false).
        const { rows } = await ctx.client.query<{ id: string; inserted: boolean }>(
          `insert into public.supplier_specs
             (org_id, item_id, supplier_code, supplier_status, spec_version,
              issued_date, effective_from, expiry_date, lifecycle_status, review_status,
              cost_review_blocked, spec_review_blocked, uploaded_by, unit_price, price_currency,
              supplier_id)
           values
             (app.current_org_id(), $1::uuid, $2, $3, $4,
              $5::date, coalesce($6::date, current_date), $7::date, $8, $9,
              false, false, $10::uuid, $11::numeric, $12,
              $13::uuid)
           on conflict (org_id, item_id, supplier_code)
             where lifecycle_status = 'active' and review_status = 'approved'
           do update set
             supplier_id         = excluded.supplier_id,
             spec_version        = excluded.spec_version,
             issued_date         = excluded.issued_date,
             effective_from      = excluded.effective_from,
             expiry_date         = excluded.expiry_date,
             unit_price          = coalesce(excluded.unit_price, public.supplier_specs.unit_price),
             price_currency      = coalesce(excluded.price_currency, public.supplier_specs.price_currency),
             supplier_status     = 'approved',
             lifecycle_status    = 'active',
             review_status       = 'approved',
             cost_review_blocked = false,
             spec_review_blocked = false,
             updated_at          = pg_catalog.now()
           returning id, (xmax = 0) as inserted`,
          [
            itemId,
            supplierCode,
            supplierStatus,
            input.specVersion,
            input.issuedDate ?? null,
            input.effectiveFrom ?? null,
            input.expiryDate ?? null,
            lifecycleStatus,
            reviewStatus,
            userId,
            input.unitPrice ?? null,
            input.priceCurrency ?? null,
            supplierId,
          ],
        );
        const written = rows[0];
        if (!written) return { ok: false, error: 'persistence_failed' };

        await writeAudit(client as QueryClient, {
          orgId,
          actorUserId: userId,
          action: written.inserted ? 'item.supplier_spec.created' : 'item.supplier_spec.updated',
          resourceId: itemId,
          beforeState: null,
          afterState: {
            itemCode: input.itemCode,
            supplierCode,
            supplierStatus,
            lifecycleStatus,
            reviewStatus,
            specVersion: input.specVersion,
            effectiveFrom: input.effectiveFrom ?? null,
            expiryDate: input.expiryDate ?? null,
            unitPrice: input.unitPrice ?? null,
            priceCurrency: input.priceCurrency ?? null,
          },
        });

        safeRevalidatePath('/technical/items');
        return {
          ok: true,
          data: { id: written.id, supplierCode, updated: !written.inserted },
        };
      },
    );
  } catch (err) {
    if (isPgError(err) && err.code === '23505') return { ok: false, error: 'already_exists' };
    if (isPgError(err) && err.code === '23514') return { ok: false, error: 'invalid_input' };
    if (isPgError(err) && err.code === '23503') return { ok: false, error: 'item_not_found' };
    console.error('[technical/items] createItemSupplierSpec persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function updateItemSupplierSpec(
  rawInput: unknown,
): Promise<UpdateItemSupplierSpecResult> {
  const parsed = UpdateItemSupplierSpecInput.safeParse(rawInput);
  if (!parsed.success) return { ok: false, error: 'invalid_input', message: parsed.error.message };
  const input = parsed.data;

  try {
    return await withOrgContext(
      async ({ userId, orgId, client }): Promise<UpdateItemSupplierSpecResult> => {
        const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
        if (!(await hasPermission(ctx, ITEMS_EDIT_PERMISSION))) return { ok: false, error: 'forbidden' };

        const existingRes = await ctx.client.query<{
          id: string;
          item_id: string;
          spec_version: string;
          issued_date: string | null;
          effective_from: string | null;
          expiry_date: string | null;
          lifecycle_status: string;
          review_status: string;
          supplier_status: string;
          unit_price: string | null;
          price_currency: string | null;
        }>(
          `select id,
                  item_id::text,
                  spec_version,
                  issued_date::text,
                  effective_from::text,
                  expiry_date::text,
                  lifecycle_status,
                  review_status,
                  supplier_status,
                  unit_price::text,
                  price_currency
             from public.supplier_specs
            where org_id = app.current_org_id()
              and id = $1::uuid
            limit 1`,
          [input.specId],
        );
        const existing = existingRes.rows[0];
        if (!existing) return { ok: false, error: 'item_not_found' };

        const approveNow = input.approveNow === true;
        const { rows } = await ctx.client.query<{
          id: string;
          spec_version: string;
          issued_date: string | null;
          effective_from: string | null;
          expiry_date: string | null;
          lifecycle_status: string;
          review_status: string;
          supplier_status: string;
          unit_price: string | null;
          price_currency: string | null;
        }>(
          `update public.supplier_specs
              set spec_version = coalesce($2, spec_version),
                  issued_date = $3::date,
                  effective_from = coalesce($4::date, effective_from),
                  expiry_date = $5::date,
                  supplier_status = case when $6::boolean then 'approved' else supplier_status end,
                  lifecycle_status = case when $6::boolean then 'active' else lifecycle_status end,
                  review_status = case when $6::boolean then 'approved' else review_status end,
                  approved_by = case when $6::boolean then $7::uuid else approved_by end,
                  approved_at = case when $6::boolean then pg_catalog.now() else approved_at end,
                  unit_price = coalesce($8::numeric, unit_price),
                  price_currency = coalesce($9, price_currency),
                  updated_at = pg_catalog.now()
            where org_id = app.current_org_id()
              and id = $1::uuid
            returning id,
                      spec_version,
                      issued_date::text,
                      effective_from::text,
                      expiry_date::text,
                      lifecycle_status,
                      review_status,
                      supplier_status,
                      unit_price::text,
                      price_currency`,
          [
            input.specId,
            input.specVersion ?? null,
            input.issuedDate ?? null,
            input.effectiveFrom ?? null,
            input.expiryDate ?? null,
            approveNow,
            userId,
            input.unitPrice ?? null,
            input.priceCurrency ?? null,
          ],
        );
        const updated = rows[0];
        if (!updated) return { ok: false, error: 'persistence_failed' };

        await writeAudit(client as QueryClient, {
          orgId,
          actorUserId: userId,
          action: 'item.supplier_spec.updated',
          resourceId: existing.item_id,
          beforeState: existing,
          afterState: {
            specVersion: updated.spec_version,
            issuedDate: updated.issued_date,
            effectiveFrom: updated.effective_from,
            expiryDate: updated.expiry_date,
            lifecycleStatus: updated.lifecycle_status,
            reviewStatus: updated.review_status,
            supplierStatus: updated.supplier_status,
            unitPrice: updated.unit_price,
            priceCurrency: updated.price_currency,
          },
        });

        safeRevalidatePath('/technical/items');
        return { ok: true, data: { id: updated.id } };
      },
    );
  } catch (err) {
    if (isPgError(err) && err.code === '23514') return { ok: false, error: 'invalid_input' };
    console.error('[technical/items] updateItemSupplierSpec persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function deactivateItemSupplierSpec(
  rawSpecId: unknown,
): Promise<DeactivateItemSupplierSpecResult> {
  const parsed = z.string().uuid().safeParse(rawSpecId);
  if (!parsed.success) return { ok: false, error: 'invalid_input' };
  const specId = parsed.data;

  try {
    return await withOrgContext(
      async ({ userId, orgId, client }): Promise<DeactivateItemSupplierSpecResult> => {
        const ctx: OrgActionContext = { userId, orgId, client: client as QueryClient };
        if (!(await hasPermission(ctx, ITEMS_EDIT_PERMISSION))) return { ok: false, error: 'forbidden' };

        const existingRes = await ctx.client.query<{
          id: string;
          item_id: string;
          lifecycle_status: string;
        }>(
          `select id, item_id::text, lifecycle_status
             from public.supplier_specs
            where org_id = app.current_org_id()
              and id = $1::uuid
            limit 1`,
          [specId],
        );
        const existing = existingRes.rows[0];
        if (!existing) return { ok: false, error: 'item_not_found' };

        if (['superseded', 'blocked', 'expired'].includes(existing.lifecycle_status)) {
          return { ok: true, data: { id: existing.id, alreadyInactive: true } };
        }

        await ctx.client.query(
          `update public.supplier_specs
              set lifecycle_status = 'superseded',
                  updated_at = pg_catalog.now()
            where org_id = app.current_org_id()
              and id = $1::uuid`,
          [specId],
        );

        await writeAudit(client as QueryClient, {
          orgId,
          actorUserId: userId,
          action: 'item.supplier_spec.deactivated',
          resourceId: existing.item_id,
          beforeState: { lifecycleStatus: existing.lifecycle_status },
          afterState: { lifecycleStatus: 'superseded' },
        });

        safeRevalidatePath('/technical/items');
        return { ok: true, data: { id: existing.id, alreadyInactive: false } };
      },
    );
  } catch (err) {
    console.error('[technical/items] deactivateItemSupplierSpec persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
