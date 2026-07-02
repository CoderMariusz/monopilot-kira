import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const HOME_ORG_ID = '22222222-2222-4222-8222-222222222222';
const TARGET_ORG_ID = '33333333-3333-4333-8333-333333333333';

type QueryCall = { sql: string; params: readonly unknown[] };

let cookieValue: string | null;
let adminBit: boolean;
let targetExists: boolean;
let calls: QueryCall[];

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

async function loadResolver() {
  vi.resetModules();

  vi.doMock('react', () => ({ cache: <T extends (...args: never[]) => unknown>(fn: T) => fn }));
  vi.doMock('next/headers', () => ({
    cookies: vi.fn(async () => ({
      get: vi.fn((name: string) => (name === 'mp_platform_org' && cookieValue ? { value: cookieValue } : undefined)),
    })),
  }));
  vi.doMock('./supabase-server', () => ({
    getCachedUser: vi.fn(async () => ({ data: { user: { id: USER_ID } }, error: null })),
  }));
  vi.doMock('pg', () => ({
    default: {
      Pool: class {
        async query(sql: string, params: readonly unknown[] = []) {
          calls.push({ sql, params });
          const text = normalize(sql);
          if (text.startsWith('select org_id from public.users')) {
            return { rows: [{ org_id: HOME_ORG_ID }], rowCount: 1 };
          }
          if (text.includes('from app.platform_admins')) {
            return { rows: adminBit ? [{ ok: true }] : [], rowCount: adminBit ? 1 : 0 };
          }
          if (text.includes('from public.organizations')) {
            return { rows: targetExists ? [{ id: TARGET_ORG_ID }] : [], rowCount: targetExists ? 1 : 0 };
          }
          if (text.startsWith('insert into app.platform_audit')) {
            return { rows: [], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }
      },
    },
  }));

  return import('./with-org-context');
}

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://owner:owner@localhost:5432/monopilot_test';
  cookieValue = null;
  adminBit = false;
  targetExists = true;
  calls = [];
});

describe('resolveContextFromSupabase platform org override', () => {
  it('honors the override when the cookie is present and the user is a platform admin', async () => {
    cookieValue = TARGET_ORG_ID;
    adminBit = true;

    const { resolveContextFromSupabase } = await loadResolver();

    await expect(resolveContextFromSupabase()).resolves.toEqual({
      userId: USER_ID,
      orgId: TARGET_ORG_ID,
      actAsOrg: true,
    });
  });

  it('falls back to home org and logs when the cookie is present but the user is not a platform admin', async () => {
    cookieValue = TARGET_ORG_ID;
    adminBit = false;

    const { resolveContextFromSupabase } = await loadResolver();

    await expect(resolveContextFromSupabase()).resolves.toEqual({
      userId: USER_ID,
      orgId: HOME_ORG_ID,
      actAsOrg: false,
    });
    expect(calls.some((call) => normalize(call.sql).startsWith('insert into app.platform_audit'))).toBe(true);
  });

  it('falls back to home org when the cookie is absent and the user is a platform admin', async () => {
    cookieValue = null;
    adminBit = true;

    const { resolveContextFromSupabase } = await loadResolver();

    await expect(resolveContextFromSupabase()).resolves.toEqual({
      userId: USER_ID,
      orgId: HOME_ORG_ID,
      actAsOrg: false,
    });
  });

  it('falls back to home org when the cookie is absent and the user is not a platform admin', async () => {
    cookieValue = null;
    adminBit = false;

    const { resolveContextFromSupabase } = await loadResolver();

    await expect(resolveContextFromSupabase()).resolves.toEqual({
      userId: USER_ID,
      orgId: HOME_ORG_ID,
      actAsOrg: false,
    });
  });
});
