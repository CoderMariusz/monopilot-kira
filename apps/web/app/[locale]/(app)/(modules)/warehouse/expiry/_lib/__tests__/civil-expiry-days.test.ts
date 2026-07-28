import { beforeEach, describe, expect, it, vi } from 'vitest';

import { utcIsoToCivilDate } from '../../../../../../../../lib/planning/civil-date';
import { instantToDatetimeLocalInput, wallClockToInstant } from '../../../../../../../../lib/shared/wall-clock-time';
import { getExpiryDashboard } from '../../../_actions/expiry-actions';
import type { QueryClient } from '../../../_actions/shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ZONE = 'Europe/Warsaw';
const EXPIRY = '2026-07-24T00:00:00.000Z';

let client: QueryClient;

vi.mock('../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Parity helper for getExpiryDashboard SQL:
 *   date(expiry at UTC) - date(now() at site timezone)
 * Built only from exported primitives in civil-date + wall-clock-time.
 */
function civilDaysUntilExpiry(expiryIso: string, nowMs: number, timeZone: string): number {
  const expiryCivil = utcIsoToCivilDate(expiryIso);
  const todayCivil = instantToDatetimeLocalInput(new Date(nowMs).toISOString(), timeZone).slice(0, 10);
  const msPerDay = 86_400_000;
  return Math.round(
    (Date.parse(`${expiryCivil}T00:00:00.000Z`) - Date.parse(`${todayCivil}T00:00:00.000Z`)) / msPerDay,
  );
}

describe('getExpiryDashboard civil days_left (R08-07)', () => {
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
                tier: 'amber',
                item_code: 'RM-1',
                item_name: 'Sugar',
                batch_number: 'B-1',
                location_code: 'A1',
                warehouse_code: 'WH1',
                quantity: '1',
                uom: 'kg',
                expiry_date: EXPIRY,
                days_left: 7,
                warning_days: 7,
                lp_status: 'available',
                site_timezone: ZONE,
              },
            ],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      }),
    };
  });

  it('queries days_left on civil-day boundaries (site timezone), not instant diff', async () => {
    const result = await getExpiryDashboard();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.rows[0]?.daysLeft).toBe(7);

    const expiryQuery = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).includes('from public.license_plates lp'),
    );
    expect(expiryQuery?.[0]).toContain('date(lp.expiry_date at time zone \'UTC\')');
    expect(expiryQuery?.[0]).toContain('date(pg_catalog.now() at time zone coalesce(st.timezone, org.timezone, \'UTC\'))');
    expect(expiryQuery?.[0]).toContain(')::int as days_left');
  });
});

describe('civilDaysUntilExpiry parity (utcIsoToCivilDate + wall-clock-time)', () => {
  it('returns 7 days on 2026-07-17 regardless of wall time within the civil day', () => {
    for (const time of ['00:01', '12:00', '23:59'] as const) {
      const nowMs = wallClockToInstant('2026-07-17', time, ZONE);
      expect(nowMs, `missing instant for ${time}`).not.toBeNull();
      expect(civilDaysUntilExpiry(EXPIRY, nowMs as number, ZONE)).toBe(7);
    }
  });

  it('returns -1 for an expiry one civil day before today', () => {
    const nowMs = wallClockToInstant('2026-07-17', '12:00', ZONE);
    expect(civilDaysUntilExpiry('2026-07-16T00:00:00.000Z', nowMs as number, ZONE)).toBe(-1);
  });

  it('uses the site civil day, not UTC midnight, near the UTC/local boundary', () => {
    const beforeMidnight = wallClockToInstant('2026-07-17', '23:30', ZONE);
    expect(civilDaysUntilExpiry(EXPIRY, beforeMidnight as number, ZONE)).toBe(7);

    const afterMidnight = wallClockToInstant('2026-07-18', '00:30', ZONE);
    expect(civilDaysUntilExpiry(EXPIRY, afterMidnight as number, ZONE)).toBe(6);
  });

  it('stays stable across a DST spring-forward civil day', () => {
    const expiry = '2026-03-30T00:00:00.000Z';
    for (const time of ['00:01', '12:00', '23:59'] as const) {
      const nowMs = wallClockToInstant('2026-03-29', time, ZONE);
      expect(nowMs, `missing instant for ${time}`).not.toBeNull();
      expect(civilDaysUntilExpiry(expiry, nowMs as number, ZONE)).toBe(1);
    }
  });

  it('stays stable across a DST fall-back civil day', () => {
    const expiry = '2026-10-26T00:00:00.000Z';
    for (const time of ['00:01', '12:00', '23:59'] as const) {
      const nowMs = wallClockToInstant('2026-10-25', time, ZONE);
      expect(nowMs, `missing instant for ${time}`).not.toBeNull();
      expect(civilDaysUntilExpiry(expiry, nowMs as number, ZONE)).toBe(1);
    }
  });
});
