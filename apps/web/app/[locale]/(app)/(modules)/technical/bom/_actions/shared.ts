/**
 * 03-technical shared BOM SSOT — Server Action shared module (T-012..T-016).
 *
 * Plain (non-`'use server'`) module: it may export non-async values (zod schemas,
 * types, helpers). The `'use server'` action files import from here. Mirrors the
 * sibling items master `_actions/shared.ts` conventions 1:1.
 *
 * Schema authority:
 *   - packages/db/migrations/090-shared-bom-ssot-npd-origin.sql  (bom_headers / bom_lines)
 *   - packages/db/migrations/159-bom-items-fk-coproducts-snapshots.sql (item_id FK, bom_co_products, bom_snapshots)
 *   - packages/db/migrations/169-bom-generator-jobs.sql (generator queue)
 *
 * Canonical key: the shared BOM SSOT is parented by `bom_headers.product_id`
 * (= public.product.product_code, the FG product aggregate). The route `:itemCode`
 * segment resolves to this product_id — the FG's natural key. RLS scopes every row
 * by `org_id = app.current_org_id()`; there is NO service-role bypass.
 *
 * RBAC: the `technical.bom.*` family is seeded to the org-admin role family by
 * migration 154 (`seed_technical_permissions_for_org`).
 *
 * Outbox note: `public.outbox_events.event_type` is locked by a DB CHECK + the
 * drift gate (packages/outbox/src/events.enum.ts). The only valid BOM events are
 * `bom.version_submitted` and `fg.bom.released`. We emit those where they fit
 * (create-draft → version_submitted; publish → fg.bom.released) and record every
 * write in `audit_log` (whose `action` has no enum constraint), exactly as the
 * items actions do. Adding new BOM event strings is out of scope (locked SoT).
 */

import { z } from 'zod';
import {
  validateRmUsability,
  type RmAllergenInput,
  type RmSupplierSpecInput,
  type RmUsabilityContext,
  type RmUsabilityReasonCode,
} from '../../../../../../../lib/technical/rm-usability';

// ── RBAC permission strings (packages/rbac/src/permissions.enum.ts) ───────────
export const BOM_CREATE_PERMISSION = 'technical.bom.create';
export const BOM_APPROVE_PERMISSION = 'technical.bom.approve';
export const BOM_VERSION_PUBLISH_PERMISSION = 'technical.bom.version_publish';
export const BOM_GENERATE_BATCH_PERMISSION = 'technical.bom.generate_batch';

export const APP_VERSION = 'technical-bom-v1';

// ── BOM list pagination (TEC-020 / T-037) ─────────────────────────────────────
// Lives here (a plain module) so it can be imported by both the 'use server'
// reader (queries.ts) and the page RSC without violating the "only async exports"
// rule of 'use server' files.
export const BOM_LIST_PAGE_SIZE = 50;

// ── Outbox event types (must exist in the locked enum SoT) ────────────────────
export const EVENT_BOM_VERSION_SUBMITTED = 'bom.version_submitted';
export const EVENT_FG_BOM_RELEASED = 'fg.bom.released';

// ── Audit actions (audit_log.action has no enum constraint) ───────────────────
export const AUDIT_BOM_CREATED = 'bom.created';
export const AUDIT_BOM_APPROVE = 'bom.approve';
export const AUDIT_BOM_PUBLISH = 'bom.publish';
export const AUDIT_BOM_BATCH_GENERATE = 'bom_batch_generate';

// ── Enums (mirror CHECK constraints in migrations 090 / 159 / 169) ────────────
export const BOM_STATUSES = ['draft', 'in_review', 'technical_approved', 'active', 'superseded', 'archived'] as const;
export type BomStatus = (typeof BOM_STATUSES)[number];

export const COMPONENT_TYPES = ['RM', 'PM', 'WIP', 'FG'] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

export const GENERATOR_SCOPES = ['all_complete', 'selected'] as const;
export type GeneratorScope = (typeof GENERATOR_SCOPES)[number];

export const GENERATOR_OUTPUT_MODES = ['per_fg', 'single_batch'] as const;
export type GeneratorOutputMode = (typeof GENERATOR_OUTPUT_MODES)[number];

export type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type OrgActionContext = { userId: string; orgId: string; client: QueryClient };

export type BomActionError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation_failed'
  | 'persistence_failed';

// ── Validation rule codes (PRD §7.4/§7.6) ─────────────────────────────────────
export type BomValidationCode =
  | 'V-TEC-10' // version must be approved before publish
  | 'V-TEC-11' // soft warning (allocation rounding / advisory) — non-blocking
  | 'V-TEC-12' // non-byproduct allocation sum != 100
  | 'V-TEC-13' // BOM cycle / self-reference
  | 'V-TEC-14' // component item blocked / not usable
  | 'V-TEC-15'; // generator FG must be Status_Overall = 'Complete'

// ── Read shapes (detail mirrors snapshot_json contract: header/lines/co_products) ──
export type BomHeaderView = {
  id: string;
  productId: string | null;
  npdProjectId: string | null;
  faCode: string | null;
  originModule: string;
  status: BomStatus;
  version: number;
  supersedesBomHeaderId: string | null;
  yieldPct: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  notes: string | null;
};

export type BomLineView = {
  id: string;
  lineNo: number;
  itemId: string | null;
  componentCode: string;
  componentType: string | null;
  quantity: string;
  uom: string;
  scrapPct: string;
  manufacturingOperationName: string | null;
  sequence: number | null;
  isPhantom: boolean;
};

export type BomCoProductView = {
  id: string;
  coProductItemId: string;
  quantity: string;
  uom: string;
  allocationPct: string;
  isByproduct: boolean;
};

export type BomDetailView = {
  header: BomHeaderView;
  lines: BomLineView[];
  co_products: BomCoProductView[];
};

// ── Create-draft input (T-013) ────────────────────────────────────────────────
const LineInput = z.object({
  // canonical FK to items.id; component_code TEXT retained for display
  itemId: z.string().uuid().optional(),
  componentCode: z.string().trim().min(1).max(128),
  componentType: z.enum(COMPONENT_TYPES).optional(),
  quantity: z.coerce.number().positive().finite(),
  uom: z.string().trim().min(1).max(32),
  scrapPct: z.coerce.number().min(0).max(100).optional().default(0),
  manufacturingOperationName: z.string().trim().max(256).optional(),
  sequence: z.coerce.number().int().optional(),
  isPhantom: z.boolean().optional().default(false),
});

const CoProductInput = z.object({
  coProductItemId: z.string().uuid(),
  quantity: z.coerce.number().positive().finite(),
  uom: z.string().trim().min(1).max(32),
  allocationPct: z.coerce.number().min(0).max(100),
  isByproduct: z.boolean().optional().default(false),
});

export const CreateBomDraftInput = z.object({
  // The owning FG product_code (route :itemCode). Becomes bom_headers.product_id.
  productId: z.string().trim().min(1).max(128),
  // Parent (the FG itself) cost allocation share; non-byproduct lines+co-products
  // + this must sum to 100 (V-TEC-12).
  parentAllocationPct: z.coerce.number().min(0).max(100).optional().default(100),
  yieldPct: z.coerce.number().positive().max(100).optional().default(100),
  effectiveFrom: z.string().optional(),
  notes: z.string().trim().max(2000).optional(),
  lines: z.array(LineInput).min(1),
  coProducts: z.array(CoProductInput).optional().default([]),
});
export type CreateBomDraftInputType = z.input<typeof CreateBomDraftInput>;

export type CreateBomDraftResult =
  | { ok: true; data: { id: string; version: number; warnings: BomValidationCode[] } }
  | { ok: false; error: BomActionError; code?: BomValidationCode; message?: string; rmUsabilityFailures?: BomRmUsabilityFailure[] };

export type BomRmUsabilityFailure = {
  componentCode: string;
  itemId: string | null;
  reasons: RmUsabilityReasonCode[];
};

export type BomLineUsabilityInput = {
  itemId?: string | null;
  componentCode: string;
};

type ItemUsabilityRow = {
  id: string;
  status: string;
  updated_at: string | Date | null;
};

type SupplierSpecUsabilityRow = {
  supplier_code: string;
  supplier_status: string;
  lifecycle_status: string;
  review_status: string;
  effective_from: string | Date | null;
  expiry_date: string | Date | null;
  cost_review_blocked: boolean;
  spec_review_blocked: boolean;
  updated_at: string | Date | null;
};

export async function validateBomLineRmUsability(
  c: QueryClient,
  lines: readonly BomLineUsabilityInput[],
  context: RmUsabilityContext,
): Promise<BomRmUsabilityFailure[]> {
  const failures: BomRmUsabilityFailure[] = [];

  for (const line of lines) {
    const { rows: itemRows } = await c.query<ItemUsabilityRow>(
      line.itemId
        ? `select id, status, updated_at from public.items where org_id = app.current_org_id() and id = $1::uuid`
        : `select id, status, updated_at from public.items where org_id = app.current_org_id() and item_code = $1`,
      [line.itemId ?? line.componentCode],
    );
    const itemRow = itemRows[0] ?? null;

    const { rows: specRows } = itemRow
      ? await c.query<SupplierSpecUsabilityRow>(
          `select supplier_code, supplier_status, lifecycle_status, review_status,
                  effective_from, expiry_date, cost_review_blocked, spec_review_blocked, updated_at
             from public.supplier_specs
            where org_id = app.current_org_id()
              and item_id = $1::uuid
            order by updated_at desc
            limit 1`,
          [itemRow.id],
        )
      : { rows: [] };
    const specRow = specRows[0] ?? null;
    const supplier: RmSupplierSpecInput | null = specRow
      ? {
          supplierCode: specRow.supplier_code,
          supplierStatus: specRow.supplier_status,
          lifecycleStatus: specRow.lifecycle_status,
          reviewStatus: specRow.review_status,
          effectiveFrom: toIso(specRow.effective_from),
          expiryDate: toIso(specRow.expiry_date),
          costReviewBlocked: specRow.cost_review_blocked,
          specReviewBlocked: specRow.spec_review_blocked,
          updatedAt: toIso(specRow.updated_at),
        }
      : null;

    const { rows: allergenRows } = itemRow
      ? await c.query<{ allergen_code: string; intensity: string }>(
          `select allergen_code, intensity from public.item_allergen_profiles where org_id = app.current_org_id() and item_id = $1::uuid`,
          [itemRow.id],
        )
      : { rows: [] };
    const rmAllergens: RmAllergenInput[] = allergenRows.map((row) => ({
      allergenCode: row.allergen_code,
      intensity: row.intensity,
    }));

    const verdict = validateRmUsability({
      context,
      item: itemRow ? { id: itemRow.id, status: itemRow.status, updatedAt: toIso(itemRow.updated_at) } : null,
      supplier,
      rmAllergens,
      targetFgForbiddenAllergens: [],
      qcRelease: { required: false },
    });

    if (!verdict.usable) {
      failures.push({
        componentCode: line.componentCode,
        itemId: itemRow?.id ?? line.itemId ?? null,
        reasons: verdict.blockingReasons,
      });
    }
  }

  return failures;
}

export function formatRmUsabilityFailures(failures: readonly BomRmUsabilityFailure[]): string {
  return failures.map((failure) => `${failure.componentCode}: ${failure.reasons.join(', ')}`).join('; ');
}

function toIso(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

// ── Approve / publish input (T-014) ───────────────────────────────────────────
export const BomVersionRefInput = z.object({
  productId: z.string().trim().min(1).max(128),
  version: z.coerce.number().int().positive(),
});
export type BomVersionRefInputType = z.input<typeof BomVersionRefInput>;

export type BomWorkflowResult =
  | { ok: true; data: { id: string; status: BomStatus; version: number } }
  | { ok: false; error: BomActionError; code?: BomValidationCode; message?: string; rmUsabilityFailures?: BomRmUsabilityFailure[] };

// ── Diff input (T-015) ────────────────────────────────────────────────────────
export const BomDiffInput = z.object({
  productId: z.string().trim().min(1).max(128),
  from: z.coerce.number().int().positive(),
  to: z.coerce.number().int().positive(),
});
export type BomDiffInputType = z.input<typeof BomDiffInput>;

// ── Generator input (T-016) ───────────────────────────────────────────────────
export const BomGeneratorInput = z.object({
  scope: z.enum(GENERATOR_SCOPES).optional().default('all_complete'),
  outputMode: z.enum(GENERATOR_OUTPUT_MODES).optional().default('per_fg'),
  // For scope='selected': explicit FG product_codes (still V-TEC-15 filtered).
  productCodes: z.array(z.string().trim().min(1).max(128)).optional(),
});
export type BomGeneratorInputType = z.input<typeof BomGeneratorInput>;

export type BomGeneratorResult =
  | { ok: true; data: { jobId: string; expectedCount: number; productCodes: string[] } }
  | { ok: false; error: BomActionError; code?: BomValidationCode; message?: string };

// ── RBAC helper (org-scoped under RLS; checks normalized + legacy jsonb cache) ──
export async function hasPermission(ctx: OrgActionContext, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}

export function isPgError(err: unknown): err is { code: string; message?: string } {
  return typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string';
}

export async function writeAudit(
  client: QueryClient,
  params: {
    orgId: string;
    actorUserId: string;
    action: string;
    resourceId: string;
    beforeState: unknown;
    afterState: unknown;
  },
): Promise<void> {
  await client.query(
    `insert into public.audit_log
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
     values ($1::uuid, $2::uuid, 'user', $3, 'bom', $4, $5::jsonb, $6::jsonb, 'standard')`,
    [
      params.orgId,
      params.actorUserId,
      params.action,
      params.resourceId,
      JSON.stringify(params.beforeState),
      JSON.stringify(params.afterState),
    ],
  );
}

export async function writeOutbox(
  client: QueryClient,
  params: { orgId: string; eventType: string; aggregateType: string; aggregateId: string; payload: unknown },
): Promise<void> {
  await client.query(
    `insert into public.outbox_events
       (org_id, event_type, aggregate_type, aggregate_id, payload, app_version)
     values ($1::uuid, $2, $3, $4::uuid, $5::jsonb, $6)`,
    [
      params.orgId,
      params.eventType,
      params.aggregateType,
      params.aggregateId,
      JSON.stringify(params.payload),
      APP_VERSION,
    ],
  );
}

// ── Row mappers (detail shape matches snapshot_json contract) ─────────────────
type HeaderRow = {
  id: string;
  product_id: string | null;
  npd_project_id: string | null;
  fa_code: string | null;
  origin_module: string;
  status: string;
  version: number;
  supersedes_bom_header_id: string | null;
  yield_pct: string;
  effective_from: string | Date;
  effective_to: string | Date | null;
  approved_by: string | null;
  approved_at: string | Date | null;
  notes: string | null;
};

export function mapHeader(row: HeaderRow): BomHeaderView {
  return {
    id: String(row.id),
    productId: row.product_id,
    npdProjectId: row.npd_project_id,
    faCode: row.fa_code,
    originModule: row.origin_module,
    status: row.status as BomStatus,
    version: Number(row.version),
    supersedesBomHeaderId: row.supersedes_bom_header_id,
    yieldPct: String(row.yield_pct),
    effectiveFrom: row.effective_from instanceof Date ? row.effective_from.toISOString().slice(0, 10) : String(row.effective_from),
    effectiveTo: row.effective_to == null ? null : row.effective_to instanceof Date ? row.effective_to.toISOString().slice(0, 10) : String(row.effective_to),
    approvedBy: row.approved_by,
    approvedAt: row.approved_at == null ? null : row.approved_at instanceof Date ? row.approved_at.toISOString() : String(row.approved_at),
    notes: row.notes,
  };
}

type LineRow = {
  id: string;
  line_no: number;
  item_id: string | null;
  component_code: string;
  component_type: string | null;
  quantity: string;
  uom: string;
  scrap_pct: string;
  manufacturing_operation_name: string | null;
  sequence: number | null;
  is_phantom: boolean;
};

export function mapLine(row: LineRow): BomLineView {
  return {
    id: String(row.id),
    lineNo: Number(row.line_no),
    itemId: row.item_id,
    componentCode: row.component_code,
    componentType: row.component_type,
    quantity: String(row.quantity),
    uom: row.uom,
    scrapPct: String(row.scrap_pct),
    manufacturingOperationName: row.manufacturing_operation_name,
    sequence: row.sequence == null ? null : Number(row.sequence),
    isPhantom: Boolean(row.is_phantom),
  };
}

type CoProductRow = {
  id: string;
  co_product_item_id: string;
  quantity: string;
  uom: string;
  allocation_pct: string;
  is_byproduct: boolean;
};

export function mapCoProduct(row: CoProductRow): BomCoProductView {
  return {
    id: String(row.id),
    coProductItemId: String(row.co_product_item_id),
    quantity: String(row.quantity),
    uom: row.uom,
    allocationPct: String(row.allocation_pct),
    isByproduct: Boolean(row.is_byproduct),
  };
}
