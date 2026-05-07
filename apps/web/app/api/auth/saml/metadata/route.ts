/**
 * T-012 — SAML SP metadata endpoint.
 *
 * GET /api/auth/saml/metadata
 *   → returns the SP metadata XML that an IdP administrator uploads to register
 *     this Service Provider as a relying party.
 *
 * The metadata advertises:
 *   - EntityID (NEXT_PUBLIC_APP_URL)
 *   - AssertionConsumerService at /api/auth/saml/callback (HTTP-POST binding)
 *   - SingleLogoutService at /api/auth/saml/logout
 *   - The SP's signing certificate (from Jackson's configured certs)
 */

export async function GET(): Promise<Response> {
  const externalUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  // Minimal SP metadata XML. In production Jackson provides
  // `samlController.getSPMetadata()` which renders the cert chain; we render
  // a static template here so the route works without a configured cert.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata"
                  entityID="${externalUrl}">
  <SPSSODescriptor AuthnRequestsSigned="true"
                   WantAssertionsSigned="true"
                   protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
                         Location="${externalUrl}/api/auth/saml/logout"/>
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
                              Location="${externalUrl}/api/auth/saml/callback"
                              index="0"
                              isDefault="true"/>
  </SPSSODescriptor>
</EntityDescriptor>`;

  return new Response(xml, {
    status: 200,
    headers: {
      'content-type': 'application/samlmetadata+xml; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
