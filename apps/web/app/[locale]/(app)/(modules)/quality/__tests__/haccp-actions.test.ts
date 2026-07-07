import { signEvent } from '@monopilot/e-sign';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveCcpDeviation } from '../_actions/ccp-deviation-actions';
import { listCcps, listMonitoringLog, recordMonitoring, upsertCcp } from '../_actions/haccp-actions';

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
const WO_ID = '66666666-6666-4666-8666-666666666666';
const LP_ID = '77777777-7777-4777-8777-777777777777';
const LP_ID_2 = '77777777-7777-4777-8777-777777777778';
const HOLD_ID = '88888888-8888-4888-8888-888888888888';
const DEVIATION_ID = '99999999-9999-4999-8999-999999999999';
const SITE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

let client: QueryClient;
let permissions: Set<string>;
let ccpLimits: { min: string | null; max: string | null };
let outputLpIds: string[];
let openedDeviationLogIds: Set<string>;
// S2 idempotency: when a referenceId is present here the mock returns an
// EXISTING hold for that reference — simulating the "hold already open" short-
// circuit in createCcpDeviationHoldIfMissing (haccp-actions.ts).
let existingHoldsForReference: Set<string>;

vi.mock('@monopilot/e-sign', () => ({
  signEvent: vi.fn(async () => ({
    signatureId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    signerUserId: USER_ID,
    intent: 'qa.haccp.ccp.deviation',
    subjectHash: 'd'.repeat(64),
    signedAt: '2026-06-23T10:00:00.000Z',
    auditEventId: 306,
    nonce: 'nonce-ccp-deviation',
  })),
}));

vi.mock('../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: vi.fn(async (action: (ctx: { userId: string; orgId: string; client: QueryClient }) => Promise<unknown>) =>
    action({ userId: USER_ID, orgId: ORG_ID, client }),
  ),
}));

vi.mock('../../../../../../lib/site/site-context', () => ({
  getActiveSiteId: vi.fn(async () => SITE_ID),
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
              unit: 'C',
            },
          ],
          rowCount: 1,
        };
      }

      // listCcps board read (a SELECT over haccp_ccps that is NOT the
      // recordMonitoring single-row fetch handled above).
      if (q.includes('from public.haccp_ccps') && q.startsWith('select')) {
        return {
          rows: [
            {
              id: CCP_ID,
              ccp_code: 'CCP-COOK',
              name: 'Cook temperature',
              process_step: 'Cook',
              hazard_type: 'biological',
              critical_limit_min: '70.0000',
              critical_limit_max: '75.0000',
              unit: 'C',
              monitoring_frequency: 'Every batch',
              corrective_action: 'Hold batch',
              line_id: null,
              is_active: true,
              created_at: '2026-06-11T10:00:00.000Z',
              updated_at: '2026-06-11T10:00:00.000Z',
            },
          ],
          rowCount: 1,
        };
      }

      if (q.includes('window_start')) {
        return { rows: [{ window_start: '2026-06-23T08:00:00.000Z' }], rowCount: 1 };
      }

      // listMonitoringLog board read.
      if (q.includes('from public.haccp_monitoring_log l')) {
        return {
          rows: [
            {
              id: LOG_ID,
              ccp_id: CCP_ID,
              ccp_code: 'CCP-COOK',
              measured_value: '72.5000',
              measured_at: '2026-06-11T11:00:00.000Z',
              wo_id: null,
              within_limits: true,
              recorded_by: USER_ID,
              note: null,
              breach_ncr_id: null,
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

      if (q.includes('from public.ccp_deviations d') && q.includes('d.monitoring_log_id = $1::uuid')) {
        const hasDeviation = openedDeviationLogIds.has(String(params[0]));
        return {
          rows: hasDeviation ? [{ id: DEVIATION_ID, breach_ncr_id: NCR_ID }] : [],
          rowCount: hasDeviation ? 1 : 0,
        };
      }

      if (q.includes('from public.wo_outputs o') && q.includes('join public.license_plates lp')) {
        return {
          rows: outputLpIds.map((id) => ({ id })),
          rowCount: outputLpIds.length,
        };
      }

      if (q.startsWith('insert into public.ccp_deviations')) {
        openedDeviationLogIds.add(String(params[1]));
        return { rows: [{ id: DEVIATION_ID }], rowCount: 1 };
      }

      if (q.startsWith('insert into public.quality_holds')) {
        return { rows: [{ id: HOLD_ID, hold_number: 'HLD-00001000' }], rowCount: 1 };
      }

      if (q.includes('from public.quality_holds') && q.includes('reference_type = $1')) {
        // S2: If the referenceId ($2) is in existingHoldsForReference, simulate an
        // existing active hold so the INSERT short-circuit in
        // createCcpDeviationHoldIfMissing is exercised.
        const refId = String(params[1]);
        if (existingHoldsForReference.has(refId)) {
          return { rows: [{ id: HOLD_ID }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }

      if (q.startsWith('select id::text, status, qa_status, quantity::text')) {
        const ids = Array.isArray(params[0]) ? (params[0] as string[]) : [];
        return {
          rows: ids.map((id) => ({ id, status: 'available', qa_status: 'pending', quantity: id === LP_ID_2 ? '6.250000' : '12.500000' })),
          rowCount: ids.length,
        };
      }

      if (q.startsWith('insert into public.quality_hold_items')) {
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('update public.license_plates')) {
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('update public.ccp_deviations') && q.includes('set hold_id')) {
        return { rows: [], rowCount: 1 };
      }

      if (q.includes('from public.ccp_deviations d') && q.includes('for update')) {
        return {
          rows: [
            {
              id: DEVIATION_ID,
              status: 'open',
              ccp_id: CCP_ID,
              ccp_code: 'CCP-COOK',
              monitoring_log_id: LOG_ID,
              measured_value: '69.9999',
            },
          ],
          rowCount: 1,
        };
      }

      if (q.startsWith('update public.ccp_deviations') && q.includes("set status = 'resolved'")) {
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('select d.id::text') && q.includes('from public.ccp_deviations d')) {
        return {
          rows: [
            {
              id: DEVIATION_ID,
              status: 'resolved',
              ccp_id: CCP_ID,
              ccp_code: 'CCP-COOK',
              ccp_name: 'Cook temperature',
              monitoring_log_id: LOG_ID,
              measured_value: '69.9999',
              uom: 'C',
              action_taken: 'Batch quarantined and root cause reviewed',
              disposition: 'corrected',
              hold_id: HOLD_ID,
              hold_number: 'HLD-00001000',
              hold_reference_type: 'lp',
              hold_reference_display: 'LP-0001 / FG-COOK',
              hold_status: 'open',
              opened_at: '2026-06-23T09:00:00.000Z',
              opened_by_display: 'QA Lead',
              closed_at: '2026-06-23T10:00:00.000Z',
              closed_by_display: 'QA Lead',
              esign_ref: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            },
          ],
          rowCount: 1,
        };
      }

      if (q.startsWith('update public.haccp_monitoring_log')) {
        return { rows: [], rowCount: 1 };
      }

      if (q.startsWith('insert into public.outbox_events')) {
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
    outputLpIds = [LP_ID, LP_ID_2];
    openedDeviationLogIds = new Set();
    existingHoldsForReference = new Set();
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

    expect(result).toEqual({ ok: true, data: { withinLimits: false, ncrId: NCR_ID, outboxEmitted: true } });
    const ncrInsert = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).startsWith('insert into public.ncr_reports'));
    expect(ncrInsert?.[1]?.[0]).toBe('CCP Breach: CCP-COOK');
    const breachLink = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).startsWith('update public.haccp_monitoring_log'));
    expect(breachLink?.[1]).toEqual([LOG_ID, NCR_ID]);
    const outbox = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).startsWith('insert into public.outbox_events'));
    expect(normalize(String(outbox?.[0]))).toContain("'quality.ncr.opened'");
    expect(outbox?.[1]?.[0]).toBe(NCR_ID);
    const deviationInsert = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).startsWith('insert into public.ccp_deviations'));
    expect(deviationInsert?.[1]).toEqual([
      CCP_ID,
      LOG_ID,
      '69.9999',
      'C',
      'Auto-hold not created: no work order target was provided.',
      USER_ID,
    ]);
  });

  it('recordMonitoring bilateral breach returns within_limits=false and creates NCR', async () => {
    ccpLimits = { min: '70.0000', max: '75.0000' };

    const result = await recordMonitoring({ ccpId: CCP_ID, measuredValue: '75.0001' });

    expect(result).toEqual({ ok: true, data: { withinLimits: false, ncrId: NCR_ID, outboxEmitted: true } });
    const ncrInsert = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).startsWith('insert into public.ncr_reports'));
    expect(ncrInsert).toBeTruthy();
    const logInsert = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).startsWith('insert into public.haccp_monitoring_log'),
    );
    expect(logInsert?.[1]?.[3]).toBe(false);
  });

  it('recordMonitoring breach with woId holds every output LP in the breach window plus the WO', async () => {
    ccpLimits = { min: '70.0000', max: null };

    const result = await recordMonitoring({ ccpId: CCP_ID, measuredValue: '69.9999', woId: WO_ID });

    expect(result).toEqual({ ok: true, data: { withinLimits: false, ncrId: NCR_ID, outboxEmitted: true } });
    const outputLookup = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).includes('from public.wo_outputs o'));
    expect(outputLookup?.[1]).toEqual([WO_ID, '2026-06-23T08:00:00.000Z']);
    const holdInserts = vi
      .mocked(client.query)
      .mock.calls.filter(([sql]) => normalize(String(sql)).startsWith('insert into public.quality_holds'));
    expect(holdInserts.map((call) => call[1]?.[0])).toEqual(['lp', 'lp', 'wo']);
    expect(holdInserts.map((call) => call[1]?.[1])).toEqual([LP_ID, LP_ID_2, WO_ID]);
    expect(holdInserts[2]?.[1]).toEqual([
      'wo',
      WO_ID,
      null,
      'CCP breach CCP-COOK: measured value 69.9999 was outside configured limits.',
      'critical',
      null,
      USER_ID,
      SITE_ID,
      null,
    ]);
    const holdLink = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).startsWith('update public.ccp_deviations') && normalize(String(sql)).includes('set hold_id'));
    expect(holdLink?.[1]).toEqual([DEVIATION_ID, HOLD_ID]);
    const holdOutbox = vi.mocked(client.query).mock.calls.find(
      ([sql, params]) => normalize(String(sql)).startsWith('insert into public.outbox_events') && params?.[1] === HOLD_ID,
    );
    expect(holdOutbox?.[1]?.[0]).toBe('quality.hold.created');
  });

  it('recordMonitoring breach without woId opens a deviation with hold_id null', async () => {
    ccpLimits = { min: '70.0000', max: null };

    const result = await recordMonitoring({ ccpId: CCP_ID, measuredValue: '69.9999' });

    expect(result.ok).toBe(true);
    const deviationInsert = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).startsWith('insert into public.ccp_deviations'));
    expect(deviationInsert?.[1]?.[4]).toBe('Auto-hold not created: no work order target was provided.');
    const holdLink = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).startsWith('update public.ccp_deviations') && normalize(String(sql)).includes('set hold_id'));
    expect(holdLink).toBeUndefined();
  });

  it('resolveCcpDeviation requires e-sign and flips the deviation to resolved', async () => {
    const result = await resolveCcpDeviation(DEVIATION_ID, {
      actionTaken: 'Batch quarantined and root cause reviewed',
      disposition: 'corrected',
      signature: { password: 'pin-1234' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected deviation resolution to succeed');
    expect(result.data.status).toBe('resolved');
    expect(vi.mocked(signEvent)).toHaveBeenCalledWith(
      {
        signerUserId: USER_ID,
        pin: 'pin-1234',
        intent: 'qa.haccp.ccp.deviation',
        subject: {
          deviationId: DEVIATION_ID,
          ccpId: CCP_ID,
          ccpCode: 'CCP-COOK',
          monitoringLogId: LOG_ID,
          measuredValue: '69.9999',
          disposition: 'corrected',
        },
        reason: 'CCP deviation resolution',
      },
      { client },
    );
    const update = vi.mocked(client.query).mock.calls.find(([sql]) => normalize(String(sql)).startsWith('update public.ccp_deviations') && normalize(String(sql)).includes("set status = 'resolved'"));
    expect(update?.[1]).toEqual([
      DEVIATION_ID,
      'Batch quarantined and root cause reviewed',
      'corrected',
      USER_ID,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ]);
  });

  it('re-recording the same monitoring_log_id does not double-open a deviation', async () => {
    ccpLimits = { min: '70.0000', max: null };

    await recordMonitoring({ ccpId: CCP_ID, measuredValue: '69.9999' });
    await recordMonitoring({ ccpId: CCP_ID, measuredValue: '69.9999' });

    const deviationInserts = vi
      .mocked(client.query)
      .mock.calls.filter(([sql]) => normalize(String(sql)).startsWith('insert into public.ccp_deviations'));
    expect(deviationInserts).toHaveLength(1);
  });

  // ── FIX 2: relaxed board READ gate (plan_edit OR ccp.deviation_override) ──────

  it('listCcps is allowed for a user with ONLY ccp.deviation_override (relaxed read gate)', async () => {
    permissions = new Set(['quality.ccp.deviation_override']);
    const result = await listCcps({ activeOnly: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data[0]?.ccpCode).toBe('CCP-COOK');
  });

  it('listCcps is allowed for a user with ONLY quality.haccp.plan_edit', async () => {
    permissions = new Set(['quality.haccp.plan_edit']);
    const result = await listCcps({ activeOnly: true });
    expect(result.ok).toBe(true);
  });

  it('listMonitoringLog is allowed for a user with ONLY ccp.deviation_override (relaxed read gate)', async () => {
    permissions = new Set(['quality.ccp.deviation_override']);
    const result = await listMonitoringLog({ days: 366 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data[0]?.ccpCode).toBe('CCP-COOK');
  });

  it('listCcps + listMonitoringLog stay FORBIDDEN for a user with NEITHER permission', async () => {
    permissions = new Set(['quality.dashboard.view']);
    await expect(listCcps({})).resolves.toMatchObject({ ok: false, reason: 'forbidden' });
    await expect(listMonitoringLog({})).resolves.toMatchObject({ ok: false, reason: 'forbidden' });
  });

  it('upsertCcp stays plan_edit-ONLY: forbidden for a user with only ccp.deviation_override', async () => {
    permissions = new Set(['quality.ccp.deviation_override']);
    const result = await upsertCcp({
      ccp_code: 'CCP-NEW',
      name: 'New CCP',
      process_step: 'Step',
      hazard_type: 'biological',
    });
    expect(result).toMatchObject({ ok: false, reason: 'forbidden' });
    const insert = vi.mocked(client.query).mock.calls.find(([sql]) =>
      normalize(String(sql)).startsWith('insert into public.haccp_ccps'),
    );
    expect(insert).toBeUndefined();
  });

  // ── S2: hold existence short-circuit idempotency ──────────────────────────

  it('S2 createCcpDeviationHoldIfMissing: when an active hold already exists for the LP, no new INSERT happens', async () => {
    ccpLimits = { min: '70.0000', max: null };

    // Simulate LP_ID and LP_ID_2 already having open holds.
    existingHoldsForReference = new Set([LP_ID, LP_ID_2, WO_ID]);

    const result = await recordMonitoring({ ccpId: CCP_ID, measuredValue: '69.9999', woId: WO_ID });

    expect(result.ok).toBe(true);
    // The action must succeed — it reuses the existing hold ID, not an error.
    expect(result).toMatchObject({ ok: true, data: { withinLimits: false, ncrId: NCR_ID, outboxEmitted: true } });

    // No new quality_holds INSERT must have happened (all references returned an
    // existing row from findActiveHoldForReference).
    const holdInserts = vi
      .mocked(client.query)
      .mock.calls.filter(([sql]) => normalize(String(sql)).startsWith('insert into public.quality_holds'));
    expect(holdInserts).toHaveLength(0);
  });

  it('S2 createCcpDeviationHoldIfMissing: when only the WO already has a hold but LPs do not, LP holds are inserted and WO hold is reused', async () => {
    ccpLimits = { min: '70.0000', max: null };

    // Only the WO already has a hold; LP_ID and LP_ID_2 do not.
    existingHoldsForReference = new Set([WO_ID]);

    const result = await recordMonitoring({ ccpId: CCP_ID, measuredValue: '69.9999', woId: WO_ID });

    expect(result.ok).toBe(true);

    const holdInserts = vi
      .mocked(client.query)
      .mock.calls.filter(([sql]) => normalize(String(sql)).startsWith('insert into public.quality_holds'));
    // LP holds were inserted (LP_ID and LP_ID_2); the WO hold was NOT re-inserted.
    const insertedRefIds = holdInserts.map((call) => call[1]?.[1]);
    expect(insertedRefIds).toContain(LP_ID);
    expect(insertedRefIds).toContain(LP_ID_2);
    expect(insertedRefIds).not.toContain(WO_ID);
  });
});
