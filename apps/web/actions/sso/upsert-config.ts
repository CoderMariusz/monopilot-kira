'use server';

import { withOrgContext } from '../../lib/auth/with-org-context';

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
  | { ok: false; error: 'invalid_input' | 'persistence_failed' };

type QueryClient = {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export async function upsertSsoConfig(input: UpsertSsoConfigInput): Promise<UpsertSsoConfigResult> {
  const parsed = parseInput(input);
  if (!parsed) return { ok: false, error: 'invalid_input' };

  return withOrgContext(async ({ orgId, client }: { orgId: string; client: QueryClient }) => {
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

function parseInput(input: UpsertSsoConfigInput | null | undefined): Required<UpsertSsoConfigInput> | null {
  if (!input || typeof input !== 'object') return null;
  const idpType = input.idpType ?? 'saml_entra';
  if (!['saml_entra', 'saml_generic', 'oidc'].includes(idpType)) return null;
  const entityId = nonEmpty(input.entityId);
  const acsUrl = nonEmpty(input.acsUrl) ?? `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/auth/saml/callback`;
  const defaultRoleCode = nonEmpty(input.defaultRoleCode) ?? 'viewer';

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
