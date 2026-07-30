import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const HOME_ORG_ID = '22222222-2222-4222-8222-222222222222';
const TARGET_ORG_ID = '33333333-3333-4333-8333-333333333333';

let platformOrgCookie: string | null;

async function loadSessionSurface() {
  vi.resetModules();
  vi.doMock('react', () => ({ cache: <T extends (...args: never[]) => unknown>(fn: T) => fn }));
  vi.doMock('next/headers', () => ({
    cookies: vi.fn(async () => ({
      get: vi.fn((name: string) =>
        name === 'mp_platform_org' && platformOrgCookie
          ? { value: platformOrgCookie }
          : undefined,
      ),
      delete: vi.fn((name: string) => {
        if (name === 'mp_platform_org') platformOrgCookie = null;
      }),
    })),
  }));
  vi.doMock('next/navigation', () => ({
    redirect: vi.fn((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    }),
  }));
  vi.doMock('./supabase-server', () => ({
    getCachedUser: vi.fn(async () => ({
      data: { user: { id: USER_ID } },
      error: null,
    })),
    createServerSupabaseClient: vi.fn(async () => ({
      auth: { signOut: vi.fn(async () => ({ error: null })) },
    })),
  }));
  vi.doMock('pg', () => ({
    default: {
      Pool: class {
        async query(sql: string) {
          const text = sql.replace(/\s+/g, ' ').trim().toLowerCase();
          if (text.startsWith('select org_id, is_active from public.users')) {
            return { rows: [{ org_id: HOME_ORG_ID, is_active: true }], rowCount: 1 };
          }
          if (text.includes('from app.platform_admins')) {
            return { rows: [{ ok: true }], rowCount: 1 };
          }
          if (text.includes('from public.organizations')) {
            return { rows: [{ id: TARGET_ORG_ID }], rowCount: 1 };
          }
          throw new Error(`unexpected query: ${text}`);
        }
      },
    },
  }));

  const [{ resolveContextFromSupabase }, { signOut }] = await Promise.all([
    import('./with-org-context'),
    import('../../app/[locale]/(app)/_actions/sign-out'),
  ]);
  return { resolveContextFromSupabase, signOut };
}

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://owner:owner@localhost:5432/monopilot_test';
  platformOrgCookie = TARGET_ORG_ID;
});

describe('XC-024 act-as session expiry', () => {
  it('uses an active act-as cookie for the current verified platform-admin session', async () => {
    const { resolveContextFromSupabase } = await loadSessionSurface();

    await expect(resolveContextFromSupabase()).resolves.toEqual({
      userId: USER_ID,
      orgId: TARGET_ORG_ID,
      actAsOrg: true,
    });
  });

  it('does not restore act-as after sign-out and a later verified login', async () => {
    const { resolveContextFromSupabase, signOut } = await loadSessionSurface();
    const formData = new FormData();
    formData.set('locale', 'pl');

    await expect(signOut(formData)).rejects.toThrow('NEXT_REDIRECT:/pl/login');

    await expect(resolveContextFromSupabase()).resolves.toEqual({
      userId: USER_ID,
      orgId: HOME_ORG_ID,
      actAsOrg: false,
    });
  });
});
