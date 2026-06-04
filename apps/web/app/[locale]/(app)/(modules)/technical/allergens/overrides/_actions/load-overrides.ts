'use server';

/**
 * T-049 — TEC-044 cross-item Override Audit loader.
 *
 * Org-scoped read of the APPEND-ONLY override ledger
 * (public.item_allergen_profile_overrides) joined to public.items for the item_code
 * and "Reference"."Allergens" for the allergen name. Runs under withOrgContext +
 * RLS (app.current_org_id()) — real Supabase data, no mocks. Also resolves the
 * caller's technical.allergens.edit capability (gates the re-override action) and
 * the EU-14 + org-custom allergen choices used by the declaration modal.
 */

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import {
  type OrgActionContext,
  type QueryClient,
  ALLERGENS_EDIT_PERMISSION,
  hasPermission,
} from '../../../../../../../../lib/technical/allergens/shared';
import type { OverrideAuditEntry } from '../_components/override-audit.client';
import type { AllergenChoice } from '../../../items/[item_code]/_components/allergen-declaration-modal';

export type OverridesLoad = {
  rows: OverrideAuditEntry[];
  allergens: AllergenChoice[];
  canReview: boolean;
  state: 'ready' | 'empty' | 'error';
};

export async function loadAllOverrides(): Promise<OverridesLoad> {
  const empty: OverridesLoad = { rows: [], allergens: [], canReview: false, state: 'error' };
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as unknown as QueryClient };

      const [overridesResult, allergensResult, canReview] = await Promise.all([
        ctx.client.query<{
          id: string;
          item_code: string;
          allergen_code: string;
          action: string;
          intensity: string | null;
          confidence: string | null;
          reason: string;
          overridden_at: string | Date;
          overridden_by: string | null;
        }>(
          `select o.id, i.item_code, o.allergen_code, o.action, o.intensity, o.confidence,
                  o.reason, o.overridden_at, o.overridden_by
             from public.item_allergen_profile_overrides o
             join public.items i
               on i.id = o.item_id and i.org_id = o.org_id
            where o.org_id = app.current_org_id()
            order by o.overridden_at desc
            limit 500`,
        ),
        ctx.client.query<{ allergen_code: string; allergen_name: string }>(
          `select allergen_code, allergen_name
             from "Reference"."Allergens"
            where org_id = app.current_org_id()
            order by allergen_name asc`,
        ),
        hasPermission(ctx, ALLERGENS_EDIT_PERMISSION),
      ]);

      const rows: OverrideAuditEntry[] = overridesResult.rows.map((r) => ({
        id: r.id,
        itemCode: r.item_code,
        allergenCode: r.allergen_code,
        action: r.action,
        intensity: r.intensity,
        confidence: r.confidence,
        reason: r.reason,
        overriddenAt:
          r.overridden_at instanceof Date ? r.overridden_at.toISOString() : String(r.overridden_at),
        overriddenBy: r.overridden_by,
      }));
      const allergens: AllergenChoice[] = allergensResult.rows.map((r) => ({
        allergenCode: r.allergen_code,
        allergenName: r.allergen_name,
      }));

      return { rows, allergens, canReview, state: rows.length ? 'ready' : 'empty' };
    });
  } catch (error) {
    console.error('[technical/allergens] loadAllOverrides failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return empty;
  }
}
