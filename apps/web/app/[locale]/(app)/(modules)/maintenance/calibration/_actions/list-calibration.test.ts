import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listCalibration } from './list-calibration';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

let grantedPermissions: Set<string>;
let client: { query: ReturnType<typeof vi.fn> };

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: typeof client }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

beforeEach(() => {
  grantedPermissions = new Set(['mnt.asset.read']);
  client = {
    query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
      const normalized = normalize(sql);
      if (normalized.includes('from public.user_roles')) {
        const permission = String(params?.[2] ?? '');
        const ok = grantedPermissions.has(permission);
        return { rows: ok ? [{ ok: true }] : [], rowCount: ok ? 1 : 0 };
      }
      if (normalized.includes('from public.calibration_instruments')) {
        return {
          rows: [
            {
              instrument_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              site_id: null,
              equipment_id: null,
              instrument_code: 'SCALE-01',
              instrument_type: 'scale',
              standard: 'NIST',
              range_min: '0.0000',
              range_max: '50.0000',
              unit_of_measure: 'kg',
              calibration_interval_days: 365,
              active: true,
              record_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              calibrated_at: new Date('2026-05-01T08:00:00.000Z'),
              calibrated_by: USER_ID,
              standard_applied: 'NIST',
              result: 'PASS',
              certificate_file_url: 'CERT-2026-001',
              next_due_date: new Date('2027-05-01T00:00:00.000Z'),
              reviewer_signed_by: null,
              retention_until: new Date('2034-05-01T00:00:00.000Z'),
            },
          ],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
});

describe('listCalibration', () => {
  it('returns an empty array without mnt.asset.read', async () => {
    grantedPermissions.clear();

    await expect(listCalibration()).resolves.toEqual([]);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('queries the register when mnt.asset.read is granted', async () => {
    const rows = await listCalibration();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      instrumentCode: 'SCALE-01',
      result: 'PASS',
      certificateFileUrl: 'CERT-2026-001',
      nextDueDate: '2027-05-01',
      rangeMin: '0.0000',
      rangeMax: '50.0000',
    });
    expect(client.query.mock.calls.some(([sql]) => normalize(sql).includes('from public.calibration_instruments'))).toBe(
      true,
    );
  });

  it('dedupes latest calibration records with id desc tiebreak', async () => {
    await listCalibration();
    const registerSql = String(client.query.mock.calls.find(([sql]) => normalize(sql).includes('distinct on'))?.[0] ?? '');
    expect(registerSql.toLowerCase()).toContain('order by cr_latest.instrument_id, cr_latest.calibrated_at desc, cr_latest.id desc');
  });
});
