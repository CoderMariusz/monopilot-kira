import { afterEach, describe, expect, it, vi } from 'vitest';

const { _upsertSsoConfig } = vi.hoisted(() => ({
  _upsertSsoConfig: vi.fn(),
}));

vi.mock('../../actions/sso/upsert-config', () => ({
  upsertSsoConfig: _upsertSsoConfig,
}));

const VALID_INPUT = {
  entityId: 'urn:idp.example.com',
  ssoUrl: 'https://app.example.com/api/auth/saml/callback',
  x509Cert: '-----BEGIN CERTIFICATE-----\nMII...\n-----END CERTIFICATE-----',
  metadataUrl: 'https://idp.example.com/metadata.xml',
  enforceForNonAdmins: true,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('legacy saveSamlConfig shim', () => {
  it('delegates to canonical org_sso_config upsert and never writes tenant_idp_config itself', async () => {
    _upsertSsoConfig.mockResolvedValueOnce({ ok: true, data: { orgId: 'org-1', enabled: true } });

    const { saveSamlConfig } = await import(
      '../../app/(admin)/settings/saml/_actions/save-saml-config.js'
    );
    const result = await saveSamlConfig(VALID_INPUT);

    expect(result).toEqual({ ok: true });
    expect(_upsertSsoConfig).toHaveBeenCalledWith({
      idpType: 'saml_generic',
      displayName: 'SAML',
      metadataUrl: VALID_INPUT.metadataUrl,
      entityId: VALID_INPUT.entityId,
      x509Cert: VALID_INPUT.x509Cert,
      enforceForNonAdmins: true,
      jitProvisioning: true,
      defaultRoleCode: 'org.member',
      enabled: true,
    });
  });

  it('maps canonical SSO errors onto the legacy result shape', async () => {
    _upsertSsoConfig.mockResolvedValueOnce({ ok: false, error: 'forbidden' });

    const { saveSamlConfig } = await import(
      '../../app/(admin)/settings/saml/_actions/save-saml-config.js'
    );
    const result = await saveSamlConfig(VALID_INPUT);

    expect(result).toEqual({ ok: false, error: 'forbidden' });
  });

  it('rejects malformed legacy input before reaching the canonical action', async () => {
    const { saveSamlConfig } = await import(
      '../../app/(admin)/settings/saml/_actions/save-saml-config.js'
    );
    const result = await saveSamlConfig({ ...VALID_INPUT, x509Cert: '' });

    expect(result).toEqual({ ok: false, error: 'invalid_input' });
    expect(_upsertSsoConfig).not.toHaveBeenCalled();
  });
});
