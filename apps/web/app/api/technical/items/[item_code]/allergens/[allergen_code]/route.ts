/**
 * T-017 — Allergen profile single-row route:
 *   /api/technical/items/:item_code/allergens/:allergen_code
 *   DELETE → remove a profile row; records action='allergen.delete' with the
 *            old payload in audit_log. Gated on technical.allergens.edit.
 *
 * See lib/technical/allergens/service.ts (deleteProfile).
 */

import { runAllergenRoute } from '../../../../../../../lib/technical/allergens/http';
import { deleteProfile } from '../../../../../../../lib/technical/allergens/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ item_code: string; allergen_code: string }> };

export async function DELETE(_request: Request, ctx: RouteContext): Promise<Response> {
  const { item_code, allergen_code } = await ctx.params;
  return runAllergenRoute(200, (orgCtx) =>
    deleteProfile(orgCtx, {
      itemCode: decodeURIComponent(item_code),
      allergenCode: decodeURIComponent(allergen_code),
    }),
  );
}
