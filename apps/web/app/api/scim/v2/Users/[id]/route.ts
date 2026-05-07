/**
 * T-013 — SCIM 2.0 /Users/{id}
 *   GET    → single user (RLS-scoped)
 *   PATCH  → JSON-Patch ops; replace active=false → soft-delete (deleted_at = now())
 *   DELETE → soft-delete (HTTP 204)
 *
 * Cross-tenant guard: the UPDATE / SELECT runs under app_user with set_org_context
 * applied. RLS reduces other-org rows to invisibility, so the rowCount=0 path
 * surfaces as 404 and the caller cannot mutate cross-tenant.
 */

import { randomUUID } from 'node:crypto';
import {
  scimUnauthorized,
  verifyScimBearer,
  withScimOrgContext,
  getScimOwnerPool,
} from '../../../../../../lib/scim/middleware';

const SCIM_CT = 'application/scim+json';
const USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User';

type RouteCtx = { params: Promise<{ id: string }> };

interface PatchOp {
  op?: string;
  path?: string;
  value?: unknown;
}

interface PatchBody {
  schemas?: string[];
  Operations?: PatchOp[];
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

function notFound(): Response {
  return new Response(
    JSON.stringify({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      status: '404',
      detail: 'User not found in caller org',
    }),
    { status: 404, headers: { 'content-type': SCIM_CT } },
  );
}

export async function GET(request: Request, route: RouteCtx): Promise<Response> {
  const ctx = await verifyScimBearer(request);
  if (!ctx) return scimUnauthorized();

  const { id } = await route.params;

  const row = await withScimOrgContext(ctx, async (client) => {
    const { rows } = await client.query<{
      id: string;
      email: string;
      display_name: string | null;
      external_id: string | null;
      deleted_at: Date | null;
    }>(
      `select id, email, display_name, external_id, deleted_at
         from public.users
        where id = $1`,
      [id],
    );
    return rows[0] ?? null;
  });

  if (!row) return notFound();
  return new Response(JSON.stringify(toScimUser(row)), {
    status: 200,
    headers: { 'content-type': SCIM_CT },
  });
}

/**
 * Parse a single JSON-Patch op of shape { op:'replace', path:'active', value:false }.
 * Returns true when this op is a deactivation request.
 */
function isDeactivateOp(op: PatchOp): boolean {
  if (!op || typeof op !== 'object') return false;
  if (typeof op.op !== 'string') return false;
  if (op.op.toLowerCase() !== 'replace') return false;
  // path may be 'active' or omitted (with value:{active:false})
  if (op.path === 'active' && op.value === false) return true;
  if (
    !op.path &&
    op.value &&
    typeof op.value === 'object' &&
    (op.value as Record<string, unknown>).active === false
  ) {
    return true;
  }
  return false;
}

export async function PATCH(request: Request, route: RouteCtx): Promise<Response> {
  const ctx = await verifyScimBearer(request);
  if (!ctx) return scimUnauthorized();

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return new Response(
      JSON.stringify({ schemas: [], status: '400', detail: 'Invalid JSON' }),
      { status: 400, headers: { 'content-type': SCIM_CT } },
    );
  }

  const ops = Array.isArray(body.Operations) ? body.Operations : [];
  const deactivate = ops.some(isDeactivateOp);

  const { id } = await route.params;

  if (deactivate) {
    const updated = await withScimOrgContext(ctx, async (client) => {
      const { rows, rowCount } = await client.query<{
        id: string;
        email: string;
        display_name: string | null;
        external_id: string | null;
        deleted_at: Date | null;
      }>(
        `update public.users
            set deleted_at = now()
          where id = $1
          returning id, email, display_name, external_id, deleted_at`,
        [id],
      );
      return rowCount === 1 ? rows[0] : null;
    });

    if (!updated) return notFound();

    const requestId = request.headers.get('x-request-id') ?? randomUUID();
    try {
      await getScimOwnerPool().query(
        `insert into public.audit_events (
           org_id, actor_user_id, actor_type, action, resource_type, resource_id,
           request_id, retention_class
         ) values ($1, null, 'scim', 'user.deactivated_via_scim', 'User', $2,
                   $3::uuid, 'operational')`,
        [ctx.orgId, updated.id, requestId],
      );
    } catch {
      /* audit best-effort */
    }

    return new Response(JSON.stringify(toScimUser(updated)), {
      status: 200,
      headers: { 'content-type': SCIM_CT },
    });
  }

  // Non-deactivate PATCH ops are accepted but no-op for this minimal impl.
  // Read back current row (RLS-scoped).
  const row = await withScimOrgContext(ctx, async (client) => {
    const { rows } = await client.query<{
      id: string;
      email: string;
      display_name: string | null;
      external_id: string | null;
      deleted_at: Date | null;
    }>(
      `select id, email, display_name, external_id, deleted_at
         from public.users where id = $1`,
      [id],
    );
    return rows[0] ?? null;
  });

  if (!row) return notFound();
  return new Response(JSON.stringify(toScimUser(row)), {
    status: 200,
    headers: { 'content-type': SCIM_CT },
  });
}

export async function DELETE(request: Request, route: RouteCtx): Promise<Response> {
  const ctx = await verifyScimBearer(request);
  if (!ctx) return scimUnauthorized();

  const { id } = await route.params;

  const updated = await withScimOrgContext(ctx, async (client) => {
    const { rowCount } = await client.query(
      `update public.users
          set deleted_at = now()
        where id = $1
          and deleted_at is null`,
      [id],
    );
    return rowCount === 1;
  });

  if (!updated) return notFound();

  const requestId = request.headers.get('x-request-id') ?? randomUUID();
  try {
    await getScimOwnerPool().query(
      `insert into public.audit_events (
         org_id, actor_user_id, actor_type, action, resource_type, resource_id,
         request_id, retention_class
       ) values ($1, null, 'scim', 'user.deactivated_via_scim', 'User', $2,
                 $3::uuid, 'operational')`,
      [ctx.orgId, id, requestId],
    );
  } catch {
    /* audit best-effort */
  }

  return new Response(null, { status: 204 });
}
