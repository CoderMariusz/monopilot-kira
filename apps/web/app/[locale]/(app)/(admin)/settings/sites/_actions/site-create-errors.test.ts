/**
 * R02-06 — creating a site reported real failures as "This field is required."
 *
 * A duplicate code, a rejected timezone and a schema rejection all collapsed into
 * the bare `'invalid_input'`, which the modal rendered as a missing-field message
 * on a form where every field was filled in. Plus: site codes were not uppercased,
 * so `waw` slipped past the case-sensitive `sites_org_code_uq` next to `WAW`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(),
}));

vi.mock('../../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));

vi.mock('../../../../../../../actions/infra/line', () => ({
  upsertLine: vi.fn(),
}));

import { withOrgContext } from '../../../../../../../lib/auth/with-org-context';
import { createSite } from './sites';

// The text the modal used to show for EVERY schema rejection. Duplicated here
// rather than imported: `modal-utils` pulls in .tsx client modules, which this
// node-environment suite does not transform (see modal-utils.test.tsx for the
// mapping itself).
const MISSING_FIELD_LABEL = 'This field is required.';

const ORG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SITE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

type QueryHandler = (sql: string, params?: readonly unknown[]) => { rows: Record<string, unknown>[]; rowCount?: number };

type Txn = { committed: boolean; rolledBack: boolean; calls: Array<{ sql: string; params?: readonly unknown[] }> };

/**
 * Mirrors the real `withOrgContext` transaction contract (see
 * lib/auth/with-org-context.ts): COMMIT on a normal return, ROLLBACK on a throw.
 * That is what makes "the org is never left without a default site" testable —
 * the clear-down of the previous default is only durable if the callback returns
 * normally.
 */
function mockOrgContext(queryHandler: QueryHandler, canUpdate = true): Txn {
  const txn: Txn = { committed: false, rolledBack: false, calls: [] };

  vi.mocked(withOrgContext).mockImplementation(async (fn) => {
    try {
      const result = await fn({
        userId: USER_ID,
        orgId: ORG_ID,
        client: {
          query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
            txn.calls.push({ sql, params });
            if (/from public\.user_roles ur/i.test(sql)) {
              return canUpdate ? { rows: [{ ok: true }], rowCount: 1 } : { rows: [], rowCount: 0 };
            }
            return queryHandler(sql, params);
          }),
        },
      });
      txn.committed = true;
      return result;
    } catch (error) {
      txn.rolledBack = true;
      throw error;
    }
  });

  return txn;
}

function uniqueViolation(): Error & { code: string } {
  const error = new Error('duplicate key value violates unique constraint "sites_org_code_uq"') as Error & { code: string };
  error.code = '23505';
  return error;
}

const VALID_INPUT = {
  site_code: 'N17R02',
  name: 'Second site',
  timezone: 'Europe/Warsaw',
  country: 'Poland',
  legal_entity: 'Acme sp. z o.o.',
};

describe('R02-06 createSite reports why it failed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports a duplicate site code as a duplicate, not as a missing field', async () => {
    mockOrgContext((sql) => {
      if (/insert into public\.sites/i.test(sql)) throw uniqueViolation();
      return { rows: [], rowCount: 0 };
    });

    const result = await createSite(VALID_INPUT);

    expect(result).toMatchObject({ ok: false, error: 'duplicate_code', field: 'site_code' });
    const shown = result.ok ? '' : (result.message ?? '');
    expect(shown).not.toBe(MISSING_FIELD_LABEL);
    expect(shown.toLowerCase()).toContain('already in use');
  });

  it('names the field and the reason when the schema rejects a filled-in form', async () => {
    mockOrgContext(() => ({ rows: [], rowCount: 0 }));

    // Free-text timezone that is not an IANA zone — the exact shape that used to
    // render as "This field is required." on a completely filled form.
    const result = await createSite({ ...VALID_INPUT, timezone: 'UTC+1' });

    expect(result).toMatchObject({ ok: false, error: 'invalid_input', field: 'timezone' });
    const shown = result.ok ? '' : (result.message ?? '');
    expect(shown).not.toBe(MISSING_FIELD_LABEL);
    expect(shown).toContain('Timezone');
    expect(shown).toContain('Europe/Warsaw'); // actionable: shows the expected shape
  });

  it('accepts UTC — the default the form ships with', async () => {
    // `Intl.supportedValuesOf('timeZone')` omits 'UTC', so validating against
    // that list rejected the app's own default: the form could not be submitted
    // at all until the user picked some other zone, and the rejection message
    // offered UTC as an example of a valid one.
    mockOrgContext((sql, params) => {
      if (/insert into public\.sites/i.test(sql)) {
        return { rows: [{ id: SITE_ID, site_code: String(params?.[0] ?? ''), name: 'UTC site' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await createSite({ ...VALID_INPUT, timezone: 'UTC' });

    expect(result).toMatchObject({ ok: true });
  });

  it('reports an already-taken code even when another field is rejected too', async () => {
    // The duplicate is only detected by the 23505 on INSERT, and the INSERT is
    // never reached while validation fails — so a form with BOTH a taken code and
    // a rejected time zone reported only the time zone. The user fixed that and
    // was then told the code was taken: two round-trips for one form, and the
    // first message was not the blocking reason.
    mockOrgContext((sql) => {
      if (/from public\.sites/i.test(sql) && /upper\(site_code\)/i.test(sql)) {
        return { rows: [{ taken: true }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await createSite({ ...VALID_INPUT, timezone: 'UTC+1' });

    expect(result).toMatchObject({ ok: false, error: 'duplicate_code', field: 'site_code' });
  });

  it('still says "required" when a value really is missing', async () => {
    mockOrgContext(() => ({ rows: [], rowCount: 0 }));

    const result = await createSite({ name: 'No code' });

    expect(result).toMatchObject({ ok: false, error: 'invalid_input', field: 'site_code' });
    expect(result.ok ? '' : (result.message ?? '')).toContain('required');
  });
});

describe('R02-06 site codes are case-insensitive for uniqueness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uppercases the code so `waw` collides with an existing `WAW`', async () => {
    const stored = new Set(['WAW']);
    const txn = mockOrgContext((sql, params) => {
      if (/insert into public\.sites/i.test(sql)) {
        const code = String(params?.[0] ?? '');
        if (stored.has(code)) throw uniqueViolation();
        stored.add(code);
        return { rows: [{ id: SITE_ID, site_code: code, name: 'Warsaw' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await createSite({ ...VALID_INPUT, site_code: 'waw', name: 'Warsaw' });

    expect(result).toMatchObject({ ok: false, error: 'duplicate_code' });
    const insert = txn.calls.find((call) => /insert into public\.sites/i.test(call.sql));
    expect(insert?.params?.[0]).toBe('WAW');
    expect(stored.size).toBe(1); // no second row slipped past the unique index
  });

  it('stores the uppercased code and echoes it back', async () => {
    mockOrgContext((sql, params) => {
      if (/insert into public\.sites/i.test(sql)) {
        return { rows: [{ id: SITE_ID, site_code: String(params?.[0] ?? ''), name: 'Warsaw' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await createSite({ ...VALID_INPUT, site_code: ' waw ', name: 'Warsaw' });

    expect(result).toMatchObject({ ok: true, data: { code: 'WAW' } });
  });
});

describe('R02-06 a failed insert never leaves the org without a default site', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rolls back the previous-default clear-down when the insert hits a duplicate', async () => {
    const txn = mockOrgContext((sql) => {
      if (/insert into public\.sites/i.test(sql)) throw uniqueViolation();
      return { rows: [], rowCount: 0 };
    });

    const result = await createSite({ ...VALID_INPUT, is_default: true });

    // The clear-down ran…
    expect(txn.calls.some((call) => /update public\.sites/i.test(call.sql) && /is_default = false/i.test(call.sql))).toBe(true);
    // …but the transaction was rolled back, so it never became durable.
    expect(txn.rolledBack).toBe(true);
    expect(txn.committed).toBe(false);
    expect(result).toMatchObject({ ok: false, error: 'duplicate_code' });
  });

  it('rolls back when the insert returns no row instead of committing the clear-down', async () => {
    // This path used to `return { ok: false }`, which the wrapper COMMITs —
    // clearing the org's default site while inserting nothing.
    const txn = mockOrgContext((sql) => {
      if (/insert into public\.sites/i.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });

    const result = await createSite({ ...VALID_INPUT, is_default: true });

    expect(txn.rolledBack).toBe(true);
    expect(txn.committed).toBe(false);
    expect(result).toMatchObject({ ok: false, error: 'persistence_failed' });
  });

  it('commits when the insert succeeds', async () => {
    const txn = mockOrgContext((sql, params) => {
      if (/insert into public\.sites/i.test(sql)) {
        return { rows: [{ id: SITE_ID, site_code: String(params?.[0] ?? ''), name: 'Second site' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    const result = await createSite({ ...VALID_INPUT, is_default: true });

    expect(result).toMatchObject({ ok: true });
    expect(txn.committed).toBe(true);
    expect(txn.rolledBack).toBe(false);
  });
});
