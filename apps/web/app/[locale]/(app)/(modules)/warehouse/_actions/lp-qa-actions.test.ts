import { beforeEach, describe, expect, it, vi } from 'vitest';

import { releaseLpQa } from './lp-qa-actions';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const LP_ID = '44444444-4444-4444-8444-444444444444';

let grantedPermissions: Set<string>;
let client: { query: ReturnType<typeof vi.fn> };

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: typeof client }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('../../../../../../lib/production/holds-guard', () => ({
  holdsGuard: vi.fn(async () => null),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

beforeEach(() => {
  grantedPermissions = new Set(['quality.batch.release']);
  client = {
    query: vi.fn(async (sql: string, params?: readonly unknown[]) => {
      const normalized = normalize(sql);
      if (normalized.includes('from public.user_roles')) {
        const permission = String(params?.[2] ?? '');
        const ok = grantedPermissions.has(permission);
        return { rows: ok ? [{ ok: true }] : [], rowCount: ok ? 1 : 0 };
      }
      if (normalized.startsWith('select id::text, lp_number, status, qa_status from public.license_plates')) {
        return {
          rows: [{ id: LP_ID, lp_number: 'LP-0001', status: 'received', qa_status: 'pending' }],
          rowCount: 1,
        };
      }
      if (normalized.startsWith('update public.license_plates')) {
        return {
          rows: [{ id: LP_ID, lp_number: 'LP-0001', status: 'available', qa_status: 'released' }],
          rowCount: 1,
        };
      }
      if (normalized.startsWith('insert into public.lp_state_history')) {
        return { rows: [], rowCount: 1 };
      }
      if (normalized.startsWith('insert into public.outbox_events')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
});

describe('releaseLpQa RBAC', () => {
  it('returns forbidden without quality.batch.release', async () => {
    grantedPermissions.clear();

    const result = await releaseLpQa({ lpId: LP_ID, decision: 'released' });

    expect(result).toEqual({ ok: false, reason: 'forbidden' });
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('does not accept warehouse.grn.receive alone', async () => {
    grantedPermissions = new Set(['warehouse.grn.receive']);

    const result = await releaseLpQa({ lpId: LP_ID, decision: 'released' });

    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('releases LP QA when quality.batch.release is granted', async () => {
    const result = await releaseLpQa({ lpId: LP_ID, decision: 'released' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.qaStatus).toBe('released');
  });
});
