/**
 * Lane A — 03-technical Items Master CRUD: shared zod schemas, types and the
 * RBAC permission-check helper used by the create / update / deactivate /
 * list Server Actions.
 *
 * This is a plain (non-`'use server'`) module so it may export non-async values
 * (zod schemas, types, the permission helper). The `'use server'` action files
 * import from here. Mirrors the FA actions' `errors.ts` split and the settings
 * units `_actions/manage-units.ts` validation conventions.
 *
 * Schema authority: packages/db/migrations/153-items-master.sql +
 * packages/db/schema/items.ts. Every enum / NUMERIC precision / length below is
 * copied 1:1 from the table's CHECK constraints so a client never relies on the
 * DB to reject a clearly-invalid value.
 *
 * RBAC: the `technical.items.*` family is seeded to the org-admin role family by
 * migration 154 (`seed_technical_permissions_for_org`). The deployed admin is on
 * `org.access.admin`, which migration 154 grants — so the gate resolves for it.
 */

import { z } from 'zod';
import { hasPermission } from '../../../../../../../lib/auth/has-permission';

export { hasPermission };

import { CostPerKgInput } from '../../cost/_actions/shared';

// ── RBAC permission strings (packages/rbac/src/permissions.enum.ts) ───────────
export const ITEMS_CREATE_PERMISSION = 'technical.items.create';
export const ITEMS_EDIT_PERMISSION = 'technical.items.edit';
export const ITEMS_DEACTIVATE_PERMISSION = 'technical.items.deactivate';

export const APP_VERSION = 'technical-items-v1';

// ── Enums (mirror items_*_check CHECK constraints in migration 153) ───────────
// 'ingredient' (ING) behaves like a raw material in production/BOMs but is
// classified + accounted separately from 'rm'. See migration 247.
export const ITEM_TYPES = ['rm', 'ingredient', 'intermediate', 'fg', 'co_product', 'byproduct', 'packaging'] as const;
export const ITEM_STATUSES = ['draft', 'active', 'deprecated', 'blocked'] as const;
export const WEIGHT_MODES = ['fixed', 'catch'] as const;
export const SHELF_LIFE_MODES = ['use_by', 'best_before'] as const;
const GS1_GTIN_RE = /^(?:\d{8}|\d{12}|\d{13}|\d{14})$/;

// ── UOM pack-hierarchy (migration 267) ────────────────────────────────────────
// LOCKED product decision: every item declares a pack hierarchy on the item
// master — a base UoM drawn from a CLOSED canonical list (replacing the free-text
// uom_base field that let "eac" through), an output unit Planning orders WOs in,
// and the conversion factors that map output → base.
//
// CANONICAL_UOMS is the closed list for uom_base / uom_secondary; no free text.
// 'szt' = Polish "sztuka" (each/piece) — kept as the storage value for parity
// with the existing Polish-facing data; the EN label surfaces "pcs (each)".
export const CANONICAL_UOMS = ['kg', 'g', 'l', 'ml', 'szt'] as const;
export type CanonicalUom = (typeof CANONICAL_UOMS)[number];

// output_uom text 'base'|'each'|'box' default 'base' (migration 267).
export const OUTPUT_UOMS = ['base', 'each', 'box'] as const;
export type OutputUom = (typeof OUTPUT_UOMS)[number];

export type ItemType = (typeof ITEM_TYPES)[number];
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export type WeightMode = (typeof WEIGHT_MODES)[number];

export type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type OrgActionContext = { userId: string; orgId: string; client: QueryClient };

export type ItemsActionError =
  | 'invalid_input'
  | 'forbidden'
  | 'already_exists'
  | 'not_found'
  | 'persistence_failed'
  | 'invalid_category';

const OptionalNumeric = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.coerce.number().nonnegative().optional(),
);
// Positive numeric ('' / undefined ⇒ undefined). Used for net_qty_per_each — a
// physical quantity in the base UoM that must be > 0 when supplied.
const OptionalPositiveNumeric = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.coerce.number().positive().optional(),
);
// Positive integer for each_per_box / boxes_per_pallet ('' / undefined ⇒ undefined).
const OptionalPositiveInt = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.coerce.number().int().positive().optional(),
);

// ── Pack hierarchy (migration 267) — shared zod shape + cross-field rule ───────
// Column contract (public.items, migration 267):
//   output_uom        text 'base'|'each'|'box' default 'base'
//   net_qty_per_each  numeric (in uom_base; required when output_uom != 'base')
//   each_per_box      int     (required when output_uom = 'box')
//   boxes_per_pallet  int     (optional)
export const PackHierarchyShape = {
  outputUom: z.enum(OUTPUT_UOMS).optional().default('base'),
  netQtyPerEach: OptionalPositiveNumeric,
  eachPerBox: OptionalPositiveInt,
  boxesPerPallet: OptionalPositiveInt,
} as const;

/**
 * Mirrors the DB CHECK constraints (migration 267) client-/server-side so a
 * payload is rejected before it ever reaches Postgres:
 *   - each ⇒ net_qty_per_each > 0
 *   - box  ⇒ net_qty_per_each > 0 AND each_per_box > 0
 * Applied via `.superRefine` on both Create and Update inputs.
 */
export function refinePackHierarchy(
  value: { outputUom?: OutputUom; netQtyPerEach?: number; eachPerBox?: number },
  ctx: z.RefinementCtx,
): void {
  const output = value.outputUom ?? 'base';
  if (output === 'each' || output === 'box') {
    if (value.netQtyPerEach === undefined || !(value.netQtyPerEach > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['netQtyPerEach'],
        message: 'net_qty_per_each is required (> 0) when output_uom is "each" or "box"',
      });
    }
  }
  if (output === 'box') {
    if (value.eachPerBox === undefined || !(value.eachPerBox > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['eachPerBox'],
        message: 'each_per_box is required (> 0) when output_uom is "box"',
      });
    }
  }
}
const OptionalGs1Gtin = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().regex(GS1_GTIN_RE, 'gs1_gtin must be 8, 12, 13, or 14 digits').optional(),
);

// ── List row shape returned to the page ───────────────────────────────────────
export type ItemListItem = {
  id: string;
  itemCode: string;
  name: string;
  itemType: ItemType;
  status: ItemStatus;
  description: string | null;
  productGroup: string | null;
  categoryCode: string | null;
  uomBase: string;
  uomSecondary: string | null;
  gs1Gtin: string | null;
  weightMode: WeightMode;
  nominalWeight: string | null;
  tareWeight: string | null;
  grossWeightMax: string | null;
  varianceTolerancePct: string | null;
  shelfLifeDays: number | null;
  shelfLifeMode: string | null;
  // Pack hierarchy (migration 267).
  outputUom: OutputUom;
  netQtyPerEach: string | null;
  eachPerBox: number | null;
  boxesPerPallet: number | null;
  costPerKg: string | null;
  listPriceGbp: string | null;
  updatedAt: string;
  /** Declared allergen names from item_allergen_profiles (empty when none). */
  allergens: string[];
  /** Count of BOM headers where this item is the product. */
  bomCount: number;
  /** D365 sync status (null when never synced). */
  d365SyncStatus: string | null;
};

// ── Create input ──────────────────────────────────────────────────────────────
// item_code unique per (org_id, item_code). The required L3 fields are the
// NOT-NULL columns without a default: item_code, item_type, name, uom_base.
export const CreateItemInput = z
  .object({
    itemCode: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9._-]+$/, 'item_code must be alphanumeric with . _ - separators'),
    name: z.string().trim().min(1).max(256),
    itemType: z.enum(ITEM_TYPES),
    status: z.enum(ITEM_STATUSES).optional().default('active'),
    // Closed canonical list (migration 267) — no free text. Rejects the "eac" bug.
    uomBase: z.enum(CANONICAL_UOMS),
    weightMode: z.enum(WEIGHT_MODES).optional().default('fixed'),
    description: z.string().trim().max(2000).optional(),
    productGroup: z.string().trim().max(128).optional(),
    categoryCode: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string().trim().min(1).max(64).optional(),
    ),
    supplierCode: z.string().trim().min(1).optional(),
    supplierUnitPrice: OptionalNumeric,
    // '' (the empty option) ⇒ undefined; otherwise must be canonical.
    uomSecondary: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.enum(CANONICAL_UOMS).optional(),
    ),
    gs1Gtin: OptionalGs1Gtin,
    nominalWeight: OptionalNumeric,
    tareWeight: OptionalNumeric,
    grossWeightMax: OptionalNumeric,
    // Cost writes must go through item_cost_history; keep decimal strings exact.
    costPerKg: CostPerKgInput.optional(),
    listPriceGbp: OptionalNumeric,
    // numeric(5,2) in [0,100]
    varianceTolerancePct: z.coerce.number().min(0).max(100).optional(),
    shelfLifeDays: z.coerce.number().int().nonnegative().optional(),
    shelfLifeMode: z.enum(SHELF_LIFE_MODES).optional(),
    ...PackHierarchyShape,
  })
  .superRefine(refinePackHierarchy);
export type CreateItemInputType = z.input<typeof CreateItemInput>;

export type CreateItemResult =
  | { ok: true; data: { id: string; itemCode: string } }
  | { ok: false; error: ItemsActionError; message?: string };

// ── Update input ──────────────────────────────────────────────────────────────
// item_code is immutable here (it is the org-scoped natural key); update mutates
// the descriptive + commercial attributes only.
export const UpdateItemInput = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(256),
    itemType: z.enum(ITEM_TYPES),
    status: z.enum(ITEM_STATUSES),
    uomBase: z.enum(CANONICAL_UOMS),
    weightMode: z.enum(WEIGHT_MODES),
    description: z.string().trim().max(2000).optional(),
    productGroup: z.string().trim().max(128).optional(),
    categoryCode: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string().trim().min(1).max(64).optional(),
    ),
    uomSecondary: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.enum(CANONICAL_UOMS).optional(),
    ),
    gs1Gtin: OptionalGs1Gtin,
    nominalWeight: OptionalNumeric,
    tareWeight: OptionalNumeric,
    grossWeightMax: OptionalNumeric,
    // Accepted for legacy callers/import payloads, but updateItem never writes cost.
    costPerKg: CostPerKgInput.optional(),
    listPriceGbp: OptionalNumeric,
    varianceTolerancePct: z.coerce.number().min(0).max(100).optional(),
    shelfLifeDays: z.coerce.number().int().nonnegative().optional(),
    shelfLifeMode: z.enum(SHELF_LIFE_MODES).optional(),
    ...PackHierarchyShape,
  })
  .superRefine(refinePackHierarchy);
export type UpdateItemInputType = z.input<typeof UpdateItemInput>;

export type UpdateItemResult =
  | { ok: true; data: { id: string } }
  | { ok: false; error: ItemsActionError; message?: string };

// ── Deactivate input ──────────────────────────────────────────────────────────
// "Deactivate" = move status to 'blocked' (the closest non-destructive lifecycle
// terminal in items_status_check; the table has no soft-delete column). Idempotent.
//
// TEC-081 / V-TEC-05: a deactivation carries a `reason` (Discontinued / Recipe
// Change / D365 Mismatch / Other) plus optional free-text `notes` (required when
// reason = 'other'). Both are recorded in audit_log.after_state — they do NOT add
// a column to public.items (no migration). `reason`/`notes` are OPTIONAL on the
// schema for back-compat with the existing one-arg callers, but the UI always
// supplies a reason and the cross-field rule below enforces notes-on-other.
export const DEACTIVATE_REASONS = ['discontinued', 'recipe_change', 'd365_mismatch', 'other'] as const;
export type DeactivateReason = (typeof DEACTIVATE_REASONS)[number];

export const DeactivateItemInput = z
  .object({
    id: z.string().uuid(),
    reason: z.enum(DEACTIVATE_REASONS).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((value) => value.reason !== 'other' || (value.notes?.length ?? 0) >= 10, {
    path: ['notes'],
    message: 'notes is required (min 10 chars) when reason is "other"',
  });
export type DeactivateItemInputType = z.input<typeof DeactivateItemInput>;

export type DeactivateItemResult =
  | { ok: true; data: { id: string; status: ItemStatus } }
  | { ok: false; error: ItemsActionError; message?: string };

// ── Status transition (Wave 8b Lane IA — audit finding #8) ────────────────────
// items born 'draft' (e.g. via import or NPD handoff) previously had NO UI path
// to 'active'. transitionItemStatus moves an item along the explicit lifecycle
// below. 'blocked' stays owned by the deactivate flow (TEC-081, reason+confirm);
// nothing ever returns to 'draft'.
//
//   draft      → active      (Activate)
//   active     → deprecated  (Deprecate)
//   deprecated → active      (Reactivate)
export const TRANSITION_TARGETS = ['active', 'deprecated'] as const;
export type TransitionTarget = (typeof TRANSITION_TARGETS)[number];

const ALLOWED_STATUS_TRANSITIONS: ReadonlyArray<readonly [ItemStatus, TransitionTarget]> = [
  ['draft', 'active'],
  ['active', 'deprecated'],
  ['deprecated', 'active'],
];

export function isAllowedStatusTransition(from: string, to: string): boolean {
  return ALLOWED_STATUS_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export const TransitionItemStatusInput = z.object({
  id: z.string().uuid(),
  toStatus: z.enum(TRANSITION_TARGETS),
});
export type TransitionItemStatusInputType = z.input<typeof TransitionItemStatusInput>;

export type TransitionItemStatusError =
  | ItemsActionError
  // current → toStatus is not in ALLOWED_STATUS_TRANSITIONS (e.g. blocked → active)
  | 'invalid_transition'
  // draft → active data gate failed (non-canonical uom_base on a legacy row)
  | 'activation_gate_failed';

export type TransitionItemStatusResult =
  | { ok: true; data: { id: string; status: ItemStatus } }
  | { ok: false; error: TransitionItemStatusError; message?: string };

export function isPgError(err: unknown): err is { code: string } {
  return typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string';
}

// audit_log.action has no enum constraint (unlike outbox_events.event_type, whose
// CHECK has no item.* member). We therefore record items writes in audit_log only;
// adding outbox item.* events would require extending the outbox enum SoT
// (packages/outbox/src/events.enum.ts) + its drift gate — out of scope for Lane A.
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
     values ($1::uuid, $2::uuid, 'user', $3, 'item', $4, $5::jsonb, $6::jsonb, 'standard')`,
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
