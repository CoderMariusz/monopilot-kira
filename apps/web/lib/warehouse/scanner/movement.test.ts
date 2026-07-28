import { describe, expect, it, vi } from 'vitest';

import { moveScannerLp, suggestPutawayLocations, WarehouseScannerError } from './movement';
import type { QueryClient } from '../../scanner/db';
import type { ScannerSessionRow } from '../../scanner/session';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const LP_ID = '44444444-4444-4444-8444-444444444444';
const FROM_LOCATION_ID = '55555555-5555-4555-8555-555555555555';
const TO_LOCATION_ID = '66666666-6666-4666-8666-666666666666';
const INACTIVE_LOCATION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const session: ScannerSessionRow = {
  id: SESSION_ID,
  org_id: ORG_ID,
  user_id: USER_ID,
  device_id: null,
  site_id: '77777777-7777-4777-8777-777777777777',
  line_id: null,
  shift: null,
  mode: 'personal',
  session_token_hash: 'hash',
  expires_at: new Date(),
  ended_at: null,
  created_at: new Date(),
  last_seen_at: new Date(),
};

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient & { query: ReturnType<typeof vi.fn> } {
  return {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      const q = normalize(sql);
      if (q.includes('from public.scanner_audit_log')) return { rows: [], rowCount: 0 };
      if (q.includes('from public.license_plates lp') && q.includes('for update')) {
        return {
          rows: [
            {
              id: LP_ID,
              product_id: '88888888-8888-4888-8888-888888888888',
              site_id: session.site_id,
              quantity: '10.000000',
              available_qty: '10.000000',
              reserved_qty: '0.000000',
              uom: 'kg',
              status: 'available',
              qa_status: 'released',
              expired: false,
              location_id: FROM_LOCATION_ID,
              locked_by: null,
              lock_is_active_for_other_user: false,
            },
          ],
          rowCount: 1,
        };
      }
      if (q.startsWith('select loc.warehouse_id::text')) {
        const locationId = String(params?.[0] ?? '');
        const isActive = locationId !== INACTIVE_LOCATION_ID;
        return {
          rows: [{
            warehouse_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            site_id: session.site_id,
            is_active: isActive,
          }],
          rowCount: 1,
        };
      }
      if (q.startsWith('insert into public.stock_moves')) return { rows: [{ id: '99999999-9999-4999-8999-999999999999' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }),
  } as unknown as QueryClient & { query: ReturnType<typeof vi.fn> };
}

describe('scanner warehouse movement', () => {
  it('moves the LP site to the destination warehouse site inside the move transaction', async () => {
    const client = makeClient();

    await moveScannerLp(client, session, {
      clientOpId: 'move-site',
      lpId: LP_ID,
      toLocationId: TO_LOCATION_ID,
      moveType: 'transfer',
    });

    const update = client.query.mock.calls.find(([sql]) => normalize(String(sql)).startsWith('update public.license_plates'));
    expect(update).toBeDefined();
    expect(normalize(String(update?.[0]))).toContain('site_id = $4::uuid');
    expect(normalize(String(update?.[0]))).toContain('warehouse_id = $5::uuid');
    expect(update?.[1]).toEqual([LP_ID, TO_LOCATION_ID, USER_ID, session.site_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);
    const insert = client.query.mock.calls.find(([sql]) => normalize(String(sql)).startsWith('insert into public.stock_moves'));
    expect(normalize(String(insert?.[0]))).toContain('org_id, site_id, move_number');
    expect(insert?.[1]?.[0]).toBe(session.site_id);
  });

  it('rejects putaway into a deactivated destination bin (N-WH-1)', async () => {
    const client = makeClient();

    await expect(
      moveScannerLp(client, session, {
        clientOpId: 'move-inactive',
        lpId: LP_ID,
        toLocationId: INACTIVE_LOCATION_ID,
        moveType: 'putaway',
      }),
    ).rejects.toMatchObject({
      code: 'location_inactive',
      status: 422,
    } satisfies Partial<WarehouseScannerError>);

    expect(client.query.mock.calls.some(([sql]) => normalize(String(sql)).startsWith('insert into public.stock_moves'))).toBe(
      false,
    );
  });

  it('loadLocationScope SQL selects is_active for server-side guard', async () => {
    const client = makeClient();
    await moveScannerLp(client, session, {
      clientOpId: 'move-active',
      lpId: LP_ID,
      toLocationId: TO_LOCATION_ID,
      moveType: 'transfer',
    });
    const scope = client.query.mock.calls.find(([sql]) => normalize(String(sql)).startsWith('select loc.warehouse_id::text'));
    expect(normalize(String(scope?.[0]))).toContain('coalesce(loc.is_active, true)');
  });

  // R17-02 / C101 cross-surface — a putaway into the bay the LP already occupies
  // is a no-op: it must be rejected, and above all must not write a stock_move
  // (fake movement history) nor promote received→available.
  it('rejects a putaway into the LP CURRENT location and writes no stock_move (R17-02)', async () => {
    const client = makeClient();

    await expect(
      moveScannerLp(client, session, {
        clientOpId: 'putaway-same-location',
        lpId: LP_ID,
        toLocationId: FROM_LOCATION_ID,
        moveType: 'putaway',
      }),
    ).rejects.toMatchObject({
      code: 'same_location',
      status: 409,
    } satisfies Partial<WarehouseScannerError>);

    const sql = client.query.mock.calls.map(([q]) => normalize(String(q)));
    expect(sql.some((q) => q.startsWith('insert into public.stock_moves'))).toBe(false);
    expect(sql.some((q) => q.startsWith('update public.license_plates'))).toBe(false);
    // no audit row either — a rejected no-op is not an operation
    expect(sql.some((q) => q.startsWith('insert into public.scanner_audit_log'))).toBe(false);
  });

  it('rejects a same-location TRANSFER too — the guard is on the shared write path', async () => {
    const client = makeClient();

    await expect(
      moveScannerLp(client, session, {
        clientOpId: 'transfer-same-location',
        lpId: LP_ID,
        toLocationId: FROM_LOCATION_ID,
        moveType: 'transfer',
      }),
    ).rejects.toMatchObject({ code: 'same_location', status: 409 });
  });

  it('ANTI-REGRESSION: a putaway into a DIFFERENT location still writes its stock_move', async () => {
    const client = makeClient();

    await moveScannerLp(client, session, {
      clientOpId: 'putaway-ok',
      lpId: LP_ID,
      toLocationId: TO_LOCATION_ID,
      moveType: 'putaway',
    });

    const insert = client.query.mock.calls.find(([sql]) => normalize(String(sql)).startsWith('insert into public.stock_moves'));
    expect(insert).toBeDefined();
    // from = the LP's previous bay, to = the scanned destination
    expect(insert?.[1]).toEqual(expect.arrayContaining([FROM_LOCATION_ID, TO_LOCATION_ID]));
  });
});

// R17-02 — the suggestion list is the other half of the fix: the LP's current
// location must never be offered (it was ranked #1 as "Same product", because
// the LP itself is a same-product LP held in that location).
const WAREHOUSE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRODUCT_ID = '88888888-8888-4888-8888-888888888888';

function makeSuggestClient(opts: { locationId: string | null; suggestions?: unknown[] }) {
  return {
    query: vi.fn(async (sql: string) => {
      const q = normalize(sql);
      if (q.startsWith('select warehouse_id::text')) {
        return {
          rows: [{ warehouse_id: WAREHOUSE_ID, product_id: PRODUCT_ID, location_id: opts.locationId }],
          rowCount: 1,
        };
      }
      if (q.startsWith('with same_product as')) {
        return { rows: opts.suggestions ?? [], rowCount: (opts.suggestions ?? []).length };
      }
      return { rows: [], rowCount: 0 };
    }),
  } as unknown as QueryClient & { query: ReturnType<typeof vi.fn> };
}

describe('suggestPutawayLocations — current location exclusion (R17-02)', () => {
  it('reads the LP current location and passes it as the exclusion parameter', async () => {
    const client = makeSuggestClient({ locationId: FROM_LOCATION_ID });
    await suggestPutawayLocations(client, LP_ID);

    const lookup = client.query.mock.calls.find(([sql]) => normalize(String(sql)).startsWith('select warehouse_id::text'));
    expect(normalize(String(lookup?.[0]))).toContain('location_id::text');

    const suggest = client.query.mock.calls.find(([sql]) => normalize(String(sql)).startsWith('with same_product as'));
    expect(suggest?.[1]).toEqual([WAREHOUSE_ID, PRODUCT_ID, FROM_LOCATION_ID]);
  });

  it('excludes the current location in EVERY suggestion CTE (same_product / empty / default)', async () => {
    const client = makeSuggestClient({ locationId: FROM_LOCATION_ID });
    await suggestPutawayLocations(client, LP_ID);

    const suggest = normalize(String(client.query.mock.calls.find(([sql]) =>
      normalize(String(sql)).startsWith('with same_product as'))?.[0]));
    // one guard per CTE — a single outer filter would break `default_locations`,
    // which is `limit 1` INSIDE the CTE (the excluded row would eat the slot).
    const guards = suggest.split('loc.id is distinct from $3::uuid').length - 1;
    expect(guards).toBe(3);
  });

  it('ANTI-REGRESSION: every candidate excluded → empty list, not a throw', async () => {
    const client = makeSuggestClient({ locationId: FROM_LOCATION_ID, suggestions: [] });
    await expect(suggestPutawayLocations(client, LP_ID)).resolves.toEqual([]);
  });

  it('an LP with no location yet passes NULL — `is distinct from` keeps every candidate', async () => {
    const client = makeSuggestClient({
      locationId: null,
      suggestions: [
        { location_id: TO_LOCATION_ID, location_code: 'A-01', location_name: 'Aisle 1', reason: 'empty', priority: 2 },
      ],
    });
    const out = await suggestPutawayLocations(client, LP_ID);

    const suggest = client.query.mock.calls.find(([sql]) => normalize(String(sql)).startsWith('with same_product as'));
    expect(suggest?.[1]?.[2]).toBeNull();
    expect(out).toHaveLength(1);
  });
});
