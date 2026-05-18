import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  _withOrgContextRunner,
  _mockCreateConnection,
  _mockSpMetadata,
  _mockSamlResponse,
} = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
  _mockCreateConnection: vi.fn(),
  _mockSpMetadata: vi.fn(),
  _mockSamlResponse: vi.fn(),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) =>
    _withOrgContextRunner(action),
  ),
}));

vi.mock('../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) =>
    _withOrgContextRunner(action),
  ),
}));

vi.mock('@monopilot/db/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) =>
    _withOrgContextRunner(action),
  ),
}));

vi.mock('@boxyhq/saml-jackson', () => ({
  controllers: vi.fn(async () => ({
    oauthController: {
      samlResponse: _mockSamlResponse,
    },
    apiController: {
      createConnection: _mockCreateConnection,
      getMetadata: _mockSpMetadata,
      serviceProviderMetadata: _mockSpMetadata,
      metadata: _mockSpMetadata,
    },
    spMetadata: _mockSpMetadata,
    close: vi.fn(),
  })),
  default: vi.fn(async () => ({
    oauthController: {
      samlResponse: _mockSamlResponse,
    },
    apiController: {
      createConnection: _mockCreateConnection,
      getMetadata: _mockSpMetadata,
      serviceProviderMetadata: _mockSpMetadata,
      metadata: _mockSpMetadata,
    },
    spMetadata: _mockSpMetadata,
    close: vi.fn(),
  })),
}));

const repoRoot = resolve(__dirname, '../../../..');
const routePath = resolve(repoRoot, 'apps/web/app/api/auth/saml/[...slug]/route.ts');
const testConnectionPath = resolve(repoRoot, 'apps/web/actions/sso/test-connection.ts');

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SP_XML = `<?xml version="1.0"?><EntityDescriptor entityID="https://app.example.com/saml/${ORG_ID}"><SPSSODescriptor><AssertionConsumerService Location="https://app.example.com/api/auth/saml/callback" Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"/></SPSSODescriptor></EntityDescriptor>`;

type SsoConfigRow = {
  org_id: string;
  idp_type: 'saml_entra';
  display_name: string;
  metadata_url: string;
  entity_id: string;
  acs_url: string;
  x509_cert: string;
  jit_provisioning: boolean;
  default_role_code: string;
  enabled: boolean;
  last_test_status: 'ok' | 'failed' | 'never';
};

type QueryCall = { sql: string; params: unknown[] };
type FakeClient = {
  calls: QueryCall[];
  ssoConfig: SsoConfigRow;
  roleCodeAssigned: string | null;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

type TestSamlConnectionModule = {
  testSamlConnection: (input?: Record<string, unknown>) => Promise<{ ok: boolean; error?: string; data?: unknown }>;
};

type SamlRouteModule = {
  GET?: (request: Request, context: { params: { slug: string[] } }) => Promise<Response>;
  POST?: (request: Request, context: { params: { slug: string[] } }) => Promise<Response>;
};

let currentClient: FakeClient;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  currentClient = makeClient();
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, sessionToken: 'session-token-stub', client: currentClient }),
  );
  _mockCreateConnection.mockResolvedValue({ ok: true });
  _mockSpMetadata.mockResolvedValue(SP_XML);
  _mockSamlResponse.mockResolvedValue({
    profile: {
      id: 'entra-object-id-123',
      email: 'jit.user@apex.example.com',
      firstName: 'Jit',
      lastName: 'User',
    },
  });
});

describe('SSO SAML Entra Server Actions + route handlers (TASK-000114/T-033 RED)', () => {
  it('returns SP metadata XML from GET /api/auth/saml/metadata', async () => {
    const route = await loadSamlRoute();
    expect(typeof route.GET, 'SAML catch-all route must export GET for metadata').toBe('function');

    const response = await route.GET!(
      new Request(`https://app.example.com/api/auth/saml/metadata?org_id=${ORG_ID}`),
      { params: { slug: ['metadata'] } },
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type') ?? '').toMatch(/xml|saml/i);
    expect(body).toContain('<EntityDescriptor');
    expect(body).toContain('entityID=');
    expect(body).toContain('AssertionConsumerService');
  });

  it('forces enabled=false and last_test_status=failed when the mock IdP metadata round-trip fails', async () => {
    const { testSamlConnection } = await loadTestConnection();
    _mockCreateConnection.mockRejectedValueOnce(new Error('mock IdP metadata fetch failed'));

    const result = await testSamlConnection({ orgId: ORG_ID });

    expect(result).toMatchObject({ ok: false });
    expect(result.error ?? '').toMatch(/metadata|saml|idp|test/i);
    expect(currentClient.ssoConfig.enabled).toBe(false);
    expect(currentClient.ssoConfig.last_test_status).toBe('failed');
    expect(queryBlob()).toMatch(/enabled\s*=\s*false|enabled[^\n]+\$|last_test_status/i);
  });

  it('JIT provisioning from POST /api/auth/saml/callback assigns org_sso_config.default_role_code', async () => {
    const route = await loadSamlRoute();
    expect(typeof route.POST, 'SAML catch-all route must export POST for ACS callback').toBe('function');
    currentClient.ssoConfig.default_role_code = 'quality_viewer';

    const form = new URLSearchParams({
      SAMLResponse: Buffer.from('<samlp:Response>mock-idp-assertion</samlp:Response>').toString('base64'),
      RelayState: ORG_ID,
    });
    const response = await route.POST!(
      new Request('https://app.example.com/api/auth/saml/callback', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form,
      }),
      { params: { slug: ['callback'] } },
    );

    expect([200, 302, 303]).toContain(response.status);
    expect(_mockSamlResponse).toHaveBeenCalledOnce();
    expect(currentClient.roleCodeAssigned).toBe('quality_viewer');
    expect(queryBlob()).toContain('quality_viewer');
  });
});

async function loadTestConnection(): Promise<TestSamlConnectionModule> {
  expect(
    existsSync(testConnectionPath),
    'apps/web/actions/sso/test-connection.ts must exist and export testSamlConnection(input)',
  ).toBe(true);
  const mod = (await import(testConnectionPath)) as Partial<TestSamlConnectionModule>;
  if (typeof mod.testSamlConnection !== 'function') {
    expect.fail('apps/web/actions/sso/test-connection.ts must export testSamlConnection(input)');
  }
  return mod as TestSamlConnectionModule;
}

async function loadSamlRoute(): Promise<SamlRouteModule> {
  expect(
    existsSync(routePath),
    'apps/web/app/api/auth/saml/[...slug]/route.ts must exist and export GET/POST handlers',
  ).toBe(true);
  return (await import(routePath)) as SamlRouteModule;
}

function makeClient(): FakeClient {
  const calls: QueryCall[] = [];
  const ssoConfig: SsoConfigRow = {
    org_id: ORG_ID,
    idp_type: 'saml_entra',
    display_name: 'Apex Entra ID',
    metadata_url: 'https://idp.example.com/federationmetadata/2007-06/federationmetadata.xml',
    entity_id: `https://app.example.com/saml/${ORG_ID}`,
    acs_url: 'https://app.example.com/api/auth/saml/callback',
    x509_cert: '-----BEGIN CERTIFICATE-----\nMOCK_IDP_CERT\n-----END CERTIFICATE-----',
    jit_provisioning: true,
    default_role_code: 'viewer',
    enabled: true,
    last_test_status: 'never',
  };

  const client: FakeClient = {
    calls,
    ssoConfig,
    roleCodeAssigned: null,
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();

      if (normalized.includes('org_sso_config') && normalized.includes('select')) {
        return { rows: [ssoConfig], rowCount: 1 };
      }

      if (normalized.includes('org_sso_config') && normalized.includes('update')) {
        const blob = `${sql} ${JSON.stringify(params)}`.toLowerCase();
        if (blob.includes('failed') || blob.includes('false')) {
          ssoConfig.enabled = false;
          ssoConfig.last_test_status = 'failed';
        }
        if (blob.includes('ok') || blob.includes('true')) {
          ssoConfig.last_test_status = 'ok';
        }
        return { rows: [ssoConfig], rowCount: 1 };
      }

      if (normalized.includes('roles') && normalized.includes('select')) {
        return { rows: [{ id: 'role-quality-viewer', code: ssoConfig.default_role_code, slug: ssoConfig.default_role_code }], rowCount: 1 };
      }

      if ((normalized.includes('user_roles') || normalized.includes('users')) && normalized.includes('insert')) {
        const blob = `${sql} ${JSON.stringify(params)}`;
        if (blob.includes(ssoConfig.default_role_code) || blob.includes('role-quality-viewer')) {
          client.roleCodeAssigned = ssoConfig.default_role_code;
        }
        return { rows: [{ id: 'jit-user-id', email: 'jit.user@apex.example.com' }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };

  return client;
}

function queryBlob(): string {
  return currentClient.calls.map((call) => `${call.sql} ${JSON.stringify(call.params)}`).join('\n');
}
