import { scimUnauthorized, verifyScimBearer } from '../../../../../lib/scim/middleware';

const SCIM_CT = 'application/scim+json';

export async function GET(request: Request): Promise<Response> {
  const ctx = await verifyScimBearer(request);
  if (!ctx) return scimUnauthorized();

  return new Response(
    JSON.stringify({
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
      patch: { supported: true },
      bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: { supported: true, maxResults: 500 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [
        {
          type: 'oauthbearertoken',
          name: 'Bearer Token',
          description: 'SCIM bearer token',
          specUri: 'https://www.rfc-editor.org/rfc/rfc6750',
          primary: true,
        },
      ],
    }),
    { status: 200, headers: { 'content-type': SCIM_CT } },
  );
}
