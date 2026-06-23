'use server';

/**
 * T-047 — TEC-040 Allergen Profile Editor: Server Actions.
 *
 * Thin `'use server'` wrappers that drive the EXISTING allergen domain services
 * (apps/web/lib/technical/allergens/*) under withOrgContext + RLS. No new schema,
 * no service-role bypass, no hardcoded data — every read/write hits real Supabase
 * (public.item_allergen_profiles, public.item_allergen_profile_overrides,
 * "Reference"."Allergens").
 *
 * Read model (loadAllergenProfileEditor):
 *   - the item's allergen profile rows (per-allergen source/intensity/confidence);
 *   - the EU-14 + org-custom allergen reference list (for the declaration grid);
 *   - the per-(item × allergen) override-history ledger (read-only, append-only);
 *   - the caller's technical.allergens.edit capability (gates Save).
 *
 * Auto-cascaded badges (source='cascaded') are READ-ONLY here — the cascade engine
 * (T-024) is their only writer. A manual override is additive with a required
 * reason (V-TEC-42) and never clears the cascade source (the service enforces this).
 */

import { withOrgContext } from '../../../../../../../../lib/auth/with-org-context';
import {
  type OrgActionContext,
  type QueryClient,
  type AllergenActionError,
  ALLERGENS_EDIT_PERMISSION,
  hasPermission,
} from '../../../../../../../../lib/technical/allergens/shared';
import {
  upsertProfile,
  deleteProfile,
  type ProfileRow,
} from '../../../../../../../../lib/technical/allergens/service';

export type EditorState = 'ready' | 'empty' | 'error';

export type AllergenRef = { allergenCode: string; allergenName: string };

export type ProfileBadge = {
  allergenCode: string;
  allergenName: string;
  source: string;
  intensity: string;
  confidence: string;
  manualOverrideReason: string | null;
};

export type OverrideHistoryRow = {
  id: string;
  allergenCode: string;
  action: string;
  intensity: string | null;
  confidence: string | null;
  reason: string;
  overriddenAt: string;
  overriddenBy: string | null;
};

export type AllergenProfileEditorData = {
  itemCode: string;
  itemName: string;
  itemType: string | null;
  badges: ProfileBadge[];
  references: AllergenRef[];
  overrides: OverrideHistoryRow[];
  canEdit: boolean;
  state: EditorState;
};

type ItemRow = { id: string; name: string; item_type: string };

export async function loadAllergenProfileEditor(
  itemCode: string,
): Promise<AllergenProfileEditorData> {
  const empty: AllergenProfileEditorData = {
    itemCode,
    itemName: itemCode,
    itemType: null,
    badges: [],
    references: [],
    overrides: [],
    canEdit: false,
    state: 'error',
  };
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as unknown as QueryClient };

      const itemResult = await ctx.client.query<ItemRow>(
        `select id, name, item_type from public.items
          where org_id = app.current_org_id() and item_code = $1 limit 1`,
        [itemCode],
      );
      const item = itemResult.rows[0];
      if (!item) return { ...empty, state: 'error' };

      const [profilesResult, refsResult, overridesResult, canEdit] = await Promise.all([
        ctx.client.query<{
          allergen_code: string;
          allergen_name: string | null;
          source: string;
          intensity: string;
          confidence: string;
          manual_override_reason: string | null;
        }>(
          `select p.allergen_code, a.allergen_name, p.source, p.intensity, p.confidence,
                  p.manual_override_reason
             from public.item_allergen_profiles p
             left join "Reference"."Allergens" a
               on a.org_id = p.org_id and a.allergen_code = p.allergen_code
            where p.org_id = app.current_org_id() and p.item_id = $1::uuid
            order by p.allergen_code asc`,
          [item.id],
        ),
        ctx.client.query<{ allergen_code: string; allergen_name: string }>(
          `select allergen_code, allergen_name
             from "Reference"."Allergens"
            where org_id = app.current_org_id()
            order by allergen_name asc`,
        ),
        ctx.client.query<{
          id: string;
          allergen_code: string;
          action: string;
          intensity: string | null;
          confidence: string | null;
          reason: string;
          overridden_at: string | Date;
          overridden_by: string | null;
        }>(
          `select id, allergen_code, action, intensity, confidence, reason,
                  overridden_at, overridden_by
             from public.item_allergen_profile_overrides
            where org_id = app.current_org_id() and item_id = $1::uuid
            order by overridden_at desc`,
          [item.id],
        ),
        hasPermission(ctx, ALLERGENS_EDIT_PERMISSION),
      ]);

      const badges: ProfileBadge[] = profilesResult.rows.map((r) => ({
        allergenCode: r.allergen_code,
        allergenName: r.allergen_name ?? r.allergen_code,
        source: r.source,
        intensity: r.intensity,
        confidence: r.confidence,
        manualOverrideReason: r.manual_override_reason,
      }));
      const references: AllergenRef[] = refsResult.rows.map((r) => ({
        allergenCode: r.allergen_code,
        allergenName: r.allergen_name,
      }));
      const overrides: OverrideHistoryRow[] = overridesResult.rows.map((r) => ({
        id: r.id,
        allergenCode: r.allergen_code,
        action: r.action,
        intensity: r.intensity,
        confidence: r.confidence,
        reason: r.reason,
        overriddenAt:
          r.overridden_at instanceof Date ? r.overridden_at.toISOString() : String(r.overridden_at),
        overriddenBy: r.overridden_by,
      }));

      return {
        itemCode,
        itemName: item.name,
        itemType: item.item_type,
        badges,
        references,
        overrides,
        canEdit,
        state: badges.length || references.length ? 'ready' : 'empty',
      };
    });
  } catch (error) {
    console.error('[technical/allergens] loadAllergenProfileEditor failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return empty;
  }
}

export type SaveProfileError = AllergenActionError | 'not_applicable';

export type SaveProfileResult =
  | { ok: true; data: ProfileRow }
  | { ok: false; error: SaveProfileError };

/**
 * Manual-override write. The reason is mandatory (V-TEC-42); the underlying
 * service appends an immutable override-history row + an audit_log entry and never
 * clears the cascade source.
 */
export async function saveAllergenOverride(input: {
  itemCode: string;
  allergenCode: string;
  intensity: string;
  confidence: string;
  reason: string;
}): Promise<SaveProfileResult> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as unknown as QueryClient };
      const result = await upsertProfile(ctx, {
        itemCode: input.itemCode,
        allergenCode: input.allergenCode,
        source: 'manual_override',
        intensity: input.intensity,
        confidence: input.confidence,
        reason: input.reason,
      });
      return result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error };
    });
  } catch (error) {
    console.error('[technical/allergens] saveAllergenOverride failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}

export async function clearAllergenOverride(input: {
  itemCode: string;
  allergenCode: string;
}): Promise<{ ok: true } | { ok: false; error: AllergenActionError }> {
  try {
    return await withOrgContext(async ({ userId, orgId, client }) => {
      const ctx: OrgActionContext = { userId, orgId, client: client as unknown as QueryClient };
      const result = await deleteProfile(ctx, input);
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    });
  } catch (error) {
    console.error('[technical/allergens] clearAllergenOverride failed', {
      err: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: 'persistence_failed' };
  }
}
