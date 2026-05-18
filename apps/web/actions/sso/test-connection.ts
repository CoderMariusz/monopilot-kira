'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';

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
  last_test_status?: 'ok' | 'failed' | 'never' | null;
};

export type TestSamlConnectionResult =
  | { ok: true; data: { orgId: string; status: 'ok' } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'not_found' | 'unsupported_idp' | 'saml_test_failed' | 'persistence_failed'; message?: string };

const SSO_EDIT_PERMISSION = 'settings.sso.edit';

async function hasPermission(client: QueryClient, userId: string, orgId: string, permission: string): Promise<boolean> {
  const { rows } = await client.query<{ ok: boolean }>(
    `select true as ok
       from public.user_roles ur
       join public.roles r on r.id = ur.role_id and r.org_id = ur.org_id
       left join public.role_permissions rp on rp.role_id = r.id and rp.permission = $3
      where ur.user_id = $1::uuid
        and ur.org_id = $2::uuid
        and (
          rp.permission is not null
          or r.code = $3
          or r.slug = $3
          or coalesce(r.permissions, '[]'::jsonb) ? $3
        )
      limit 1`,
    [userId, orgId, permission],
  );
  return rows.length > 0;
}

export async function testSamlConnection(input?: { orgId?: string }): Promise<TestSamlConnectionResult> {
  return withOrgContext(async ({ userId, orgId, client }: { userId: string; orgId: string; client: QueryClient }) => {
    const requestedOrgId = typeof input?.orgId === 'string' && input.orgId.trim() ? input.orgId.trim() : orgId;
    if (requestedOrgId !== orgId) {
      return { ok: false, error: 'invalid_input' };
    }
    if (!(await hasPermission(client, userId, orgId, SSO_EDIT_PERMISSION))) {
      return { ok: false, error: 'forbidden' };
    }

    const { rows } = await client.query<SsoConfigRow>(
      `select org_id, idp_type, display_name, metadata_url, entity_id, acs_url, x509_cert,
              jit_provisioning, default_role_code, enabled, last_test_status
         from public.org_sso_config
        where org_id = app.current_org_id()
        limit 1`,
    );
    const config = rows[0];
    if (!config) return { ok: false, error: 'not_found' };
    if (config.idp_type !== 'saml_entra' && config.idp_type !== 'saml_generic') {
      return { ok: false, error: 'unsupported_idp' };
    }

    try {
      const jackson = await getJackson();
      await jackson.apiController.createConnection({
        tenant: config.org_id,
        product: 'monopilot',
        name: config.display_name ?? `org=${config.org_id}`,
        ...(config.metadata_url ? { metadataUrl: config.metadata_url } : {}),
        ...(config.entity_id ? { entityId: config.entity_id } : {}),
        defaultRedirectUrl: config.acs_url,
        redirectUrl: JSON.stringify([config.acs_url]),
      });

      await client.query(
        `update public.org_sso_config
            set last_test_at = now(),
                last_test_status = 'ok',
                updated_at = now()
          where org_id = app.current_org_id()`,
      );
      return { ok: true, data: { orgId: config.org_id, status: 'ok' } };
    } catch (error) {
      await markFailed(client);
      return {
        ok: false,
        error: 'saml_test_failed',
        message: `SAML IdP metadata test failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });
}

async function markFailed(client: QueryClient): Promise<void> {
  try {
    await client.query(
      `update public.org_sso_config
          set enabled = false,
              last_test_at = now(),
              last_test_status = 'failed',
              updated_at = now()
        where org_id = app.current_org_id()`,
    );
  } catch {
    // Preserve the original SAML/Jackson failure surface; a follow-up retry can persist status.
  }
}

async function getJackson(): Promise<{ apiController: { createConnection(opts: Record<string, unknown>): Promise<unknown> } }> {
  const mod = (await import('@boxyhq/saml-jackson')) as unknown as {
    controllers?: (opts: Record<string, unknown>) => Promise<unknown>;
    default?: (opts: Record<string, unknown>) => Promise<unknown>;
  };
  const init = mod.controllers ?? mod.default;
  if (!init) throw new Error('SAML Jackson SDK unavailable');
  const externalUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/postgres';
  return (await init({
    externalUrl,
    samlPath: '/api/auth/saml/callback',
    samlAudience: externalUrl,
    db: { engine: 'sql', url: databaseUrl, type: 'postgres', manualMigration: false },
  })) as { apiController: { createConnection(opts: Record<string, unknown>): Promise<unknown> } };
}
