import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

const withOrgContextMock = vi.fn();

vi.mock('../../lib/auth/with-org-context', () => ({
  withOrgContext: (action: (ctx: unknown) => Promise<unknown>) => withOrgContextMock(action),
}));

vi.mock('../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

describe('upsertSecurityPolicy atomicity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('does not run MFA/outbox side effects when org_security_policies persist throws', async () => {
    const queryCalls: string[] = [];

    withOrgContextMock.mockImplementation(async (action) => {
      const client = {
        query: vi.fn(async (sql: string) => {
          const normalized = normalizeSql(sql);
          queryCalls.push(normalized);

          if (normalized.includes('from public.user_roles')) {
            return { rows: [{ ok: true }] };
          }
          if (normalized.includes('insert into public.org_security_policies')) {
            throw new Error('column "mfa_requirement" of relation "org_security_policies" does not exist');
          }
          return { rows: [] };
        }),
      };
      return action({ userId: USER_ID, orgId: ORG_ID, client });
    });

    const { upsertSecurityPolicy } = await import('./upsert-policy');
    const result = await upsertSecurityPolicy({
      mfa_requirement: 'required_all',
      mfa_allowed_methods: ['totp'],
    });

    expect(result).toEqual({ ok: false, error: 'persistence_failed' });
    expect(queryCalls.some((sql) => sql.includes('requires_mfa_at'))).toBe(false);
    expect(queryCalls.some((sql) => sql.includes('org.mfa_enrollment.forced'))).toBe(false);
    expect(queryCalls.some((sql) => sql.includes('insert into public.outbox_events'))).toBe(false);
    expect(queryCalls.some((sql) => sql.includes('insert into public.audit_log'))).toBe(false);
    expect(queryCalls.filter((sql) => sql.includes('insert into public.org_security_policies'))).toHaveLength(1);
  });

  it('persists MFA policy fields through app.upsert_my_tenant_idp_policy after org_security_policies upsert', async () => {
    const queryCalls: string[] = [];

    withOrgContextMock.mockImplementation(async (action) => {
      const client = {
        query: vi.fn(async (sql: string) => {
          const normalized = normalizeSql(sql);
          queryCalls.push(normalized);

          if (normalized.includes('from public.user_roles')) {
            return { rows: [{ ok: true }] };
          }
          if (normalized.includes('insert into public.org_security_policies')) {
            return { rows: [{ org_id: ORG_ID }] };
          }
          if (normalized.includes('app.upsert_my_tenant_idp_policy')) {
            return { rows: [{ ok: true }] };
          }
          if (normalized.includes('insert into public.outbox_events')) {
            return { rows: [], rowCount: 1 };
          }
          if (normalized.includes('insert into public.audit_log')) {
            return { rows: [], rowCount: 1 };
          }
          return { rows: [] };
        }),
      };
      return action({ userId: USER_ID, orgId: ORG_ID, client });
    });

    const { upsertSecurityPolicy } = await import('./upsert-policy');
    const result = await upsertSecurityPolicy({
      mfa_requirement: 'optional',
      mfa_allowed_methods: ['totp'],
    });

    expect(result.ok).toBe(true);
    const policyIndex = queryCalls.findIndex((sql) => sql.includes('insert into public.org_security_policies'));
    const idpIndex = queryCalls.findIndex((sql) => sql.includes('app.upsert_my_tenant_idp_policy'));
    expect(policyIndex).toBeGreaterThanOrEqual(0);
    expect(idpIndex).toBeGreaterThan(policyIndex);
  });

  it('returns persistence_failed when app.upsert_my_tenant_idp_policy returns false', async () => {
    withOrgContextMock.mockImplementation(async (action) => {
      const client = {
        query: vi.fn(async (sql: string) => {
          const normalized = normalizeSql(sql);
          if (normalized.includes('from public.user_roles')) {
            return { rows: [{ ok: true }] };
          }
          if (normalized.includes('insert into public.org_security_policies')) {
            return { rows: [{ org_id: ORG_ID }] };
          }
          if (normalized.includes('app.upsert_my_tenant_idp_policy')) {
            return { rows: [{ ok: false }] };
          }
          return { rows: [] };
        }),
      };
      return action({ userId: USER_ID, orgId: ORG_ID, client });
    });

    const { upsertSecurityPolicy } = await import('./upsert-policy');
    const result = await upsertSecurityPolicy({
      mfa_requirement: 'optional',
      mfa_allowed_methods: ['totp'],
    });

    expect(result).toEqual({ ok: false, error: 'persistence_failed' });
  });

  it('runs MFA markers only after org_security_policies upsert succeeds', async () => {
    const queryCalls: string[] = [];

    withOrgContextMock.mockImplementation(async (action) => {
      const client = {
        query: vi.fn(async (sql: string) => {
          const normalized = normalizeSql(sql);
          queryCalls.push(normalized);

          if (normalized.includes('from public.user_roles')) {
            return { rows: [{ ok: true }] };
          }
          if (normalized.includes('insert into public.org_security_policies')) {
            return { rows: [{ org_id: ORG_ID }] };
          }
          if (normalized.includes('app.upsert_my_tenant_idp_policy')) {
            return { rows: [{ ok: true }] };
          }
          if (normalized.includes('update public.users') && normalized.includes('requires_mfa_at')) {
            return { rows: [], rowCount: 1 };
          }
          if (normalized.includes('insert into public.outbox_events')) {
            return { rows: [], rowCount: 1 };
          }
          if (normalized.includes('insert into public.audit_log')) {
            return { rows: [], rowCount: 1 };
          }
          return { rows: [] };
        }),
      };
      return action({ userId: USER_ID, orgId: ORG_ID, client });
    });

    const { upsertSecurityPolicy } = await import('./upsert-policy');
    const result = await upsertSecurityPolicy({
      mfa_requirement: 'required_admins',
      mfa_allowed_methods: ['totp'],
    });

    expect(result.ok).toBe(true);
    const policyIndex = queryCalls.findIndex((sql) => sql.includes('insert into public.org_security_policies'));
    const mfaIndex = queryCalls.findIndex((sql) => sql.includes('requires_mfa_at'));
    expect(policyIndex).toBeGreaterThanOrEqual(0);
    expect(mfaIndex).toBeGreaterThan(policyIndex);
  });

  it('runs forceAllUsersMfa only after org_security_policies upsert succeeds for required_all', async () => {
    const queryCalls: string[] = [];
    const outboxEventTypes: string[] = [];

    withOrgContextMock.mockImplementation(async (action) => {
      const client = {
        query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
          const normalized = normalizeSql(sql);
          queryCalls.push(normalized);

          if (normalized.includes('from public.user_roles')) {
            return { rows: [{ ok: true }] };
          }
          if (normalized.includes('insert into public.org_security_policies')) {
            return { rows: [{ org_id: ORG_ID }] };
          }
          if (normalized.includes('app.upsert_my_tenant_idp_policy')) {
            return { rows: [{ ok: true }] };
          }
          if (normalized.includes('update public.users') && normalized.includes('is_active = true')) {
            return { rows: [], rowCount: 3 };
          }
          if (normalized.includes('insert into public.outbox_events')) {
            outboxEventTypes.push(String(params?.[1] ?? ''));
            return { rows: [], rowCount: 1 };
          }
          if (normalized.includes('insert into public.audit_log')) {
            return { rows: [], rowCount: 1 };
          }
          return { rows: [] };
        }),
      };
      return action({ userId: USER_ID, orgId: ORG_ID, client });
    });

    const { upsertSecurityPolicy } = await import('./upsert-policy');
    const result = await upsertSecurityPolicy({
      mfa_requirement: 'required_all',
      mfa_allowed_methods: ['totp', 'sms'],
    });

    expect(result.ok).toBe(true);
    const policyIndex = queryCalls.findIndex((sql) => sql.includes('insert into public.org_security_policies'));
    const allUsersMfaIndex = queryCalls.findIndex(
      (sql) => sql.includes('update public.users') && sql.includes('is_active = true'),
    );
    const adminMfaUpdateIndex = queryCalls.findIndex(
      (sql) => sql.includes('update public.users u') && sql.includes('from public.user_roles ur'),
    );
    expect(policyIndex).toBeGreaterThanOrEqual(0);
    expect(allUsersMfaIndex).toBeGreaterThan(policyIndex);
    expect(adminMfaUpdateIndex).toBe(-1);
    expect(outboxEventTypes).toContain('org.security_policy.updated');
    expect(outboxEventTypes).toContain('org.mfa_enrollment.forced');
    expect(outboxEventTypes.indexOf('org.security_policy.updated')).toBeGreaterThan(
      outboxEventTypes.indexOf('org.mfa_enrollment.forced'),
    );
  });
});
