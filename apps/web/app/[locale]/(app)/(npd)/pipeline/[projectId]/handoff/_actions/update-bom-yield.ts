'use server';

/**
 * NPD HANDOFF stage — `updateBomYield` write Server Action.
 *
 * Sets the target (actual) yield % on the production BOM that was just auto-built
 * by `promoteToProduction`. This powers the inline "Actual yield % for this
 * product" prompt shown on the handoff screen when the promote result reports
 * `yieldPromptRequired === true` (the recipe had no target yield).
 *
 * Org-scoped via withOrgContext → RLS with app.current_org_id(). RBAC gate =
 * `npd.handoff.promote` (BYTE-IDENTICAL to the seeded permission string in
 * migration 236, the SAME gate the promote action uses) via the shared dual-store
 * `hasHandoffPermission` probe (normalized role_permissions OR legacy
 * roles.permissions jsonb cache).
 *
 * Only a draft/technical_approved header, or an NPD handoff BOM still in the promote
 * yield-correction window (pre-promote, or post-promote while yield_pct is still unset),
 * may be updated in place. A long-lived ACTIVE production BOM must go through ECO / a
 * new version instead.
 * audit_events row.
 *
 * A 'use server' module may export ONLY async functions; the zod schema +
 * error/result types live in the non-'use server' sibling `./update-bom-yield-types`.
 */

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import { hasHandoffPermission } from './get-handoff';
import {
  UpdateBomYieldInput,
  type UpdateBomYieldResult,
} from './update-bom-yield-types';
import { revalidateLocalized } from '../../../../../../../../lib/i18n/revalidate-localized';

const YIELD_PERMISSION = 'npd.handoff.promote';

type QueryClient = {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
};

export async function updateBomYield(raw: unknown): Promise<UpdateBomYieldResult> {
  const parsed = UpdateBomYieldInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, code: 'invalid_input' };
  }
  const { bomHeaderId, yieldPct } = parsed.data;

  try {
    return await withOrgContext(async (rawCtx) => {
      const ctx = rawCtx as { userId: string; orgId: string; client: QueryClient };

      if (!(await hasHandoffPermission(ctx, YIELD_PERMISSION))) {
        return { ok: false as const, code: 'forbidden' as const };
      }

      const updated = await ctx.client.query<{ id: string }>(
        `update public.bom_headers bh
            set yield_pct = $2::numeric
          where bh.id = $1::uuid
            and bh.org_id = app.current_org_id()
            and (
              bh.status in ('draft', 'technical_approved')
              or (
                bh.status = 'active'
                and bh.origin_module = 'npd'
                and bh.npd_project_id is not null
                and exists (
                  select 1
                    from public.handoff_checklists hc
                   where hc.project_id = bh.npd_project_id
                     and hc.org_id = bh.org_id
                     and (
                       hc.promote_to_production_date is null
                       or bh.yield_pct is null
                     )
                )
              )
            )
          returning bh.id`,
        [bomHeaderId, yieldPct],
      );
      const row = updated.rows[0];
      if (!row) {
        const exists = await ctx.client.query<{ id: string }>(
          `select bh.id
             from public.bom_headers bh
            where bh.id = $1::uuid
              and bh.org_id = app.current_org_id()
            limit 1`,
          [bomHeaderId],
        );
        if (!exists.rows[0]) return { ok: false as const, code: 'not_found' as const };
        return { ok: false as const, code: 'active_bom_requires_eco' as const };
      }

      await ctx.client.query(
        `insert into public.audit_events
           (org_id, actor_user_id, actor_type, action, resource_type, resource_id,
            after_state, request_id, retention_class)
         values (app.current_org_id(), $1::uuid, 'user',
                 'npd.handoff.bom_yield_set', 'bom_header', $2,
                 $3::jsonb, gen_random_uuid(), 'standard')`,
        [ctx.userId, row.id, JSON.stringify({ yieldPct })],
      );

      safeRevalidatePath('/[locale]/technical/bom');

      return { ok: true as const };
    });
  } catch (error) {
    console.error('[updateBomYield] persistence_failed:', error);
    return { ok: false, code: 'persistence_failed' };
  }
}

function safeRevalidatePath(path: string): void {
  try {
    revalidateLocalized(path, 'page');
  } catch {
    // Vitest imports Server Actions outside a Next request store.
  }
}
