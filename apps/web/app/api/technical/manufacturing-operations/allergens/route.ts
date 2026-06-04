/**
 * T-018 — Manufacturing-operation allergen additions route:
 *   /api/technical/manufacturing-operations/allergens
 *   GET    → list additions (optional ?manufacturing_operation_name=)
 *   POST   → create/update an addition (V-TEC-63 reference-table FK guard)
 *   DELETE → remove an addition (action='manufacturing_op.allergen.delete')
 *
 * Writes gated on technical.allergens.edit. See
 * lib/technical/allergens/manufacturing-op.ts.
 */

import { runAllergenRoute, json } from '../../../../../lib/technical/allergens/http';
import {
  deleteMfgOpAllergen,
  listMfgOpAllergens,
  upsertMfgOpAllergen,
} from '../../../../../lib/technical/allergens/manufacturing-op';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const op = url.searchParams.get('manufacturing_operation_name') ?? undefined;
  return runAllergenRoute(200, (orgCtx) => listMfgOpAllergens(orgCtx, op));
}

export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'invalid_input' }, 400);
  }
  return runAllergenRoute(201, (orgCtx) => upsertMfgOpAllergen(orgCtx, body));
}

export async function DELETE(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'invalid_input' }, 400);
  }
  return runAllergenRoute(200, (orgCtx) => deleteMfgOpAllergen(orgCtx, body));
}
