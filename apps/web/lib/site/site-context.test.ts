import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ALL_SITES_COOKIE_VALUE,
  asSiteId,
  getActiveSiteId,
  resolveWriteSiteId,
} from './site-context';

const cookiesMock = vi.fn();

vi.mock('next/headers', () => ({
  cookies: () => cookiesMock(),
}));

const SITE_A = '11111111-1111-4111-8111-111111111111';
const SITE_B = '22222222-2222-4222-8222-222222222222';

type Row = { id: string };

/**
 * Minimal RLS-bound client stub. `defaultRows` answers the `is_default` lookup
 * (getActiveSiteId step 3); `activeRows` answers the single-active fallback
 * (resolveWriteSiteId, `order by is_default desc ... limit 2`).
 */
function makeClient(defaultRows: Row[], activeRows: Row[]) {
  return {
    query: vi.fn(async (sql: string) => {
      const n = sql.replace(/\s+/g, ' ').toLowerCase();
      if (n.includes('and is_default')) return { rows: defaultRows };
      if (n.includes('order by is_default desc')) return { rows: activeRows };
      return { rows: [] as Row[] };
    }),
  };
}

describe('asSiteId', () => {
  it('rejects the all-sites cookie sentinel', () => {
    expect(asSiteId(ALL_SITES_COOKIE_VALUE)).toBeNull();
  });
});

describe('getActiveSiteId (all-sites sentinel vs absent cookie)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null for the explicit all-sites cookie without hitting org default', async () => {
    cookiesMock.mockResolvedValue({
      get: () => ({ value: ALL_SITES_COOKIE_VALUE }),
    });
    const client = makeClient([{ id: SITE_A }], []);
    await expect(getActiveSiteId({ client })).resolves.toBeNull();
    expect(client.query).not.toHaveBeenCalled();
  });

  it('falls through to org default when the cookie is absent', async () => {
    cookiesMock.mockResolvedValue({ get: () => undefined });
    const client = makeClient([{ id: SITE_A }], []);
    await expect(getActiveSiteId({ client })).resolves.toBe(SITE_A);
  });
});

describe('resolveWriteSiteId (F10 fail-closed site resolution)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookiesMock.mockRejectedValue(new Error('no request scope'));
  });

  it('uses the org default site when one is set', async () => {
    const client = makeClient([{ id: SITE_A }], []);
    await expect(resolveWriteSiteId(client)).resolves.toEqual({ ok: true, siteId: SITE_A });
  });

  it('falls back to the single active site when there is no default (unambiguous)', async () => {
    const client = makeClient([], [{ id: SITE_A }]);
    await expect(resolveWriteSiteId(client)).resolves.toEqual({ ok: true, siteId: SITE_A });
  });

  it('returns ambiguous_site when >1 active site and none is default', async () => {
    const client = makeClient([], [{ id: SITE_A }, { id: SITE_B }]);
    await expect(resolveWriteSiteId(client)).resolves.toEqual({ ok: false, reason: 'ambiguous_site' });
  });

  it('returns no_active_site when the org has zero active sites', async () => {
    const client = makeClient([], []);
    await expect(resolveWriteSiteId(client)).resolves.toEqual({ ok: false, reason: 'no_active_site' });
  });

  it('honours an explicit valid site id override without touching the DB fallback', async () => {
    const client = makeClient([], []);
    await expect(resolveWriteSiteId(client, SITE_B)).resolves.toEqual({ ok: true, siteId: SITE_B });
  });
});
