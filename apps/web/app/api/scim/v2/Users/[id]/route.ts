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

function normalizePatchPath(path: string | undefined): string | null {
  if (!path) return null;
  const last = path.split(':').pop() ?? path;
  return last.split('.')[0]?.trim().toLowerCase() ?? null;
}

function collectPatchAssignments(ops: PatchOp[]): {
  email?: string;
  displayName?: string | null;
  externalId?: string | null;
  active?: boolean;
} {
  const next: {
    email?: string;
    displayName?: string | null;
    externalId?: string | null;
    active?: boolean;
  } = {};

  const apply = (path: string | undefined, value: unknown, remove = false) => {
    const normalized = normalizePatchPath(path);
    if (!normalized) return;
    if (normalized === 'username' && !remove && typeof value === 'string') next.email = value;
    if (normalized === 'displayname') {
      next.displayName = remove ? null : typeof value === 'string' ? value : null;
    }
    if (normalized === 'externalid') {
      next.externalId = remove ? null : typeof value === 'string' ? value : null;
    }
    if (normalized === 'active') {
      next.active = remove ? false : value !== false;
    }
  };

  for (const op of ops) {
    if (!op || typeof op !== 'object' || typeof op.op !== 'string') continue;
    const action = op.op.toLowerCase();
    if (!['add', 'replace', 'remove'].includes(action)) continue;
    if (!op.path && op.value && typeof op.value === 'object' && action !== 'remove') {
      const value = op.value as Record<string, unknown>;
      for (const [key, fieldValue] of Object.entries(value)) apply(key, fieldValue, false);
      continue;
    }
    apply(op.path, op.value, action === 'remove');
  }

  return next;
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
  const assignments = collectPatchAssignments(ops);

  const { id } = await route.params;

  const row = await withScimOrgContext(ctx, async (client) => {
    const setClauses: string[] = [];
    const params: unknown[] = [id];
    const addParam = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    if (assignments.email !== undefined) {
      setClauses.push(`email = ${addParam(assignments.email)}`);
    }
    if (assignments.displayName !== undefined) {
      setClauses.push(
        assignments.displayName === null ? 'display_name = null' : `display_name = ${addParam(assignments.displayName)}`,
      );
    }
    if (assignments.externalId !== undefined) {
      setClauses.push(
        assignments.externalId === null ? 'external_id = null' : `external_id = ${addParam(assignments.externalId)}`,
      );
    }
    if (assignments.active !== undefined) {
      setClauses.push(assignments.active ? 'deleted_at = null' : 'deleted_at = now()');
    }

    if (setClauses.length > 0) {
      const { rows, rowCount } = await client.query<{
        id: string;
        email: string;
        display_name: string | null;
        external_id: string | null;
        deleted_at: Date | null;
      }>(
        `update public.users
            set ${setClauses.join(', ')}
          where id = $1
          returning id, email, display_name, external_id, deleted_at`,
        params,
      );
      return rowCount === 1 ? rows[0] : null;
    }

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

  if (assignments.active === false) {
    const requestId = request.headers.get('x-request-id') ?? randomUUID();
    try {
      await getScimOwnerPool().query(
        `insert into public.audit_events (
           org_id, actor_user_id, actor_type, action, resource_type, resource_id,
           request_id, retention_class
         ) values ($1, null, 'scim', 'user.deactivated_via_scim', 'User', $2,
                   $3::uuid, 'operational')`,
        [ctx.orgId, row.id, requestId],
      );
    } catch {
      /* audit best-effort */
    }
  }

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
