import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clockInToWo,
  clockOutFromWo,
  getWoLaborSummary,
  upsertLaborRate,
} from './labor-actions';
import type { QueryClient } from '../../../../../../lib/production/shared';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const WO_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_WO_ID = '44444444-4444-4444-8444-444444444444';
const LOG_ID = '55555555-5555-4555-8555-555555555555';
const RATE_ID = '66666666-6666-4666-8666-666666666666';
const NEW_RATE_ID = '77777777-7777-4777-8777-777777777777';
const USER_A_ID = '88888888-8888-4888-8888-888888888888';
const USER_B_ID = '99999999-9999-4999-8999-999999999999';

type QueryCall = { sql: string; params: readonly unknown[] };
type ExistingRateRow = { id: string; effective_from: string };
type SummaryMockRow = {
  log_id: string;
  user_key: string;
  user_name: string;
  started_at: string;
  ended_at: string | null;
  rate_per_hour: string | null;
  currency: string | null;
};

type State = {
  permissions: Set<string>;
  clockOutClosedIds: string[];
  existingRate: ExistingRateRow | null;
  summaryRows: SummaryMockRow[];
};

let state: State;
let queries: QueryCall[];
let client: QueryClient;

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(
    async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
      action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      queries.push({ sql, params });
      const n = normalize(sql);

      if (n.startsWith('select true as ok') && n.includes('from public.user_roles')) {
        const permission = String(params[2] ?? '');
        return state.permissions.has(permission)
          ? { rows: [{ ok: true }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      if (n.startsWith('update public.wo_labor_log') && n.includes('and ($2::uuid is null or wo_id = $2::uuid)')) {
        return {
          rows: state.clockOutClosedIds.map((id) => ({ id })),
          rowCount: state.clockOutClosedIds.length,
        };
      }
      if (n.startsWith('update public.wo_labor_log')) {
        return { rows: [{ id: OTHER_WO_ID }], rowCount: 1 };
      }
      if (n.startsWith('insert into public.wo_labor_log')) {
        return { rows: [{ id: LOG_ID }], rowCount: 1 };
      }
      if (n.includes('from public.wo_labor_log l')) {
        return { rows: state.summaryRows, rowCount: state.summaryRows.length };
      }
      if (n.startsWith("select id::text as id, to_char(effective_from, 'yyyy-mm-dd') as effective_from from public.labor_rates")) {
        return {
          rows: state.existingRate ? [state.existingRate] : [],
          rowCount: state.existingRate ? 1 : 0,
        };
      }
      if (n.startsWith('update public.labor_rates')) {
        return { rows: [{ id: RATE_ID }], rowCount: 1 };
      }
      if (n.startsWith('insert into public.labor_rates')) {
        return { rows: [{ id: NEW_RATE_ID }], rowCount: 1 };
      }
      if (n.startsWith('select id::text as id, site_id::text as site_id')) {
        return { rows: [], rowCount: 0 };
      }

      throw new Error(`unexpected query: ${n}`);
    }),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-06-23T12:00:00.000Z'));
  state = {
    permissions: new Set([
      'production.consumption.write',
      'production.oee.read',
      'settings.org.update',
      'settings.org.read',
    ]),
    clockOutClosedIds: [LOG_ID],
    existingRate: null,
    summaryRows: [],
  };
  queries = [];
  client = makeClient();
});

describe('clockInToWo', () => {
  it('closes the current user open log before inserting the new WO log', async () => {
    const result = await clockInToWo({ woId: WO_ID, lineId: 'line-1', source: 'desktop' });

    expect(result).toEqual({ ok: true, logId: LOG_ID });
    const closeIndex = queries.findIndex((q) => {
      const n = normalize(q.sql);
      return n.startsWith('update public.wo_labor_log') && !n.includes('and ($2::uuid is null');
    });
    const insertIndex = queries.findIndex((q) => normalize(q.sql).startsWith('insert into public.wo_labor_log'));

    expect(closeIndex).toBeGreaterThan(-1);
    expect(insertIndex).toBeGreaterThan(closeIndex);
    expect(normalize(queries[closeIndex]?.sql ?? '')).toContain('set ended_at = pg_catalog.now()');
    expect(queries[closeIndex]?.params).toEqual([USER_ID]);
    expect(queries[insertIndex]?.params).toEqual([WO_ID, USER_ID, 'line-1', 'desktop']);
  });
});

describe('clockOutFromWo', () => {
  it('sets ended_at on open logs for the specified WO', async () => {
    const result = await clockOutFromWo({ woId: WO_ID });

    expect(result).toEqual({ ok: true, count: 1 });
    const update = queries.find((q) => normalize(q.sql).startsWith('update public.wo_labor_log'));
    expect(normalize(update?.sql ?? '')).toContain('wo_id = $2::uuid');
    expect(normalize(update?.sql ?? '')).toContain('set ended_at = pg_catalog.now()');
    expect(update?.params).toEqual([USER_ID, WO_ID]);
  });
});

describe('getWoLaborSummary', () => {
  it('computes hours x rate per user and sums total hours and cost', async () => {
    state.summaryRows = [
      {
        log_id: 'log-a',
        user_key: USER_A_ID,
        user_name: 'Alpha Operator',
        started_at: '2026-06-23T08:00:00.000Z',
        ended_at: '2026-06-23T10:30:00.000Z',
        rate_per_hour: '20.0000',
        currency: 'GBP',
      },
      {
        log_id: 'log-b',
        user_key: USER_B_ID,
        user_name: 'Beta Operator',
        started_at: '2026-06-23T10:00:00.000Z',
        ended_at: null,
        rate_per_hour: '30.0000',
        currency: 'GBP',
      },
    ];

    const result = await getWoLaborSummary(WO_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected summary');
    expect(result.data).toEqual({
      totalHours: 4.5,
      totalCost: 110,
      currency: 'GBP',
      entries: [
        { userName: 'Alpha Operator', hours: 2.5, ratePerHour: 20, cost: 50 },
        { userName: 'Beta Operator', hours: 2, ratePerHour: 30, cost: 60 },
      ],
    });
  });
});

describe('upsertLaborRate', () => {
  it('inserts a new row when the existing effective_from is in the past', async () => {
    state.existingRate = { id: RATE_ID, effective_from: '2026-01-01' };

    const result = await upsertLaborRate({
      id: RATE_ID,
      roleGroup: 'operator',
      ratePerHour: 25.5,
      currency: 'gbp',
      effectiveFrom: '2026-06-23',
    });

    expect(result).toEqual({ ok: true, id: NEW_RATE_ID });
    expect(queries.some((q) => normalize(q.sql).startsWith('update public.labor_rates'))).toBe(false);
    const insert = queries.find((q) => normalize(q.sql).startsWith('insert into public.labor_rates'));
    expect(insert?.params).toEqual(['operator', '25.5000', 'GBP', '2026-06-23', USER_ID]);
    expect(normalize(insert?.sql ?? '')).toContain(
      'on conflict on constraint labor_rates_org_role_eff_unique do update set rate_per_hour = excluded.rate_per_hour, currency = excluded.currency, created_by = excluded.created_by',
    );
  });
});
