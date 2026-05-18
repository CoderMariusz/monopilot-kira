import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { _withOrgContextRunner, _mockCreateConnection } = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
  _mockCreateConnection: vi.fn(),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) =>
    _withOrgContextRunner(action),
  ),
}));

vi.mock('@boxyhq/saml-jackson', () => ({
  controllers: vi.fn(async () => ({
    apiController: { createConnection: _mockCreateConnection },
  })),
  default: vi.fn(async () => ({
    apiController: { createConnection: _mockCreateConnection },
  })),
}));

const repoRoot = resolve(__dirname, '../../../..');
const catchAllPath = resolve(repoRoot, 'apps/web/app/api/auth/saml/[...slug]/route.ts');
const metadataPath = resolve(repoRoot, 'apps/web/app/api/auth/saml/metadata/route.ts');
const callbackPath = resolve(repoRoot, 'apps/web/app/api/auth/saml/callback/route.ts');
const testConnectionPath = resolve(repoRoot, 'apps/web/actions/sso/test-connection.ts');

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

type QueryCall = { sql: string; params: unknown[] };
type FakeClient = {
  calls: QueryCall[];
  ssoConfig: Record<string, unknown>;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
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
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
});

describe('SAML route wiring uses real App Router endpoints, not the shadowed catch-all', () => {
  it('does not keep the shadowed [...slug] catch-all route', () => {
    expect(existsSync(catchAllPath)).toBe(false);
  });

  it('returns SP metadata XML from the real /api/auth/saml/metadata route', async () => {
    expect(existsSync(metadataPath), 'metadata route file must exist').toBe(true);
    const route = (await import(metadataPath)) as { GET: () => Promise<Response> };
    const response = await route.GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type') ?? '').toMatch(/xml|saml/i);
    expect(body).toContain('<EntityDescriptor');
    expect(body).toContain('/api/auth/saml/callback');
  });

  it('real ACS callback rejects malformed requests before any org-context wrapper', async () => {
    expect(existsSync(callbackPath), 'callback route file must exist').toBe(true);
    const route = (await import(callbackPath)) as { POST: (request: Request) => Promise<Response> };
    const response = await route.POST(new Request('https://app.example.com/api/auth/saml/callback', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(),
    }));

    expect(response.status).toBe(400);
    expect(_withOrgContextRunner).not.toHaveBeenCalled();
  });
});

describe('testSamlConnection behavior', () => {
  it('forces enabled=false and last_test_status=failed when the IdP metadata round-trip fails', async () => {
    const { testSamlConnection } = await import(testConnectionPath) as {
      testSamlConnection: (input?: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
    };
    _mockCreateConnection.mockRejectedValueOnce(new Error('mock IdP metadata fetch failed'));

    const result = await testSamlConnection({ orgId: ORG_ID });

    expect(result).toMatchObject({ ok: false });
    expect(result.error ?? '').toMatch(/saml|metadata|test/i);
    expect(currentClient.ssoConfig.enabled).toBe(false);
    expect(currentClient.ssoConfig.last_test_status).toBe('failed');
  });
});

function makeClient(): FakeClient {
  const calls: QueryCall[] = [];
  const ssoConfig: Record<string, unknown> = {
    org_id: ORG_ID,
    idp_type: 'saml_entra',
    display_name: 'Apex Entra ID',
    metadata_url: 'https://idp.example.com/federationmetadata.xml',
    entity_id: `https://app.example.com/saml/${ORG_ID}`,
    acs_url: 'https://app.example.com/api/auth/saml/callback',
    x509_cert: 'MOCK_IDP_CERT',
    jit_provisioning: true,
    default_role_code: 'viewer',
    enabled: true,
    last_test_status: 'never',
  };

  return {
    calls,
    ssoConfig,
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
      if (normalized.includes('from public.user_roles')) return { rows: [{ ok: true }], rowCount: 1 };
      if (normalized.includes('from public.org_sso_config')) return { rows: [ssoConfig], rowCount: 1 };
      if (normalized.startsWith('update public.org_sso_config')) {
        ssoConfig.enabled = false;
        ssoConfig.last_test_status = 'failed';
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}
