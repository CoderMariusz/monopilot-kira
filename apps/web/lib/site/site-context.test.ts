import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveWriteSiteId } from './site-context';

// getActiveSiteId reads next/headers cookies(). In a unit test there is no request
// scope, so cookies() throws and the resolver falls through to the DB lookups —
// exactly the "All sites" path this test exercises. Mock it to keep it deterministic.
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => {
    throw new Error('no request scope');
  }),
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

describe('resolveWriteSiteId (F10 fail-closed site resolution)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
