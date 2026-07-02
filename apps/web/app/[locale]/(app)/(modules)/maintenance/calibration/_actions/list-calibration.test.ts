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
        return { rows: [], rowCount: 0 };
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
    await expect(listCalibration()).resolves.toEqual([]);
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
