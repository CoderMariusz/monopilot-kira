/**
 * FT-030 — `saveSamlConfig` Server Action tests.
 *
 * Pins the admin gate, the UPSERT path, and the Jackson `createConnection`
 * delegation. The DB and Jackson controllers are mocked so the tests run
 * without a live Postgres / SAML stack — the real integration is exercised
 * by the SAML route + DB integration tests already in the suite.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── vi.hoisted stubs (kept at module scope for vi.mock factory access) ──────
const {
  _mockClientQuery,
  _mockRegisterSamlConnection,
  _withOrgContextRunner,
} = vi.hoisted(() => {
  const _mockClientQuery = vi.fn();
  return {
    _mockClientQuery,
    _mockRegisterSamlConnection: vi.fn(),
    // The real withOrgContext wraps the action in a Postgres transaction.
    // The stub just hands back a stub client whose .query is the spy above.
    // Tests can override `userId`/`orgId` by adjusting the wrapper before each
    // case. The default values match the admin-success path; tests that need
    // a non-admin override the role-row mock instead.
    _withOrgContextRunner: vi.fn(),
  };
});

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) =>
    _withOrgContextRunner(action),
  ),
}));

vi.mock('../../lib/auth/saml', () => ({
  registerSamlConnection: _mockRegisterSamlConnection,
}));

const VALID_INPUT = {
  entityId: 'urn:idp.example.com',
  ssoUrl: 'https://idp.example.com/sso',
  x509Cert: '-----BEGIN CERTIFICATE-----\nMII...\n-----END CERTIFICATE-----',
  metadataUrl: 'https://idp.example.com/metadata.xml',
  enforceForNonAdmins: true,
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const TENANT_ID = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  _mockClientQuery.mockReset();
  _mockRegisterSamlConnection.mockReset();
  _withOrgContextRunner.mockReset();

  // Default success runner: feeds the action a stub client so it can issue
  // role / tenant / UPSERT queries through _mockClientQuery.
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) => {
    return action({
      userId: USER_ID,
      orgId: ORG_ID,
      sessionToken: 'session-token-stub',
      client: { query: _mockClientQuery },
    });
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('FT-030 — saveSamlConfig admin gate + UPSERT + Jackson registration', () => {
  it('returns { ok: false, error: forbidden } when actor has no admin role', async () => {
    // Role lookup returns no rows → not admin.
    _mockClientQuery.mockResolvedValueOnce({ rows: [] });

    const { saveSamlConfig } = await import(
      '../../app/(admin)/settings/saml/_actions/save-saml-config.js'
    );
    const result = await saveSamlConfig(VALID_INPUT);

    // MUTATION-PROOF: if implementation skips the role check, this turns
    // into 'persistence_failed' (different value) and the assertion catches.
    expect(result).toEqual({ ok: false, error: 'forbidden' });
    // Crucially: NO further DB writes, NO Jackson registration.
    expect(_mockClientQuery).toHaveBeenCalledTimes(1);
    expect(_mockRegisterSamlConnection).not.toHaveBeenCalled();
  });

  it('returns { ok: false, error: invalid_input } when required fields are blank', async () => {
    const { saveSamlConfig } = await import(
      '../../app/(admin)/settings/saml/_actions/save-saml-config.js'
    );
    const result = await saveSamlConfig({ ...VALID_INPUT, x509Cert: '' });

    expect(result).toEqual({ ok: false, error: 'invalid_input' });
    // MUTATION-PROOF: empty input must NOT reach withOrgContext / Jackson.
    expect(_withOrgContextRunner).not.toHaveBeenCalled();
    expect(_mockRegisterSamlConnection).not.toHaveBeenCalled();
  });

  it('UPSERTS tenant_idp_config and registers the connection on the happy path', async () => {
    // 1st query — admin role lookup → has org.access.admin
    _mockClientQuery.mockResolvedValueOnce({ rows: [{ slug: 'org.access.admin' }] });
    // 2nd query — tenant lookup
    _mockClientQuery.mockResolvedValueOnce({ rows: [{ tenant_id: TENANT_ID }] });
    // 3rd query — UPSERT (no rows returned, just acknowledged)
    _mockClientQuery.mockResolvedValueOnce({ rows: [] });

    _mockRegisterSamlConnection.mockResolvedValueOnce(undefined);

    const { saveSamlConfig } = await import(
      '../../app/(admin)/settings/saml/_actions/save-saml-config.js'
    );
    const result = await saveSamlConfig(VALID_INPUT);

    expect(result).toEqual({ ok: true });

    // Pin the SQL shape: the UPSERT (3rd query) must target tenant_idp_config
    // and use ON CONFLICT (tenant_id). MUTATION-PROOF: a regression that
    // accidentally writes to the wrong table would not match this regex.
    const upsertCall = _mockClientQuery.mock.calls[2]!;
    const upsertSql = upsertCall[0] as string;
    expect(upsertSql).toMatch(/insert\s+into\s+public\.tenant_idp_config/i);
    expect(upsertSql).toMatch(/on\s+conflict\s*\(\s*tenant_id\s*\)/i);
    expect(upsertSql).toMatch(/provider_type/);
    expect(upsertSql).toMatch(/enforce_for_non_admins/);

    // The UPSERT params must carry the resolved tenant_id (not org_id).
    const upsertParams = upsertCall[1] as unknown[];
    expect(upsertParams[0]).toBe(TENANT_ID);
    expect(upsertParams[1]).toBe(VALID_INPUT.entityId);
    expect(upsertParams[2]).toBe(VALID_INPUT.x509Cert);
    expect(upsertParams[3]).toBe(VALID_INPUT.metadataUrl);
    expect(upsertParams[4]).toBe(VALID_INPUT.enforceForNonAdmins);

    // Jackson registration: tenantId comes from the resolved tenant lookup,
    // and the cert + metadata are forwarded so signature verification works.
    expect(_mockRegisterSamlConnection).toHaveBeenCalledTimes(1);
    const regArg = _mockRegisterSamlConnection.mock.calls[0]![0] as {
      tenantId: string;
      tenantConfig: {
        provider_type: string;
        entity_id: string;
        x509_cert: string;
        metadata_url: string;
      };
    };
    expect(regArg.tenantId).toBe(TENANT_ID);
    expect(regArg.tenantConfig.provider_type).toBe('saml');
    expect(regArg.tenantConfig.entity_id).toBe(VALID_INPUT.entityId);
    expect(regArg.tenantConfig.x509_cert).toBe(VALID_INPUT.x509Cert);
    expect(regArg.tenantConfig.metadata_url).toBe(VALID_INPUT.metadataUrl);
  });

  it('returns saml_registration_failed (not raw error) when Jackson createConnection throws', async () => {
    _mockClientQuery.mockResolvedValueOnce({ rows: [{ slug: 'org.platform.admin' }] });
    _mockClientQuery.mockResolvedValueOnce({ rows: [{ tenant_id: TENANT_ID }] });
    _mockClientQuery.mockResolvedValueOnce({ rows: [] });

    _mockRegisterSamlConnection.mockRejectedValueOnce(
      new Error('jackson: cannot fetch IdP metadata: 404'),
    );

    const { saveSamlConfig } = await import(
      '../../app/(admin)/settings/saml/_actions/save-saml-config.js'
    );
    const result = await saveSamlConfig(VALID_INPUT);

    // MUTATION-PROOF: returning the raw error would leak internal details.
    expect(result).toEqual({ ok: false, error: 'saml_registration_failed' });
    expect(result).not.toMatchObject({ error: expect.stringMatching(/jackson|404|metadata/) });
  });

  it('returns persistence_failed (not raw error) when the UPSERT throws', async () => {
    _mockClientQuery.mockResolvedValueOnce({ rows: [{ slug: 'org.access.admin' }] });
    _mockClientQuery.mockResolvedValueOnce({ rows: [{ tenant_id: TENANT_ID }] });
    _mockClientQuery.mockRejectedValueOnce(
      new Error('duplicate key violates unique constraint "tenant_idp_config_pkey"'),
    );

    const { saveSamlConfig } = await import(
      '../../app/(admin)/settings/saml/_actions/save-saml-config.js'
    );
    const result = await saveSamlConfig(VALID_INPUT);

    expect(result).toEqual({ ok: false, error: 'persistence_failed' });
    // MUTATION-PROOF: must NOT fall through to Jackson on a DB failure (would
    // pollute the registry with stale connection rows).
    expect(_mockRegisterSamlConnection).not.toHaveBeenCalled();
  });

  it('admin gate accepts org.platform.admin (not just org.access.admin)', async () => {
    // Mutation-proof: hard-coding only org.access.admin in the slug list
    // would silently lock out platform admins. Pin the alternate path.
    _mockClientQuery.mockResolvedValueOnce({ rows: [{ slug: 'org.platform.admin' }] });
    _mockClientQuery.mockResolvedValueOnce({ rows: [{ tenant_id: TENANT_ID }] });
    _mockClientQuery.mockResolvedValueOnce({ rows: [] });
    _mockRegisterSamlConnection.mockResolvedValueOnce(undefined);

    const { saveSamlConfig } = await import(
      '../../app/(admin)/settings/saml/_actions/save-saml-config.js'
    );
    const result = await saveSamlConfig(VALID_INPUT);

    expect(result).toEqual({ ok: true });
  });
});
