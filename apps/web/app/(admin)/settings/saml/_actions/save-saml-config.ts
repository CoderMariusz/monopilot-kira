'use server';

import { upsertSsoConfig } from '../../../../../actions/sso/upsert-config';

export interface SaveSamlConfigInput {
  entityId: string;
  ssoUrl: string;
  x509Cert: string;
  metadataUrl: string;
  enforceForNonAdmins: boolean;
}

export type SaveSamlConfigError =
  | 'forbidden'
  | 'invalid_input'
  | 'persistence_failed';

export type SaveSamlConfigResult =
  | { ok: true }
  | { ok: false; error: SaveSamlConfigError };

/**
 * Legacy non-localized SAML action shim.
 *
 * SSO configuration is now owned by actions/sso/upsert-config.ts and persisted
 * to public.org_sso_config. Keep this export for old imports, but do not write
 * the legacy tenant_idp_config path from here.
 */
export async function saveSamlConfig(input: SaveSamlConfigInput): Promise<SaveSamlConfigResult> {
  if (
    !input ||
    typeof input !== 'object' ||
    !input.entityId ||
    !input.ssoUrl ||
    !input.x509Cert ||
    !input.metadataUrl
  ) {
    return { ok: false, error: 'invalid_input' };
  }

  const result = await upsertSsoConfig({
    idpType: 'saml_generic',
    displayName: 'SAML',
    metadataUrl: input.metadataUrl,
    entityId: input.entityId,
    x509Cert: input.x509Cert,
    enforceForNonAdmins: input.enforceForNonAdmins,
    jitProvisioning: true,
    defaultRoleCode: 'org.member',
    enabled: true,
  });

  if (result.ok) return { ok: true };
  return { ok: false, error: result.error };
}
