import { randomUUID } from 'node:crypto';
import {
  createCanonicalRoleAdapter,
  deleteScimGroup,
  getScimGroup,
  patchScimGroupMembers,
  UnmappedScimGroupError,
  type PatchOperation,
  type ScimGroupResource,
} from '../../../../../../../../packages/auth/src/scim/groups';
import {
  scimUnauthorized,
  verifyScimBearer,
  withScimOrgContext,
} from '../../../../../../lib/scim/middleware';

const SCIM_CT = 'application/scim+json';
const ERROR_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:Error';

type RouteCtx = { params: Promise<{ id: string }> };

interface PatchBody {
  Operations?: unknown;
}

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

function notFound(): Response {
  return scimError(404, 'Group not found in caller org');
}

export async function GET(request: Request, route: RouteCtx): Promise<Response> {
  const ctx = await verifyScimBearer(request);
  if (!ctx) return scimUnauthorized();

  const { id } = await route.params;
  const group = await withScimOrgContext<ScimGroupResource | null>(ctx, (client) =>
    getScimGroup({ db: client, orgId: ctx.orgId, groupId: id }),
  );

  if (!group) return notFound();
  return new Response(JSON.stringify(group), {
    status: 200,
    headers: { 'content-type': SCIM_CT },
  });
}

export async function PATCH(request: Request, route: RouteCtx): Promise<Response> {
  const ctx = await verifyScimBearer(request);
  if (!ctx) return scimUnauthorized();

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return scimError(400, 'Invalid JSON', 'invalidSyntax');
  }

  if (!Array.isArray(body.Operations)) {
    return scimError(400, 'Operations must be an array', 'invalidValue');
  }

  const { id } = await route.params;
  const requestId = request.headers.get('x-request-id') ?? randomUUID();

  try {
    const group = await withScimOrgContext<ScimGroupResource | null>(ctx, (client) =>
      patchScimGroupMembers({
        db: client,
        roleAdapter: createCanonicalRoleAdapter(),
        orgId: ctx.orgId,
        tenantId: ctx.tenantId,
        actorType: 'system',
        groupId: id,
        requestId,
        operations: body.Operations as PatchOperation[],
      }),
    );

    if (!group) return notFound();
    return new Response(JSON.stringify(group), {
      status: 200,
      headers: { 'content-type': SCIM_CT },
    });
  } catch (err) {
    if (err instanceof UnmappedScimGroupError) {
      return scimError(400, err.message, 'invalidValue');
    }
    throw err;
  }
}

export async function DELETE(request: Request, route: RouteCtx): Promise<Response> {
  const ctx = await verifyScimBearer(request);
  if (!ctx) return scimUnauthorized();

  const { id } = await route.params;
  const requestId = request.headers.get('x-request-id') ?? randomUUID();

  try {
    const deleted = await withScimOrgContext<boolean>(ctx, (client) =>
      deleteScimGroup({
        db: client,
        roleAdapter: createCanonicalRoleAdapter(),
        orgId: ctx.orgId,
        tenantId: ctx.tenantId,
        actorType: 'system',
        groupId: id,
        requestId,
      }),
    );

    if (!deleted) return notFound();
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof UnmappedScimGroupError) {
      return scimError(400, err.message, 'invalidValue');
    }
    throw err;
  }
}
