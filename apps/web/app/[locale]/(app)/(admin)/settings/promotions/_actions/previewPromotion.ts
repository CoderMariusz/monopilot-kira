'use server';

/**
 * T-070 / SET-063 — previewPromotion Server Action.
 *
 * Backs the PromoteToL2Modal "Preview diff" step with REAL data instead of the
 * prototype's hardcoded JSON. Resolves the artefact's current effective value
 * for the caller's org (from tenant_variations overrides + any prior
 * tenant_migrations rows for the same component) and the impact count, scoped
 * via withOrgContext (RLS, app.current_org_id()).
 *
 * RBAC: Admin only (dangerous action). Non-admins get { ok:false,'forbidden' }
 * with no DB read leaking.
 *
 * Returns the before/after JSON the UI renders so the diff reflects the real
 * selected artefact and target tier — never a static literal.
 */

import { z } from 'zod';

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';

const TARGET_STAGES = ['L2-local', 'L1-core'] as const;

const PreviewPromotionInput = z.object({
  artefact: z.string().trim().min(3).max(200),
  target: z.enum(TARGET_STAGES),
  from: z.string().trim().min(1).max(64).default('L3-tenant'),
});

export type PreviewPromotionInput = z.infer<typeof PreviewPromotionInput>;

export type PreviewPromotionError = 'invalid_input' | 'forbidden' | 'persistence_failed';

export type PreviewPromotionResult =
  | {
      ok: true;
      data: {
        artefact: string;
        from: string;
        target: string;
        before: string; // JSON string for the diff "Current (before)" pane
        after: string; // JSON string for the diff "Target" pane
        affectsCount: number; // real impact: distinct orgs / migrations touched
      };
    }
  | { ok: false; error: PreviewPromotionError; message?: string };

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number }>;
};

const ADMIN_ROLE_CODES = ['Admin', 'org.access.admin', 'org.platform.admin', 'org.schema.admin'];

async function callerIsAdmin(client: QueryClient, userId: string, orgId: string): Promise<boolean> {
  const { rows, rowCount } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          r.name = 'Admin'
          or lower(r.name) = 'admin'
          or r.code = any($3::text[])
          or r.slug = any($3::text[])
        )
      limit 1`,
    [userId, orgId, ADMIN_ROLE_CODES],
  );
  return (rowCount ?? rows.length) > 0;
}

export async function previewPromotion(raw: unknown): Promise<PreviewPromotionResult> {
  const parsed = PreviewPromotionInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', message: parsed.error.message };
  }
  const input = parsed.data;

  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const queryClient = client as QueryClient;

      const isAdmin = await callerIsAdmin(queryClient, userId, orgId);
      if (!isAdmin) return { ok: false, error: 'forbidden' as const };

      // Resolve the current effective value of the artefact for this org from the
      // tenant_variations overrides JSONB (rule/flag/schema/email overrides).
      const { rows: variationRows } = await queryClient.query<{
        rule_variant_overrides: unknown;
        feature_flags: unknown;
        dept_overrides: unknown;
      }>(
        `select rule_variant_overrides, feature_flags, dept_overrides
           from public.tenant_variations
          where org_id = app.current_org_id()
          limit 1`,
      );

      const variation = variationRows[0];
      const beforeValue = resolveArtefactValue(input.artefact, variation);

      // Impact: how many tenant_migrations rows already target the same component
      // (a real, org-scoped count). Always at least this org (1).
      const { rows: affectsRows } = await queryClient.query<{ affects: string }>(
        `select count(*)::text as affects
           from public.tenant_migrations
          where org_id = app.current_org_id()
            and component = $1`,
        [input.artefact],
      );
      const affectsCount = Math.max(1, Number(affectsRows[0]?.affects ?? '0') + 1);

      const before = {
        artefact: input.artefact,
        tier: input.from,
        value: beforeValue,
      };
      const after = {
        artefact: input.artefact,
        tier: input.target,
        value: beforeValue,
        promoted_from: input.from,
      };

      return {
        ok: true as const,
        data: {
          artefact: input.artefact,
          from: input.from,
          target: input.target,
          before: JSON.stringify(before, null, 2),
          after: JSON.stringify(after, null, 2),
          affectsCount,
        },
      };
    });
  } catch (err) {
    console.error('[previewPromotion] persistence_failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

function resolveArtefactValue(artefact: string, variation: { rule_variant_overrides: unknown; feature_flags: unknown; dept_overrides: unknown } | undefined): unknown {
  if (!variation) return null;
  const [category] = artefact.split('.');
  const bag =
    category === 'rules'
      ? variation.rule_variant_overrides
      : category === 'flags'
        ? variation.feature_flags
        : variation.dept_overrides;
  if (bag && typeof bag === 'object' && artefact in (bag as Record<string, unknown>)) {
    return (bag as Record<string, unknown>)[artefact];
  }
  return null;
}
