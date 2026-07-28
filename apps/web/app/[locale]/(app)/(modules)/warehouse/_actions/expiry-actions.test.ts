import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getExpiryDashboard } from './expiry-actions';
import type { QueryClient } from './shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

let client: QueryClient;

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

describe('getExpiryDashboard (R08-08)', () => {
  beforeEach(() => {
    client = {
      query: vi.fn(async (sql: string) => {
        const normalized = normalize(sql);
        if (normalized.includes('from public.user_roles')) {
          return { rows: [{ ok: true }], rowCount: 1 };
        }
        if (normalized.includes('from public.license_plates lp')) {
          return {
            rows: [
              {
                lp_id: 'lp-1',
                lp_number: 'LP-001',
                tier: 'red',
                item_code: 'RM-1',
                item_name: 'Sugar',
                batch_number: 'NIGHT-R08-SB-1400',
                location_code: 'COLD-A1',
                warehouse_code: 'WH1',
                quantity: '3.125',
                uom: 'kg',
                expiry_date: '2026-07-01T00:00:00.000Z',
                warning_days: 7,
                lp_status: 'available',
                qa_status: 'released',
              },
              {
                lp_id: 'lp-2',
                lp_number: 'LP-002',
                tier: 'amber',
                item_code: 'RM-2',
                item_name: 'Flour',
                batch_number: null,
                location_code: 'DRY-B2',
                warehouse_code: 'WH1',
                quantity: '10',
                uom: 'kg',
                expiry_date: '2026-08-01T00:00:00.000Z',
                warning_days: 7,
                lp_status: 'quarantine',
                qa_status: 'pending',
              },
            ],
            rowCount: 2,
          };
        }
        return { rows: [], rowCount: 0 };
      }),
    };
  });

  it('projects batch_number and lp.status from the read (never fabricated)', async () => {
    const result = await getExpiryDashboard();

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.rows[0]).toMatchObject({
      lpNumber: 'LP-001',
      batchNumber: 'NIGHT-R08-SB-1400',
      status: 'available',
      qaStatus: 'released',
    });
    expect(result.data.rows[1]).toMatchObject({
      batchNumber: null,
      status: 'quarantine',
      qaStatus: 'pending',
    });

    const expiryQuery = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).includes('from public.license_plates lp'),
    );
    expect(expiryQuery?.[0]).toContain('lp.batch_number');
    expect(expiryQuery?.[0]).toContain('lp.status as lp_status');
    expect(expiryQuery?.[0]).toContain('lp.qa_status');
    expect(expiryQuery?.[0]).toContain("'blocked'");
  });
});
