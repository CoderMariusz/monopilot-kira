import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NoActiveSiteError, withSiteContext } from './with-site-context';

const ORG_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const SITE_ID = '11111111-1111-4111-8111-111111111111';

type QueryArgs = { sql: string; params: readonly unknown[] };

let appClientQueries: QueryArgs[];
let ownerQueries: QueryArgs[];
let lifecycleEvents: string[];
/** What getActiveSiteId resolves to (cookie/default path). */
let resolvedSite: string | null;

// ─── Mocks ────────────────────────────────────────────────────────────────────

// withOrgContext: run the body with a fake org context + a spying app client,
// COMMIT-on-return / THROW-propagates exactly like the real one (we just let the
// promise resolve/reject — the real begin/commit lives behind this seam).
const orgClient = {
  query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
    appClientQueries.push({ sql, params });
    return { rows: [], rowCount: 0 };
  }),
};

const ownerPool = {
  query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
    ownerQueries.push({ sql, params });
    const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
    if (normalized.includes('insert into app.session_site_contexts')) {
      lifecycleEvents.push('owner:insert-site-session');
    }
    if (normalized.includes('delete from app.session_site_contexts')) {
      lifecycleEvents.push('owner:delete-site-session');
    }
    return { rows: [], rowCount: 0 };
  }),
};

vi.mock('./with-org-context', () => ({
  getOwnerPool: () => ownerPool,
  withOrgContext: vi.fn(
    async (action: (ctx: Record<string, unknown>) => Promise<unknown>) => {
      try {
        return await action({
          userId: USER_ID,
          orgId: ORG_ID,
          sessionToken: 'org-session-token',
          client: orgClient,
        });
      } finally {
        lifecycleEvents.push('withOrgContext:closed');
      }
    },
  ),
}));

vi.mock('../site/site-context', () => ({
  getActiveSiteId: vi.fn(async () => resolvedSite),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function setSiteCall(): QueryArgs | undefined {
  return appClientQueries.find((q) => normalize(q.sql).includes('app.set_site_context'));
}

function ownerRegisterCall(): QueryArgs | undefined {
  return ownerQueries.find((q) =>
    normalize(q.sql).includes('insert into app.session_site_contexts'),
  );
}

function ownerDeleteCall(): QueryArgs | undefined {
  return ownerQueries.find((q) =>
    normalize(q.sql).includes('delete from app.session_site_contexts'),
  );
}

beforeEach(() => {
  appClientQueries = [];
  ownerQueries = [];
  lifecycleEvents = [];
  resolvedSite = SITE_ID;
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('withSiteContext', () => {
  it('binds the resolved site GUC and exposes it on the context (write mode)', async () => {
    const ctxSiteId = await withSiteContext(async ({ siteId, orgId, userId }) => {
      expect(orgId).toBe(ORG_ID);
      expect(userId).toBe(USER_ID);
      return siteId;
    });

    expect(ctxSiteId).toBe(SITE_ID);

    // Registered the site session on the OWNER pool with the full tuple…
    const reg = ownerRegisterCall();
    expect(reg).toBeDefined();
    expect(reg!.params).toEqual([expect.any(String), USER_ID, ORG_ID, SITE_ID]);

    // …and set the GUC on the APP client inside the org transaction.
    const setCall = setSiteCall();
    expect(setCall).toBeDefined();
    // same fresh token used for register + set
    expect(setCall!.params[0]).toBe(reg!.params[0]);
    expect(setCall!.params[1]).toBe(SITE_ID);
  });

  it('deletes the registered site session after the withOrgContext envelope closes', async () => {
    await withSiteContext(async () => 'ok');

    const reg = ownerRegisterCall();
    const cleanup = ownerDeleteCall();
    expect(reg).toBeDefined();
    expect(cleanup).toBeDefined();
    expect(cleanup!.params).toEqual([reg!.params[0]]);
    expect(lifecycleEvents).toEqual([
      'owner:insert-site-session',
      'withOrgContext:closed',
      'owner:delete-site-session',
    ]);
  });

  it('fails closed: a WRITE with no resolvable active site throws NoActiveSiteError and never binds', async () => {
    resolvedSite = null;

    const body = vi.fn(async () => 'should-not-run');

    await expect(withSiteContext(body)).rejects.toBeInstanceOf(NoActiveSiteError);
    await expect(withSiteContext(body)).rejects.toMatchObject({ reason: 'no_active_site' });
    // Message names the remediation surface.
    await expect(withSiteContext(body)).rejects.toThrow(/Settings -> Sites/);

    expect(body).not.toHaveBeenCalled();
    // No GUC bind, no owner registration — fail BEFORE any site write.
    expect(setSiteCall()).toBeUndefined();
    expect(ownerRegisterCall()).toBeUndefined();
  });

  it('read mode scopes to ALL-sites (site NULL) instead of throwing when no site resolves', async () => {
    resolvedSite = null;

    const ctxSiteId = await withSiteContext({ mode: 'read' }, async ({ siteId }) => siteId);

    expect(ctxSiteId).toBeNull();
    // Bound ALL-sites: register + set with NULL.
    const reg = ownerRegisterCall();
    expect(reg).toBeDefined();
    expect(reg!.params).toEqual([expect.any(String), USER_ID, ORG_ID, null]);
    expect(setSiteCall()!.params[1]).toBeNull();
  });

  it('explicit site id overload binds that site and skips resolution', async () => {
    const { getActiveSiteId } = await import('../site/site-context');

    const ctxSiteId = await withSiteContext(SITE_ID, async ({ siteId }) => siteId);

    expect(ctxSiteId).toBe(SITE_ID);
    expect(getActiveSiteId).not.toHaveBeenCalled();
    expect(setSiteCall()!.params[1]).toBe(SITE_ID);
  });

  it('explicit null is a deliberate ALL-sites bind, allowed even in write mode (no throw)', async () => {
    const ctxSiteId = await withSiteContext(null, async ({ siteId }) => siteId);

    expect(ctxSiteId).toBeNull();
    expect(setSiteCall()!.params[1]).toBeNull();
  });

  it('treats explicit undefined siteId as not provided and still fails closed', async () => {
    const { getActiveSiteId } = await import('../site/site-context');
    resolvedSite = null;

    const body = vi.fn(async () => 'should-not-run');

    await expect(
      withSiteContext({ siteId: undefined }, body),
    ).rejects.toBeInstanceOf(NoActiveSiteError);

    expect(getActiveSiteId).toHaveBeenCalledWith({ client: orgClient });
    expect(body).not.toHaveBeenCalled();
    expect(ownerRegisterCall()).toBeUndefined();
    expect(ownerDeleteCall()).toBeUndefined();
  });

  it('propagates body errors so withOrgContext rolls back', async () => {
    const boom = new Error('body blew up');
    await expect(
      withSiteContext(async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });
});
