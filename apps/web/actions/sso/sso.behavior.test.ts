import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

const { _withOrgContextRunner } = vi.hoisted(() => ({
  _withOrgContextRunner: vi.fn(),
}));

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: unknown) => Promise<unknown>) =>
    _withOrgContextRunner(action),
  ),
}));

type QueryCall = { sql: string; params: unknown[] };

type ClientOpts = {
  hasSsoEditPermission: boolean;
  rolesByCode?: Record<string, { id: string; code: string; is_system: boolean }>;
  ssoConfigExists?: boolean;
};

type FakeClient = {
  calls: QueryCall[];
  upsertedConfig: Record<string, unknown> | null;
  ssoUpdates: Array<{ enabled?: boolean; status?: string }>;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

function makeClient(opts: ClientOpts): FakeClient {
  const rolesByCode = opts.rolesByCode ?? {};
  const calls: QueryCall[] = [];
  const client: FakeClient = {
    calls,
    upsertedConfig: null,
    ssoUpdates: [],
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      const norm = sql.replace(/\s+/g, ' ').trim().toLowerCase();

      if (norm.startsWith('select') && norm.includes('user_roles') && norm.includes('role_permissions')) {
        return {
          rows: opts.hasSsoEditPermission ? [{ ok: true }] : [],
          rowCount: opts.hasSsoEditPermission ? 1 : 0,
        };
      }

      if (norm.startsWith('select') && norm.includes('from public.roles') && norm.includes('where')) {
        const code = params[0] as string;
        const role = rolesByCode[code];
        return { rows: role ? [role] : [], rowCount: role ? 1 : 0 };
      }

      if (norm.startsWith('insert into public.org_sso_config')) {
        client.upsertedConfig = {
          idpType: params[0],
          displayName: params[1],
          metadataUrl: params[2],
          entityId: params[3],
          acsUrl: params[4],
          x509Cert: params[5],
          oidcIssuerUrl: params[6],
          oidcClientId: params[7],
          oidcClientSecretVaultKey: params[8],
          enforceForNonAdmins: params[9],
          jitProvisioning: params[10],
          defaultRoleCode: params[11],
          enabled: params[12],
        };
        return { rows: [{ org_id: ORG_ID, enabled: params[12] }], rowCount: 1 };
      }

      if (norm.startsWith('select') && norm.includes('from public.org_sso_config')) {
        if (opts.ssoConfigExists === false) return { rows: [], rowCount: 0 };
        return {
          rows: [
            {
              org_id: ORG_ID,
              idp_type: 'saml_entra',
              display_name: 'SSO',
              entity_id: 'urn:test',
              acs_url: 'https://app.example.com/api/auth/saml/callback',
              x509_cert: '',
              jit_provisioning: true,
              default_role_code: 'viewer',
              enabled: true,
              last_test_status: 'never',
            },
          ],
          rowCount: 1,
        };
      }

      if (norm.startsWith('update public.org_sso_config')) {
        const blob = `${sql} ${JSON.stringify(params)}`.toLowerCase();
        const enabled = blob.includes('enabled = false') ? false : undefined;
        client.ssoUpdates.push({ enabled });
        return { rows: [{ org_id: ORG_ID, enabled: false }], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    },
  };
  return client;
}

let currentClient: FakeClient;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  _withOrgContextRunner.mockImplementation(async (action: (ctx: unknown) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, sessionToken: 'sess', client: currentClient }),
  );
  delete process.env.NEXT_PUBLIC_APP_URL;
  (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
});

type UpsertModule = typeof import('./upsert-config.ts');
type DisableModule = typeof import('./disable.ts');

async function loadUpsert(): Promise<UpsertModule> {
  const path = `${__dirname}/upsert-config.ts`;
  return (await import(path)) as UpsertModule;
}
async function loadDisable(): Promise<DisableModule> {
  const path = `${__dirname}/disable.ts`;
  return (await import(path)) as DisableModule;
}

describe('SSO upsertSsoConfig RBAC + validation (behavior)', () => {
  it('returns forbidden when caller lacks settings.sso.edit permission', async () => {
    currentClient = makeClient({ hasSsoEditPermission: false });
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';

    const { upsertSsoConfig } = await loadUpsert();
    const result = await upsertSsoConfig({
      idpType: 'saml_entra',
      entityId: 'urn:test',
      defaultRoleCode: 'viewer',
      enabled: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('forbidden');
    expect(currentClient.upsertedConfig).toBeNull();
  });

  it('rejects when NEXT_PUBLIC_APP_URL is missing in production (no localhost fallback)', async () => {
    currentClient = makeClient({
      hasSsoEditPermission: true,
      rolesByCode: { viewer: { id: 'role-viewer', code: 'viewer', is_system: false } },
    });

    const { upsertSsoConfig } = await loadUpsert();
    const result = await upsertSsoConfig({
      idpType: 'saml_entra',
      entityId: 'urn:test',
      defaultRoleCode: 'viewer',
      enabled: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_input');
    expect(currentClient.upsertedConfig).toBeNull();
  });

  it('rejects defaultRoleCode that grants org access admin (no silent owner grant)', async () => {
    currentClient = makeClient({
      hasSsoEditPermission: true,
      rolesByCode: {
        'org.access.admin': { id: 'role-owner', code: 'org.access.admin', is_system: true },
      },
    });
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';

    const { upsertSsoConfig } = await loadUpsert();
    const result = await upsertSsoConfig({
      idpType: 'saml_entra',
      entityId: 'urn:test',
      defaultRoleCode: 'org.access.admin',
      enabled: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_input');
    expect(currentClient.upsertedConfig).toBeNull();
  });

  it('rejects defaultRoleCode that does not exist in caller org', async () => {
    currentClient = makeClient({
      hasSsoEditPermission: true,
      rolesByCode: {},
    });
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';

    const { upsertSsoConfig } = await loadUpsert();
    const result = await upsertSsoConfig({
      idpType: 'saml_entra',
      entityId: 'urn:test',
      defaultRoleCode: 'ghost-role',
      enabled: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_input');
    expect(currentClient.upsertedConfig).toBeNull();
  });

  it('persists when caller has permission, role exists, and base URL is valid', async () => {
    currentClient = makeClient({
      hasSsoEditPermission: true,
      rolesByCode: {
        viewer: { id: 'role-viewer', code: 'viewer', is_system: false },
      },
    });
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';

    const { upsertSsoConfig } = await loadUpsert();
    const result = await upsertSsoConfig({
      idpType: 'saml_entra',
      entityId: 'urn:test',
      defaultRoleCode: 'viewer',
      enabled: true,
    });

    expect(result.ok).toBe(true);
    expect(currentClient.upsertedConfig?.defaultRoleCode).toBe('viewer');
    expect(currentClient.upsertedConfig?.acsUrl).toMatch(/^https:\/\/app\.example\.com/);
  });

  it('rejects external acsUrl origins before persistence', async () => {
    currentClient = makeClient({
      hasSsoEditPermission: true,
      rolesByCode: {
        viewer: { id: 'role-viewer', code: 'viewer', is_system: false },
      },
    });
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';

    const { upsertSsoConfig } = await loadUpsert();
    const result = await upsertSsoConfig({
      idpType: 'saml_entra',
      entityId: 'urn:test',
      acsUrl: 'https://evil.example.net/api/auth/saml/callback',
      defaultRoleCode: 'viewer',
      enabled: true,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('invalid_input');
    expect(currentClient.upsertedConfig).toBeNull();
  });
});

describe('SSO disableSso RBAC (behavior)', () => {
  it('returns forbidden when caller lacks settings.sso.edit permission', async () => {
    currentClient = makeClient({ hasSsoEditPermission: false });
    const { disableSso } = await loadDisable();
    const result = await disableSso();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('forbidden');
    expect(currentClient.ssoUpdates.length).toBe(0);
  });

  it('disables when caller has permission', async () => {
    currentClient = makeClient({ hasSsoEditPermission: true });
    const { disableSso } = await loadDisable();
    const result = await disableSso();

    expect(result.ok).toBe(true);
    expect(currentClient.ssoUpdates.length).toBeGreaterThan(0);
  });
});
