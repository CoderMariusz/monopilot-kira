/**
 * 03-technical — Allergen domain (T-017 / T-018 / T-019 / T-024): shared zod
 * schemas, types, the RBAC permission helper and the audit-log writer used by
 * the allergen-profile, manufacturing-operation-addition, contamination-risk
 * and cascade services.
 *
 * Plain (non-`'use server'`) module so it may export schemas / types / helpers.
 *
 * Schema authority: packages/db/migrations/161-allergen-tables.sql (every enum /
 * CHECK below is copied 1:1 from the table constraints) + the EU-14 allergen
 * reference in "Reference"."Allergens" (migration 082). RBAC: the
 * `technical.allergens.edit` string is seeded to the org-admin role family by
 * migration 154 (mirrors the items master family).
 */

import { z } from 'zod';

// ── RBAC permission string (packages/rbac/src/permissions.enum.ts) ────────────
export const ALLERGENS_EDIT_PERMISSION = 'technical.allergens.edit';

export const APP_VERSION = 'technical-allergens-v1';

// ── Enums (mirror migration 161 CHECK constraints) ────────────────────────────
// item_allergen_profiles.source
export const PROFILE_SOURCES = [
  'brief_declared',
  'supplier_spec',
  'lab_result',
  'cascaded',
  'manual_override',
] as const;
// item_allergen_profiles.intensity / overrides.intensity
export const INTENSITIES = ['contains', 'may_contain', 'trace'] as const;
// item_allergen_profiles.confidence / overrides.confidence
export const CONFIDENCES = ['declared', 'tested', 'assumed'] as const;
// item_allergen_profile_overrides.action
export const OVERRIDE_ACTIONS = ['set', 'clear', 'adjust_intensity', 'adjust_confidence'] as const;
// allergen_contamination_risk.risk_level
export const RISK_LEVELS = ['high', 'medium', 'low', 'segregated'] as const;

export type ProfileSource = (typeof PROFILE_SOURCES)[number];
export type Intensity = (typeof INTENSITIES)[number];
export type Confidence = (typeof CONFIDENCES)[number];
export type RiskLevel = (typeof RISK_LEVELS)[number];

// ── Minimal query-client shape (mirrors the items master shared module) ───────
export type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type OrgActionContext = { userId: string; orgId: string; client: QueryClient };

// ── Closed error set (never leak DB state) ────────────────────────────────────
export type AllergenActionError =
  | 'invalid_input'
  | 'forbidden'
  | 'not_found'
  | 'invalid_allergen_code' // V-TEC-40
  | 'override_reason_required' // V-TEC-42
  | 'invalid_manufacturing_operation' // V-TEC-63
  | 'persistence_failed';

export type AllergenResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AllergenActionError; message?: string };

// ── RBAC helper — resolves a permission for the caller, org-scoped under RLS ───
// Checks BOTH the normalized role_permissions table AND the legacy
// roles.permissions jsonb cache (mirrors items master hasPermission()).
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

export function isPgError(err: unknown): err is { code: string } {
  return typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string';
}

// ── audit_log writer (resource_type discriminates the allergen surface) ───────
// audit_log.action has no enum constraint; we record allergen writes with the
// canonical action labels from the task spec
// (allergen.create / .update / .override / .delete, manufacturing_op.allergen.*,
//  contamination_risk.*).
export async function writeAudit(
  client: QueryClient,
  params: {
    orgId: string;
    actorUserId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    beforeState: unknown;
    afterState: unknown;
  },
): Promise<void> {
  await client.query(
    `insert into public.audit_log
       (org_id, actor_user_id, actor_type, action, resource_type, resource_id, before_state, after_state, retention_class)
     values ($1::uuid, $2::uuid, 'user', $3, $4, $5, $6::jsonb, $7::jsonb, 'standard')`,
    [
      params.orgId,
      params.actorUserId,
      params.action,
      params.resourceType,
      params.resourceId,
      JSON.stringify(params.beforeState),
      JSON.stringify(params.afterState),
    ],
  );
}

// ── Allergen-code reference guard (V-TEC-40 / ADR-028) ────────────────────────
// allergen_code is a soft reference (TEXT, no hard FK). It must resolve to a row
// in "Reference"."Allergens" for the caller's org (EU-14 seed + org custom).
export async function allergenCodeExists(ctx: OrgActionContext, allergenCode: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from "Reference"."Allergens"
      where org_id = $1::uuid and allergen_code = $2
      limit 1`,
    [ctx.orgId, allergenCode],
  );
  return rows.length > 0;
}

// ── Manufacturing-operation reference guard (V-TEC-63) ────────────────────────
// manufacturing_operation_name is a soft reference to
// "Reference"."ManufacturingOperations".operation_name (migration 012). It must
// resolve to an active row for the caller's org.
export async function manufacturingOperationExists(
  ctx: OrgActionContext,
  operationName: string,
): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from "Reference"."ManufacturingOperations"
      where org_id = $1::uuid and operation_name = $2 and is_active = true
      limit 1`,
    [ctx.orgId, operationName],
  );
  return rows.length > 0;
}
