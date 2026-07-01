import { describe, expect, it, vi } from 'vitest';

import { moveScannerLp } from './movement';
import type { QueryClient } from '../../scanner/db';
import type { ScannerSessionRow } from '../../scanner/session';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const LP_ID = '44444444-4444-4444-8444-444444444444';
const FROM_LOCATION_ID = '55555555-5555-4555-8555-555555555555';
const TO_LOCATION_ID = '66666666-6666-4666-8666-666666666666';

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
    query: vi.fn(async (sql: string) => {
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
        return {
          rows: [{ warehouse_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', site_id: session.site_id }],
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
});
