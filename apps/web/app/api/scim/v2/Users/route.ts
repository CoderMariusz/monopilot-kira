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
const ERROR_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:Error';

function scimError(status: number, detail: string, scimType?: string): Response {
  return new Response(
    JSON.stringify({
      schemas: [ERROR_SCHEMA],
      status: String(status),
      detail,
      ...(scimType ? { scimType } : {}),
    }),
    { status, headers: { 'content-type': SCIM_CT } },
  );
}

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
    return scimError(400, 'Invalid JSON', 'invalidSyntax');
  }

  if (!body.userName || typeof body.userName !== 'string') {
    return scimError(400, 'userName is required', 'invalidValue');
  }

  const userId = randomUUID();
  const displayName =
    [body.name?.givenName, body.name?.familyName].filter(Boolean).join(' ').trim() ||
    body.userName;

  const inserted = await withScimOrgContext(ctx, async (client) => {
    const { rows: seatRows } = await client.query<{ seat_limit: number | null }>(
      `select seat_limit from public.organizations where id = $1::uuid`,
      [ctx.orgId],
    );
    const seatLimit = seatRows[0]?.seat_limit ?? null;

    if (body.active !== false && seatLimit !== null) {
      const { rows: countRows } = await client.query<{
        active_count?: string | number;
        count?: string | number;
      }>(
        `select count(*) as active_count
           from public.users
          where org_id = $1::uuid
            and deleted_at is null`,
        [ctx.orgId],
      );
      const activeCount = Number(countRows[0]?.active_count ?? countRows[0]?.count ?? 0);
      if (activeCount >= seatLimit) {
        return { error: 'seat_limit' as const };
      }
    }

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
    return { row: rows[0] };
  });

  if ('error' in inserted) {
    return scimError(409, 'Organization seat limit reached', 'tooMany');
  }
  const created = inserted.row;

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
      [ctx.orgId, created.id, requestId],
    );
  } catch {
    /* audit best-effort — do not break the 201 path */
  }

  return new Response(JSON.stringify(toScimUser(created)), {
    status: 201,
    headers: {
      'content-type': SCIM_CT,
      location: `/scim/v2/Users/${created.id}`,
    },
  });
}
