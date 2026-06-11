import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveLpByNumber, searchLps, resolveWoByNumber, resolveGrnByNumber } from '../lookup-actions';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const LP_ID = '44444444-4444-4444-8444-444444444444';
const WO_ID = '66666666-6666-4666-8666-666666666666';
const GRN_ID = '99999999-9999-4999-8999-999999999999';

let client: QueryClient;
let allowPermission = true;
// Controls what the LP select returns: 'one' | 'none' | 'many'.
let lpExactRows: 'one' | 'none' | 'many' = 'one';
let lpPrefixRows: 'one' | 'none' | 'many' = 'none';
let woRows: 'one' | 'none' = 'one';
let grnRows: 'one' | 'none' = 'one';

vi.mock('../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

const LP_ROW = {
  id: LP_ID,
  lp_number: 'LP-000123',
  item_code: 'RM-BEEF-01',
  quantity: '12.500',
  uom: 'kg',
  status: 'available',
  qa_status: 'released',
};

function rowsFor(mode: 'one' | 'none' | 'many', row: Record<string, unknown>) {
  if (mode === 'none') return [];
  if (mode === 'many') return [row, { ...row, id: `${LP_ID}-2` }];
  return [row];
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);

      if (q.includes('from public.user_roles')) {
        return { rows: allowPermission ? [{ ok: true }] : [], rowCount: allowPermission ? 1 : 0 };
      }

      // LP exact (lower(lp_number) = lower($1)) vs prefix (ilike $1 || '%').
      if (q.includes('from public.license_plates') && q.includes("lower(lp.lp_number) = lower($1)")) {
        return { rows: rowsFor(lpExactRows, LP_ROW) };
      }
      if (q.includes('from public.license_plates') && q.includes("lp.lp_number ilike $1 || '%'")) {
        return { rows: rowsFor(lpPrefixRows, LP_ROW) };
      }
      // searchLps: number/item ilike.
      if (q.includes('from public.license_plates') && q.includes('i.item_code ilike')) {
        return { rows: [LP_ROW, { ...LP_ROW, id: `${LP_ID}-2`, lp_number: 'LP-000124' }] };
      }
      if (q.includes('from public.work_orders')) {
        return { rows: woRows === 'one' ? [{ id: WO_ID, wo_number: 'WO-000001' }] : [] };
      }
      if (q.includes('from public.grns')) {
        return { rows: grnRows === 'one' ? [{ id: GRN_ID, grn_number: 'GRN-000001' }] : [] };
      }
      return { rows: [] };
    }),
  };
}

beforeEach(() => {
  allowPermission = true;
  lpExactRows = 'one';
  lpPrefixRows = 'none';
  woRows = 'one';
  grnRows = 'one';
  client = makeClient();
});

describe('resolveLpByNumber', () => {
  it('returns the LP (UUID + view-model, decimal qty as string) on an exact match', async () => {
    const res = await resolveLpByNumber({ lpNumber: 'LP-000123' });
    expect(res).toEqual({
      ok: true,
      data: { id: LP_ID, lpNumber: 'LP-000123', itemCode: 'RM-BEEF-01', qty: '12.500', uom: 'kg', status: 'available', qaStatus: 'released' },
    });
  });

  it('falls back to a UNIQUE prefix match when no exact match exists', async () => {
    lpExactRows = 'none';
    lpPrefixRows = 'one';
    const res = await resolveLpByNumber({ lpNumber: 'LP-0001' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data?.id).toBe(LP_ID);
  });

  it('returns null when nothing matches (caller surfaces inline unresolved error)', async () => {
    lpExactRows = 'none';
    lpPrefixRows = 'none';
    const res = await resolveLpByNumber({ lpNumber: 'LP-NOPE' });
    expect(res).toEqual({ ok: true, data: null });
  });

  it('returns null on an AMBIGUOUS exact match (does not guess)', async () => {
    lpExactRows = 'many';
    const res = await resolveLpByNumber({ lpNumber: 'LP-000123' });
    expect(res).toEqual({ ok: true, data: null });
  });

  it('is forbidden without quality.dashboard.view', async () => {
    allowPermission = false;
    const res = await resolveLpByNumber({ lpNumber: 'LP-000123' });
    expect(res).toEqual({ ok: false, reason: 'forbidden' });
  });

  it('rejects empty input via zod (error result, never a throw)', async () => {
    const res = await resolveLpByNumber({ lpNumber: '   ' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('error');
  });
});

describe('searchLps', () => {
  it('returns the org-scoped autocomplete list', async () => {
    const res = await searchLps({ query: 'LP-0001', limit: 10 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toHaveLength(2);
      expect(res.data[0].lpNumber).toBe('LP-000123');
      expect(res.data[0].qty).toBe('12.500');
    }
  });

  it('is forbidden without permission', async () => {
    allowPermission = false;
    const res = await searchLps({ query: 'LP' });
    expect(res).toEqual({ ok: false, reason: 'forbidden' });
  });
});

describe('resolveWoByNumber / resolveGrnByNumber', () => {
  it('resolves a WO number to its UUID', async () => {
    const res = await resolveWoByNumber({ woNumber: 'WO-000001' });
    expect(res).toEqual({ ok: true, data: { id: WO_ID, display: 'WO-000001' } });
  });

  it('returns null for an unknown WO number', async () => {
    woRows = 'none';
    const res = await resolveWoByNumber({ woNumber: 'WO-NOPE' });
    expect(res).toEqual({ ok: true, data: null });
  });

  it('resolves a GRN number to its UUID', async () => {
    const res = await resolveGrnByNumber({ grnNumber: 'GRN-000001' });
    expect(res).toEqual({ ok: true, data: { id: GRN_ID, display: 'GRN-000001' } });
  });

  it('GRN resolve is forbidden without permission', async () => {
    allowPermission = false;
    const res = await resolveGrnByNumber({ grnNumber: 'GRN-000001' });
    expect(res).toEqual({ ok: false, reason: 'forbidden' });
  });
});
