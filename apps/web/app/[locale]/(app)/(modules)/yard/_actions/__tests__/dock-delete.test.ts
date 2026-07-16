import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const DOOR_ID = '33333333-3333-4333-8333-333333333333';

let appointmentCount = 0;
let deleted = false;

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: { query: typeof mockQuery } }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client: { query: mockQuery } }),
  ),
}));

async function mockQuery(sql: string, params: readonly unknown[] = []) {
  const q = sql.replace(/\s+/g, ' ').trim().toLowerCase();
  if (q.includes('from public.user_roles')) {
    expect(params).toEqual([USER_ID, ORG_ID, 'yard.manage']);
    return { rows: [{ ok: true }], rowCount: 1 };
  }
  if (q.includes('from public.dock_doors') && q.includes('limit 1')) {
    return { rows: [{ id: DOOR_ID }], rowCount: 1 };
  }
  if (q.includes('from public.dock_appointments') && q.includes('count(*)')) {
    return { rows: [{ appointment_count: appointmentCount }], rowCount: 1 };
  }
  if (q.startsWith('delete from public.dock_doors')) {
    deleted = true;
    return { rows: [{ id: DOOR_ID }], rowCount: 1 };
  }
  throw new Error(`unexpected sql: ${q}`);
}

describe('deleteDockDoor', () => {
  beforeEach(() => {
    vi.resetModules();
    appointmentCount = 0;
    deleted = false;
  });

  it('blocks deletion when appointments exist and deletes when clear', async () => {
    appointmentCount = 2;
    const { deleteDockDoor } = await import('../yard-actions');

    await expect(deleteDockDoor(DOOR_ID)).rejects.toThrow('has_dependents');
    expect(deleted).toBe(false);

    appointmentCount = 0;
    await expect(deleteDockDoor(DOOR_ID)).resolves.toBeUndefined();
    expect(deleted).toBe(true);
  });
});
