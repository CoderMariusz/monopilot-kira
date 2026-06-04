/**
 * T-019 — Allergen contamination-risk matrix route:
 *   /api/technical/allergens/contamination-risk
 *   GET    → list all risk rows; with ?line_id= returns { entries, gaps }
 *            (gaps = EU-14 allergen codes with no entry for the line)
 *   POST   → upsert a risk row (risk_level enum guard; 'extreme' → 422)
 *   DELETE → remove a risk row by ?id=
 *
 * Writes gated on technical.allergens.edit. Does NOT couple to the
 * 08-PRODUCTION allergen-changeover gate. See
 * lib/technical/allergens/contamination.ts.
 */

import { runAllergenRoute, json } from '../../../../../lib/technical/allergens/http';
import {
  deleteRisk,
  listAllRisk,
  listRiskForLine,
  upsertRisk,
} from '../../../../../lib/technical/allergens/contamination';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const lineId = url.searchParams.get('line_id');
  if (lineId) {
    return runAllergenRoute(200, (orgCtx) => listRiskForLine(orgCtx, lineId));
  }
  return runAllergenRoute(200, (orgCtx) => listAllRisk(orgCtx));
}

export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'invalid_input' }, 400);
  }
  return runAllergenRoute(201, (orgCtx) => upsertRisk(orgCtx, body));
}

export async function DELETE(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return json({ ok: false, error: 'invalid_input' }, 400);
  return runAllergenRoute(200, (orgCtx) => deleteRisk(orgCtx, { id }));
}
