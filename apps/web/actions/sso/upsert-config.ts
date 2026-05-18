'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';

const SSO_EDIT_PERMISSION = 'settings.sso.edit';

const FORBIDDEN_DEFAULT_ROLE_CODES = new Set([
  'owner',
  'admin',
  'org.access.admin',
  'org.platform.admin',
  'org.schema.admin',
]);

export type UpsertSsoConfigInput = {
  idpType?: 'saml_entra' | 'saml_generic' | 'oidc';
  displayName?: string;
  metadataUrl?: string;
  entityId?: string;
  acsUrl?: string;
  x509Cert?: string;
  enforceForNonAdmins?: boolean;
  jitProvisioning?: boolean;
  defaultRoleCode?: string;
  oidcIssuerUrl?: string;
  oidcClientId?: string;
  oidcClientSecretVaultKey?: string;
  enabled?: boolean;
};

export type UpsertSsoConfigResult =
  | { ok: true; data: { orgId: string; enabled: boolean } }
  | { ok: false; error: 'invalid_input' | 'forbidden' | 'persistence_failed' };

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

type ParsedInput = Required<Omit<UpsertSsoConfigInput, 'acsUrl' | 'defaultRoleCode'>> & {
  acsUrl: string;
  defaultRoleCode: string;
};

export async function upsertSsoConfig(input: UpsertSsoConfigInput): Promise<UpsertSsoConfigResult> {
  const baseUrl = resolveBaseUrl();
  if (!baseUrl) return { ok: false, error: 'invalid_input' };

  const parsed = parseInput(input, baseUrl);
  if (!parsed) return { ok: false, error: 'invalid_input' };

  return withOrgContext(async ({ userId, orgId, client }: { userId: string; orgId: string; client: QueryClient }) => {
    if (!(await hasPermission(client, userId, orgId, SSO_EDIT_PERMISSION))) {
      return { ok: false, error: 'forbidden' };
    }

    if (FORBIDDEN_DEFAULT_ROLE_CODES.has(parsed.defaultRoleCode)) {
      return { ok: false, error: 'invalid_input' };
    }
    if (!(await roleExistsInOrg(client, orgId, parsed.defaultRoleCode))) {
      return { ok: false, error: 'invalid_input' };
    }

    try {
      const { rows } = await client.query<{ org_id: string; enabled: boolean }>(
        `insert into public.org_sso_config (
           org_id, idp_type, display_name, metadata_url, entity_id, acs_url, x509_cert,
           oidc_issuer_url, oidc_client_id, oidc_client_secret_vault_key,
           enforce_for_non_admins, jit_provisioning, default_role_code, enabled,
           last_test_status, created_at, updated_at
         ) values (
           app.current_org_id(), $1, $2, $3, $4, $5, $6,
           $7, $8, $9, $10, $11, $12, $13, 'never', now(), now()
         )
         on conflict (org_id) do update set
           idp_type = excluded.idp_type,
           display_name = excluded.display_name,
           metadata_url = excluded.metadata_url,
           entity_id = excluded.entity_id,
           acs_url = excluded.acs_url,
           x509_cert = excluded.x509_cert,
           oidc_issuer_url = excluded.oidc_issuer_url,
           oidc_client_id = excluded.oidc_client_id,
           oidc_client_secret_vault_key = excluded.oidc_client_secret_vault_key,
           enforce_for_non_admins = excluded.enforce_for_non_admins,
           jit_provisioning = excluded.jit_provisioning,
           default_role_code = excluded.default_role_code,
           enabled = excluded.enabled,
           updated_at = now()
         returning org_id, enabled`,
        [
          parsed.idpType,
          parsed.displayName,
          parsed.metadataUrl,
          parsed.entityId,
          parsed.acsUrl,
          parsed.x509Cert,
          parsed.oidcIssuerUrl,
          parsed.oidcClientId,
          parsed.oidcClientSecretVaultKey,
          parsed.enforceForNonAdmins,
          parsed.jitProvisioning,
          parsed.defaultRoleCode,
          parsed.enabled,
        ],
      );
      const row = rows[0];
      return { ok: true, data: { orgId: row?.org_id ?? orgId, enabled: row?.enabled ?? parsed.enabled } };
    } catch {
      return { ok: false, error: 'persistence_failed' };
    }
  });
}

function resolveBaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (typeof raw === 'string' && raw.trim().length > 0) {
    try {
      const url = new URL(raw.trim());
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      // Production must use a real (non-localhost) HTTPS-capable base URL.
      if (process.env.NODE_ENV === 'production') {
        const host = url.hostname.toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return null;
      }
      return url.origin;
    } catch {
      return null;
    }
  }
  // In non-production environments, default to localhost for developer UX. In
  // production, missing NEXT_PUBLIC_APP_URL is a configuration error — we do
  // not fall back to localhost which would route the ACS into a dead endpoint.
  if (process.env.NODE_ENV === 'production') return null;
  return 'http://localhost:3000';
}

function parseInput(input: UpsertSsoConfigInput | null | undefined, baseUrl: string): ParsedInput | null {
  if (!input || typeof input !== 'object') return null;
  const idpType = input.idpType ?? 'saml_entra';
  if (!['saml_entra', 'saml_generic', 'oidc'].includes(idpType)) return null;
  const entityId = nonEmpty(input.entityId);
  const acsUrl = nonEmpty(input.acsUrl) ?? `${baseUrl}/api/auth/saml/callback`;
  const defaultRoleCode = nonEmpty(input.defaultRoleCode);
  if (!defaultRoleCode) return null;

  if ((idpType === 'saml_entra' || idpType === 'saml_generic') && !entityId) return null;

  return {
    idpType,
    displayName: nonEmpty(input.displayName) ?? 'SSO',
    metadataUrl: nonEmpty(input.metadataUrl) ?? '',
    entityId: entityId ?? '',
    acsUrl,
    x509Cert: nonEmpty(input.x509Cert) ?? '',
    oidcIssuerUrl: nonEmpty(input.oidcIssuerUrl) ?? '',
    oidcClientId: nonEmpty(input.oidcClientId) ?? '',
    oidcClientSecretVaultKey: nonEmpty(input.oidcClientSecretVaultKey) ?? '',
    enforceForNonAdmins: input.enforceForNonAdmins === true,
    jitProvisioning: input.jitProvisioning !== false,
    defaultRoleCode,
    enabled: input.enabled === true,
  };
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

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

async function roleExistsInOrg(client: QueryClient, orgId: string, code: string): Promise<boolean> {
  const { rows } = await client.query<{ id: string }>(
    `select id from public.roles where org_id = $2::uuid and (code = $1 or slug = $1) limit 1`,
    [code, orgId],
  );
  return rows.length > 0;
}
