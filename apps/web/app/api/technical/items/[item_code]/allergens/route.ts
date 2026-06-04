/**
 * T-017 — Allergen profile CRUD route: /api/technical/items/:item_code/allergens
 *   GET  → list the item's allergen profile rows (org-scoped, RLS)
 *   POST → create/update a profile row (upsert by org_id,item_id,allergen_code)
 *   PUT  → alias of POST (the path identifies the row by composite key)
 *
 * source='manual_override' forces a reason (V-TEC-42); allergen_code must
 * reference "Reference"."Allergens" (V-TEC-40). Writes gated on
 * technical.allergens.edit. See lib/technical/allergens/service.ts.
 */

import { runAllergenRoute, json } from '../../../../../../lib/technical/allergens/http';
import {
  deleteProfile,
  listProfiles,
  upsertProfile,
} from '../../../../../../lib/technical/allergens/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ item_code: string }> };

export async function GET(_request: Request, ctx: RouteContext): Promise<Response> {
  const { item_code } = await ctx.params;
  return runAllergenRoute(200, (orgCtx) => listProfiles(orgCtx, decodeURIComponent(item_code)));
}

export async function POST(request: Request, ctx: RouteContext): Promise<Response> {
  const { item_code } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'invalid_input' }, 400);
  }
  return runAllergenRoute(201, (orgCtx) =>
    upsertProfile(orgCtx, { ...body, itemCode: decodeURIComponent(item_code) }),
  );
}

export async function PUT(request: Request, ctx: RouteContext): Promise<Response> {
  const { item_code } = await ctx.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'invalid_input' }, 400);
  }
  return runAllergenRoute(200, (orgCtx) =>
    upsertProfile(orgCtx, { ...body, itemCode: decodeURIComponent(item_code) }),
  );
}

export async function DELETE(request: Request, ctx: RouteContext): Promise<Response> {
  const { item_code } = await ctx.params;
  const url = new URL(request.url);
  const allergenCode = url.searchParams.get('allergen_code');
  if (!allergenCode) return json({ ok: false, error: 'invalid_input' }, 400);
  return runAllergenRoute(200, (orgCtx) =>
    deleteProfile(orgCtx, { itemCode: decodeURIComponent(item_code), allergenCode }),
  );
}
