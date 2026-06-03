import { randomUUID } from 'node:crypto';
import {
  createScimGroup,
  listScimGroups,
  type ScimGroupResource,
} from '../../../../../../../packages/auth/src/scim/groups';
import {
  scimUnauthorized,
  verifyScimBearer,
  withScimOrgContext,
} from '../../../../../lib/scim/middleware';

const SCIM_CT = 'application/scim+json';
const LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
const ERROR_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:Error';

interface GroupCreateBody {
  displayName?: unknown;
  externalId?: unknown;
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

export async function GET(request: Request): Promise<Response> {
  const ctx = await verifyScimBearer(request);
  if (!ctx) return scimUnauthorized();

  const resources = await withScimOrgContext<ScimGroupResource[]>(ctx, (client) =>
    listScimGroups({ db: client, orgId: ctx.orgId }),
  );

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

  let body: GroupCreateBody;
  try {
    body = (await request.json()) as GroupCreateBody;
  } catch {
    return scimError(400, 'Invalid JSON', 'invalidSyntax');
  }

  if (typeof body.displayName !== 'string' || body.displayName.trim() === '') {
    return scimError(400, 'displayName is required', 'invalidValue');
  }

  const requestId = request.headers.get('x-request-id') ?? randomUUID();
  const group = await withScimOrgContext<ScimGroupResource>(ctx, (client) =>
    createScimGroup({
      db: client,
      orgId: ctx.orgId,
      tenantId: ctx.tenantId,
      displayName: body.displayName as string,
      externalId: typeof body.externalId === 'string' ? body.externalId : null,
      requestId,
    }),
  );

  return new Response(JSON.stringify(group), {
    status: 201,
    headers: {
      'content-type': SCIM_CT,
      location: `/scim/v2/Groups/${group.id}`,
    },
  });
}
