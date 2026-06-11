import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recordMonitoring, upsertCcp } from '../_actions/haccp-actions';

type QueryClient = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const CCP_ID = '33333333-3333-4333-8333-333333333333';
const LOG_ID = '44444444-4444-4444-8444-444444444444';
const NCR_ID = '55555555-5555-4555-8555-555555555555';

let client: QueryClient;
let permissions: Set<string>;
let ccpLimits: { min: string | null; max: string | null };

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

function makeClient(): QueryClient {
  return {
    query: vi.fn(async (sql: string, params: readonly unknown[] = []) => {
      const q = normalize(sql);

      if (q.includes('from public.user_roles')) {
        const permission = String(params[2]);
        const allowed = permissions.has(permission);
        return { rows: allowed ? [{ ok: true }] : [], rowCount: allowed ? 1 : 0 };
      }

      if (q.startsWith('insert into public.haccp_ccps')) {
        return {
          rows: [
            {
              id: CCP_ID,
              ccp_code: params[1],
              name: params[2],
              process_step: params[3],
              hazard_type: params[4],
              critical_limit_min: params[5],
              critical_limit_max: params[6],
              unit: params[7],
              monitoring_frequency: params[8],
              corrective_action: params[9],
              line_id: params[10],
              is_active: params[11],
              created_at: '2026-06-11T10:00:00.000Z',
              updated_at: '2026-06-11T10:00:00.000Z',
            },
          ],
          rowCount: 1,
        };
      }

      if (q.startsWith('select id::text, ccp_code, critical_limit_min::text')) {
        return {
          rows: [
            {
              id: CCP_ID,
              ccp_code: 'CCP-COOK',
              critical_limit_min: ccpLimits.min,
              critical_limit_max: ccpLimits.max,
            },
          ],
          rowCount: 1,
        };
      }

      if (q.startsWith('insert into public.haccp_monitoring_log')) {
        return { rows: [{ id: LOG_ID }], rowCount: 1 };
      }

      if (q.startsWith('insert into public.ncr_reports')) {
        return { rows: [{ id: NCR_ID }], rowCount: 1 };
      }

      if (q.startsWith('update public.haccp_monitoring_log')) {
        return { rows: [], rowCount: 1 };
      }

      return { rows: [], rowCount: 0 };
    }),
  };
}

describe('quality HACCP server actions', () => {
  beforeEach(() => {
    permissions = new Set(['quality.haccp.plan_edit', 'quality.ccp.deviation_override']);
    ccpLimits = { min: '70.0000', max: '75.0000' };
    client = makeClient();
    vi.clearAllMocks();
  });

  it('upsertCcp inserts a new CCP and returns no error', async () => {
    const result = await upsertCcp({
      ccp_code: 'CCP-COOK',
      name: 'Cook temperature',
      process_step: 'Cook',
      hazard_type: 'biological',
      critical_limit_min: '70.0000',
      critical_limit_max: '75.0000',
      unit: 'C',
      monitoring_frequency: 'Every batch',
      corrective_action: 'Hold batch and investigate',
    });

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({
      ok: true,
      data: {
        id: CCP_ID,
        ccpCode: 'CCP-COOK',
        criticalLimitMin: '70.0000',
        criticalLimitMax: '75.0000',
      },
    });
    const insert = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).startsWith('insert into public.haccp_ccps'));
    expect(insert).toBeTruthy();
  });

  it('recordMonitoring with value within bilateral limits returns within_limits=true and no NCR created', async () => {
    ccpLimits = { min: '70.0000', max: '75.0000' };

    const result = await recordMonitoring({ ccpId: CCP_ID, measuredValue: '72.5000' });

    expect(result).toEqual({ ok: true, data: { withinLimits: true, ncrId: null, outboxEmitted: false } });
    const ncrInsert = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).startsWith('insert into public.ncr_reports'));
    expect(ncrInsert).toBeUndefined();
    const logInsert = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).startsWith('insert into public.haccp_monitoring_log'),
    );
    expect(logInsert?.[1]?.[3]).toBe(true);
  });

  it('recordMonitoring with only critical_limit_min set and value above min returns within_limits=true', async () => {
    ccpLimits = { min: '70.0000', max: null };

    const result = await recordMonitoring({ ccpId: CCP_ID, measuredValue: '70.0001' });

    expect(result).toEqual({ ok: true, data: { withinLimits: true, ncrId: null, outboxEmitted: false } });
    const ncrInsert = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).startsWith('insert into public.ncr_reports'));
    expect(ncrInsert).toBeUndefined();
  });

  it('recordMonitoring with only critical_limit_min set and value below min returns within_limits=false, creates NCR, and links breach_ncr_id', async () => {
    ccpLimits = { min: '70.0000', max: null };

    const result = await recordMonitoring({ ccpId: CCP_ID, measuredValue: '69.9999' });

    expect(result).toEqual({ ok: true, data: { withinLimits: false, ncrId: NCR_ID, outboxEmitted: false } });
    const ncrInsert = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).startsWith('insert into public.ncr_reports'));
    expect(ncrInsert?.[1]?.[0]).toBe('CCP Breach: CCP-COOK');
    const breachLink = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).startsWith('update public.haccp_monitoring_log'));
    expect(breachLink?.[1]).toEqual([LOG_ID, NCR_ID]);
  });

  it('recordMonitoring bilateral breach returns within_limits=false and creates NCR', async () => {
    ccpLimits = { min: '70.0000', max: '75.0000' };

    const result = await recordMonitoring({ ccpId: CCP_ID, measuredValue: '75.0001' });

    expect(result).toEqual({ ok: true, data: { withinLimits: false, ncrId: NCR_ID, outboxEmitted: false } });
    const ncrInsert = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).startsWith('insert into public.ncr_reports'));
    expect(ncrInsert).toBeTruthy();
    const logInsert = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).startsWith('insert into public.haccp_monitoring_log'),
    );
    expect(logInsert?.[1]?.[3]).toBe(false);
  });
});
