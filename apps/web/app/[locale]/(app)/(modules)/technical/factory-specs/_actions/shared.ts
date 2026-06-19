/**
 * T-060 — 03-technical Factory Specs (TEC-085 review modal + TEC-086 list):
 * shared types, the RBAC permission strings and the permission-check helper used
 * by the list + bundle-data Server Actions.
 *
 * Plain (non-`'use server'`) module so it can export non-async values (types, the
 * permission helper). Mirrors the items master `_actions/shared.ts` split.
 *
 * Schema authority: packages/db/migrations/165-factory-specs.sql (factory_specs),
 * 090-shared-bom-ssot-npd-origin.sql (bom_headers), 125-factory-release-status.sql,
 * 153-items-master.sql (items). The release lifecycle types come from the canonical
 * release-state-adapters (T-081) so the UI never invents a competing release enum.
 *
 * Red lines honoured here:
 *  - factory_specs / internal_product_spec is the backing store — NOT a generic
 *    reference_tables.specifications table.
 *  - FG canonical (no FA-* identifiers).
 *  - D365 is integration-only — d365_item_id is a TEXT soft reference, never a key.
 */

import {
  type FactorySpecStatus,
  FACTORY_SPEC_STATUSES,
} from '../../../../../../../lib/technical/release-state-adapters';

// ── RBAC permission strings (packages/rbac/src/permissions.enum.ts) ───────────
// The bundle = factory_spec (internal product spec) + its BOM version. The
// product-spec approval string is the workflow-authorization permission seeded to
// the org-admin family by migration 154 (same string the bundle SERVICE checks in
// release-bundle-service.ts). The page CHECK string MUST byte-match that GRANT.
export const FACTORY_SPEC_APPROVE_PERMISSION = 'technical.product_spec.approve';
export const FACTORY_SPEC_APPROVE_PERMISSION_ALT = 'technical.factory_spec.approve';
// R4-CL2 — gating string for the "Recall to draft" affordance (byte-matches the
// permission recallFactorySpec() checks server-side in _actions/recall-spec.ts).
export const FACTORY_SPEC_RECALL_PERMISSION = 'technical.factory_spec.recall';

export type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type OrgActionContext = { userId: string; orgId: string; client: QueryClient };

export { FACTORY_SPEC_STATUSES };
export type { FactorySpecStatus };

/** A factory_spec row joined to its FG item + paired BOM, for the list + review modal. */
export type FactorySpecListItem = {
  id: string;
  specCode: string;
  version: number;
  status: FactorySpecStatus;
  source: string;
  /** FG item master. */
  fgItemId: string;
  fgItemCode: string;
  fgName: string;
  productGroup: string | null;
  shelfLifeDays: number | null;
  /** Paired shared-BOM SSOT version (soft ref). */
  bomHeaderId: string | null;
  bomVersion: number | null;
  bomStatus: string | null;
  d365ItemId: string | null;
  updatedAt: string;
};

/**
 * RBAC helper — resolves a permission for the caller, org-scoped under RLS.
 * Checks BOTH the normalized role_permissions table AND the legacy roles.permissions
 * jsonb cache (migration 154 writes both). Mirrors items `hasPermission()`.
 */
export async function hasPermission(ctx: OrgActionContext, permission: string): Promise<boolean> {
  const { rows } = await ctx.client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (rp.permission is not null or coalesce(r.permissions, '[]'::jsonb) ? $3)
      limit 1`,
    [ctx.userId, ctx.orgId, permission],
  );
  return rows.length > 0;
}

/** True when the caller may approve a factory_spec for factory use (either grant string). */
export async function canApproveFactorySpec(ctx: OrgActionContext): Promise<boolean> {
  const [primary, alt] = await Promise.all([
    hasPermission(ctx, FACTORY_SPEC_APPROVE_PERMISSION),
    hasPermission(ctx, FACTORY_SPEC_APPROVE_PERMISSION_ALT),
  ]);
  return primary || alt;
}

/** R4-CL2 — True when the caller may recall a released factory_spec back to draft. */
export async function canRecallFactorySpec(ctx: OrgActionContext): Promise<boolean> {
  return hasPermission(ctx, FACTORY_SPEC_RECALL_PERMISSION);
}

const STATUS_SET = new Set<FactorySpecStatus>(FACTORY_SPEC_STATUSES);

export function isFactorySpecStatus(value: string): value is FactorySpecStatus {
  return STATUS_SET.has(value as FactorySpecStatus);
}
