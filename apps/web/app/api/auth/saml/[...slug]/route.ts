import { withOrgContext } from '../../../../../lib/auth/with-org-context';

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type SsoConfigRow = {
  org_id: string;
  idp_type: 'saml_entra' | 'saml_generic' | 'oidc';
  display_name?: string | null;
  metadata_url?: string | null;
  entity_id: string;
  acs_url: string;
  x509_cert?: string | null;
  jit_provisioning?: boolean | null;
  default_role_code?: string | null;
  enabled?: boolean | null;
};

type SamlProfile = {
  id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
};

export async function GET(request: Request, context: { params: { slug?: string[] } }): Promise<Response> {
  const slug = context.params.slug ?? [];
  if (slug[0] !== 'metadata') {
    return json({ error: 'not_found' }, 404);
  }

  const url = new URL(request.url);
  const orgId = url.searchParams.get('org_id') ?? undefined;
  const externalUrl = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;

  try {
    const jackson = await getJackson(externalUrl);
    const metadata = await callMetadata(jackson, {
      tenant: orgId ?? 'default',
      product: 'monopilot',
    });
    if (metadata) return xml(metadata);
  } catch {
    // Fall back to deterministic metadata so IdP setup remains possible even before Jackson storage is initialized.
  }

  const entityId = orgId ? `${externalUrl}/saml/${orgId}` : externalUrl;
  return xml(`<?xml version="1.0" encoding="UTF-8"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${escapeXml(entityId)}">
  <SPSSODescriptor AuthnRequestsSigned="true" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${escapeXml(externalUrl)}/api/auth/saml/callback" index="0" isDefault="true"/>
  </SPSSODescriptor>
</EntityDescriptor>`);
}

export async function POST(request: Request, context: { params: { slug?: string[] } }): Promise<Response> {
  const slug = context.params.slug ?? [];
  if (slug[0] !== 'callback') {
    return json({ error: 'not_found' }, 404);
  }

  const form = await request.formData();
  const samlResponse = form.get('SAMLResponse');
  const relayState = form.get('RelayState');
  if (typeof samlResponse !== 'string' || typeof relayState !== 'string') {
    return json({ error: 'SAMLResponse and RelayState are required' }, 400);
  }

  return withOrgContext(async ({ orgId, client }: { orgId: string; client: QueryClient }) => {
    const requestedOrgId = relayState || orgId;
    const { rows } = await client.query<SsoConfigRow>(
      `select org_id, idp_type, display_name, metadata_url, entity_id, acs_url, x509_cert,
              jit_provisioning, default_role_code, enabled
         from public.org_sso_config
        where org_id = app.current_org_id()
        limit 1`,
    );
    const config = rows[0];
    if (!config || config.org_id !== requestedOrgId) {
      return json({ error: 'sso_config_not_found' }, 400);
    }
    if (!config.enabled || (config.idp_type !== 'saml_entra' && config.idp_type !== 'saml_generic')) {
      return json({ error: 'saml_not_enabled' }, 403);
    }

    const jackson = await getJackson(new URL(request.url).origin);
    let profile: SamlProfile | undefined;
    try {
      const parsed = (await jackson.oauthController.samlResponse({
        SAMLResponse: samlResponse,
        RelayState: relayState,
      })) as { profile?: SamlProfile };
      profile = parsed.profile;
    } catch {
      return json({ error: 'saml_assertion_rejected' }, 403);
    }

    if (!profile?.email) {
      return json({ error: 'saml_email_missing' }, 403);
    }
    if (config.jit_provisioning === false) {
      return json({ error: 'jit_provisioning_disabled' }, 403);
    }

    const roleCode = config.default_role_code || 'viewer';
    const roleId = await resolveRoleId(client, roleCode);
    const userId = await upsertJitUser(client, {
      orgId: config.org_id,
      email: profile.email,
      externalId: profile.id ?? null,
      name: profile.name ?? ([profile.firstName, profile.lastName].filter(Boolean).join(' ') || null),
    });
    await assignRole(client, { orgId: config.org_id, userId, roleId, roleCode });

    return new Response(null, { status: 302, headers: { location: '/' } });
  });
}

async function resolveRoleId(client: QueryClient, roleCode: string): Promise<string> {
  const { rows } = await client.query<{ id: string; code?: string; slug?: string }>(
    `select id, code, slug
       from public.roles
      where org_id = app.current_org_id()
        and (code = $1 or slug = $1)
      limit 1`,
    [roleCode],
  );
  return rows[0]?.id ?? roleCode;
}

async function upsertJitUser(
  client: QueryClient,
  input: { orgId: string; email: string; externalId: string | null; name: string | null },
): Promise<string> {
  const { rows } = await client.query<{ id: string; email: string }>(
    `insert into public.users (org_id, email, external_id, name, auth_provider, created_at, updated_at)
     values ($1::uuid, $2, $3, $4, 'saml', now(), now())
     on conflict (org_id, email) do update set
       external_id = coalesce(excluded.external_id, public.users.external_id),
       name = coalesce(excluded.name, public.users.name),
       updated_at = now()
     returning id, email`,
    [input.orgId, input.email, input.externalId, input.name],
  );
  return rows[0]?.id ?? input.email;
}

async function assignRole(
  client: QueryClient,
  input: { orgId: string; userId: string; roleId: string; roleCode: string },
): Promise<void> {
  await client.query(
    `insert into public.user_roles (org_id, user_id, role_id, role_code, created_at)
     values ($1::uuid, $2::uuid, $3, $4, now())
     on conflict do nothing`,
    [input.orgId, input.userId, input.roleId, input.roleCode],
  );
}

async function getJackson(externalUrl: string): Promise<{
  oauthController: { samlResponse(opts: Record<string, unknown>): Promise<unknown> };
  apiController?: Record<string, unknown>;
  spMetadata?: (opts?: Record<string, unknown>) => Promise<unknown> | unknown;
}> {
  const mod = (await import('@boxyhq/saml-jackson')) as unknown as {
    controllers?: (opts: Record<string, unknown>) => Promise<unknown>;
    default?: (opts: Record<string, unknown>) => Promise<unknown>;
  };
  const init = mod.controllers ?? mod.default;
  if (!init) throw new Error('SAML Jackson SDK unavailable');
  const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/postgres';
  return (await init({
    externalUrl,
    samlPath: '/api/auth/saml/callback',
    samlAudience: externalUrl,
    db: { engine: 'sql', url: databaseUrl, type: 'postgres', manualMigration: false },
  })) as {
    oauthController: { samlResponse(opts: Record<string, unknown>): Promise<unknown> };
    apiController?: Record<string, unknown>;
    spMetadata?: (opts?: Record<string, unknown>) => Promise<unknown> | unknown;
  };
}

async function callMetadata(jackson: Awaited<ReturnType<typeof getJackson>>, opts: Record<string, unknown>): Promise<string | null> {
  const candidates = [
    jackson.spMetadata,
    jackson.apiController?.getMetadata,
    jackson.apiController?.serviceProviderMetadata,
    jackson.apiController?.metadata,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'function') continue;
    const value = await candidate(opts);
    if (typeof value === 'string') return value;
  }
  return null;
}

function xml(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/samlmetadata+xml; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
