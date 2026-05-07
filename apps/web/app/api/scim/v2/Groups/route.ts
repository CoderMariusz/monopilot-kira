/**
 * T-013 — SCIM 2.0 /Groups (minimal collection endpoint).
 *
 * Group provisioning is not in the AC1-3 contract for T-013, but the SCIM
 * contract requires the endpoint to be reachable and to enforce the same
 * bearer-token verification as /Users.
 *
 * GET  → empty ListResponse (groups not modelled in 001-baseline yet)
 * POST → 501 Not Implemented (reserve for follow-up T-NNN; tests do not
 *        exercise group create)
 */

import { scimUnauthorized, verifyScimBearer } from '../../../../../lib/scim/middleware';

const SCIM_CT = 'application/scim+json';
const LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';

export async function GET(request: Request): Promise<Response> {
  const ctx = await verifyScimBearer(request);
  if (!ctx) return scimUnauthorized();

  return new Response(
    JSON.stringify({
      schemas: [LIST_SCHEMA],
      totalResults: 0,
      Resources: [],
      itemsPerPage: 0,
      startIndex: 1,
    }),
    { status: 200, headers: { 'content-type': SCIM_CT } },
  );
}

export async function POST(request: Request): Promise<Response> {
  const ctx = await verifyScimBearer(request);
  if (!ctx) return scimUnauthorized();

  return new Response(
    JSON.stringify({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '501',
      detail: 'Group provisioning not implemented',
    }),
    { status: 501, headers: { 'content-type': SCIM_CT } },
  );
}
