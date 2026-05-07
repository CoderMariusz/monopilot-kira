/**
 * T-013 — SCIM 2.0 /Users (collection)
 *   GET  → ListResponse, scoped via RLS
 *   POST → 201 Created with SCIM User resource
 *
 * Cross-tenant isolation is enforced via app.set_org_context() and the
 * users_org_context RLS policy on public.users.
 */

import { randomUUID } from 'node:crypto';
import {
  scimUnauthorized,
  verifyScimBearer,
  withScimOrgContext,
  getScimOwnerPool,
} from '../../../../../lib/scim/middleware';

const SCIM_CT = 'application/scim+json';
const USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';
const LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';

interface ScimUserBody {
  schemas?: string[];
  userName?: string;
  externalId?: string;
  name?: { givenName?: string; familyName?: string };
  active?: boolean;
}

function toScimUser(row: {
  id: string;
  email: string;
  display_name: string | null;
  external_id: string | null;
  deleted_at: Date | null;
}): Record<string, unknown> {
  return {
    schemas: [USER_SCHEMA],
    id: row.id,
    userName: row.email,
    externalId: row.external_id ?? undefined,
    displayName: row.display_name ?? undefined,
    active: row.deleted_at === null,
    meta: { resourceType: 'User' },
  };
}

export async function GET(request: Request): Promise<Response> {
  const ctx = await verifyScimBearer(request);
  if (!ctx) return scimUnauthorized();

  const resources = await withScimOrgContext(ctx, async (client) => {
    const { rows } = await client.query<{
      id: string;
      email: string;
      display_name: string | null;
      external_id: string | null;
      deleted_at: Date | null;
    }>(
      `select id, email, display_name, external_id, deleted_at
         from public.users
        where deleted_at is null
        order by created_at asc
        limit 500`,
    );
    return rows.map(toScimUser);
  });

  return new Response(
    JSON.stringify({
      schemas: [LIST_SCHEMA],
      totalResults: resources.length,
      Resources: resources,
      itemsPerPage: resources.length,
      startIndex: 1,
    }),
    { status: 200, headers: { 'content-type': SCIM_CT } },
  );
}

export async function POST(request: Request): Promise<Response> {
  const ctx = await verifyScimBearer(request);
  if (!ctx) return scimUnauthorized();

  let body: ScimUserBody;
  try {
    body = (await request.json()) as ScimUserBody;
  } catch {
    return new Response(
      JSON.stringify({ schemas: [], status: '400', detail: 'Invalid JSON' }),
      { status: 400, headers: { 'content-type': SCIM_CT } },
    );
  }

  if (!body.userName || typeof body.userName !== 'string') {
    return new Response(
      JSON.stringify({ schemas: [], status: '400', detail: 'userName is required' }),
      { status: 400, headers: { 'content-type': SCIM_CT } },
    );
  }

  const userId = randomUUID();
  const displayName =
    [body.name?.givenName, body.name?.familyName].filter(Boolean).join(' ').trim() ||
    body.userName;

  const inserted = await withScimOrgContext(ctx, async (client) => {
    const { rows } = await client.query<{
      id: string;
      email: string;
      display_name: string | null;
      external_id: string | null;
      deleted_at: Date | null;
    }>(
      `insert into public.users (id, org_id, email, display_name, external_id)
       values ($1, $2, $3, $4, $5)
       returning id, email, display_name, external_id, deleted_at`,
      [userId, ctx.orgId, body.userName, displayName, body.externalId ?? null],
    );
    return rows[0];
  });

  // Audit (operational retention; PRD §11) — written via app_user under RLS,
  // org_id = ctx.orgId from the verified bearer.
  const requestId = request.headers.get('x-request-id') ?? randomUUID();
  try {
    await getScimOwnerPool().query(
      `insert into public.audit_events (
         org_id, actor_user_id, actor_type, action, resource_type, resource_id,
         request_id, retention_class
       ) values ($1, null, 'scim', 'user.provisioned_via_scim', 'User', $2,
                 $3::uuid, 'operational')`,
      [ctx.orgId, inserted.id, requestId],
    );
  } catch {
    /* audit best-effort — do not break the 201 path */
  }

  return new Response(JSON.stringify(toScimUser(inserted)), {
    status: 201,
    headers: {
      'content-type': SCIM_CT,
      location: `/scim/v2/Users/${inserted.id}`,
    },
  });
}
