import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../../../../lib/i18n/revalidate-localized', () => ({
  revalidateLocalized: vi.fn(),
}));

type Handler = (sql: string, params?: readonly unknown[]) => { rows: unknown[] };

const ctx = {
  userId: '00000000-0000-4000-8000-0000000000aa',
  orgId: '00000000-0000-4000-8000-00000000000a',
  handler: (() => ({ rows: [] })) as Handler,
};

vi.mock('../../../../../../../../../lib/auth/with-org-context', () => ({
  withOrgContext: async (action: (c: unknown) => Promise<unknown>) =>
    action({
      userId: ctx.userId,
      orgId: ctx.orgId,
      client: {
        query: async (sql: string, params?: readonly unknown[]) => ctx.handler(sql, params),
      },
    }),
}));

import { revalidateLocalized } from '../../../../../../../../../lib/i18n/revalidate-localized';
import { voidTrialBatch } from '../void-trial-batch';

const PROJECT = '00000000-0000-4000-8000-0000000000b1';
const BATCH = '00000000-0000-4000-8000-0000000000d1';
const VALID = { id: BATCH, projectId: PROJECT, reasonCode: 'entry_error' as const, note: 'wrong run' };

function handler(opts: {
  granted?: boolean;
  exists?: boolean;
  alreadyVoided?: boolean;
  /** false = the UPDATE matched no row (lost a race with a concurrent void). */
  updateHits?: boolean;
  hasBooking?: boolean;
  /** An active, verified, non-superseded G4 e-sign approval exists. */
  gateApproved?: boolean;
}): Handler {
  return (sql) => {
    if (sql.includes('from public.user_roles')) {
      return { rows: [{ ok: opts.granted !== false }] };
    }
    if (sql.includes('from public.gate_approvals')) {
      return { rows: opts.gateApproved ? [{ ok: true }] : [] };
    }
    if (sql.includes('select id::text') && sql.includes('from public.trial_batches')) {
      return {
        rows:
          opts.exists === false
            ? []
            : [
                {
                  id: BATCH,
                  trial_no: 'T-012',
                  result: 'pass',
                  yield_pct: '52.35',
                  batch_size_kg: '12.345',
                  voided_at: opts.alreadyVoided ? '2026-07-20T10:00:00Z' : null,
                },
              ],
      };
    }
    if (sql.includes('update public.trial_batches')) {
      return {
        rows:
          opts.updateHits === false
            ? []
            : [{ id: BATCH, voided_at: '2026-07-23T09:00:00Z' }],
      };
    }
    if (sql.includes('delete from public.planning_capacity_blocks')) {
      return {
        rows: opts.hasBooking
          ? [
              {
                id: 'block-1',
                line_id: 'line-1',
                line_code: 'L1',
                line_name: 'Slicing line 1',
                project_id: PROJECT,
                trial_id: BATCH,
                label: 'NPD-001 trial T-012',
                block_date: '2026-08-01',
                start_time: '09:00:00',
                end_time: '12:00:00',
                block_type: 'npd_trial',
              },
            ]
          : [],
      };
    }
    if (sql.includes('insert into public.audit_events')) return { rows: [] };
    return { rows: [] };
  };
}

beforeEach(() => {
  ctx.handler = () => ({ rows: [] });
  vi.mocked(revalidateLocalized).mockClear();
});

describe('voidTrialBatch', () => {
  it('requires a reason code — a void with no reason never reaches the DB', async () => {
    const result = await voidTrialBatch({ id: BATCH, projectId: PROJECT });
    expect(result).toEqual(expect.objectContaining({ ok: false, error: 'invalid_input' }));
  });

  it('rejects a reason code outside the curated list', async () => {
    const result = await voidTrialBatch({ ...VALID, reasonCode: 'because' });
    expect(result).toEqual(expect.objectContaining({ ok: false, error: 'invalid_input' }));
  });

  it('returns forbidden without npd.trial.write', async () => {
    ctx.handler = handler({ granted: false });
    expect(await voidTrialBatch(VALID)).toEqual({ ok: false, error: 'forbidden' });
  });

  it('returns not_found for a trial outside this org/project', async () => {
    ctx.handler = handler({ exists: false });
    expect(await voidTrialBatch(VALID)).toEqual({ ok: false, error: 'not_found' });
  });

  it('refuses to void twice', async () => {
    ctx.handler = handler({ alreadyVoided: true });
    expect(await voidTrialBatch(VALID)).toEqual({ ok: false, error: 'already_voided' });
  });

  it('reports a lost race as already_voided, not persistence_failed', async () => {
    ctx.handler = handler({ updateHits: false });
    expect(await voidTrialBatch(VALID)).toEqual({ ok: false, error: 'already_voided' });
  });

  it('refuses to void evidence under a signed G4 approval', async () => {
    const calls: string[] = [];
    ctx.handler = (sql, params) => {
      calls.push(sql);
      return handler({ gateApproved: true })(sql, params);
    };

    expect(await voidTrialBatch(VALID)).toEqual({ ok: false, error: 'gate_approved' });
    // Nothing was withdrawn and no slot was freed.
    expect(calls.some((sql) => /update public\.trial_batches/.test(sql))).toBe(false);
    expect(calls.some((sql) => /delete from public\.planning_capacity_blocks/.test(sql))).toBe(
      false,
    );
  });

  it('stamps who/when/why, releases the booked line time, and audits it', async () => {
    const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];
    ctx.handler = (sql, params) => {
      calls.push({ sql, params });
      return handler({ hasBooking: true })(sql, params);
    };

    const result = await voidTrialBatch(VALID);

    expect(result).toEqual({ ok: true, data: { id: BATCH, releasedLineTime: true } });

    const select = calls.find(({ sql }) => /select id::text[\s\S]*from public\.trial_batches/.test(sql));
    // Locks the trial so a concurrent booking cannot reserve time for it.
    expect(select?.sql).toContain('for update');

    const update = calls.find(({ sql }) => /update public\.trial_batches/.test(sql));
    expect(update?.sql).toContain('voided_at        = now()');
    // Guard against a concurrent void slipping through.
    expect(update?.sql).toContain('voided_at is null');
    expect(update?.params).toEqual([BATCH, PROJECT, ctx.userId, 'entry_error', 'wrong run']);

    // The reservation is actually freed — a withdrawn trial keeps no line slot.
    expect(calls.some(({ sql }) => /delete from public\.planning_capacity_blocks/.test(sql))).toBe(
      true,
    );

    const audits = calls.filter(({ sql }) => /insert into public\.audit_events/.test(sql));
    const voidAudit = audits.find(({ sql }) => sql.includes('npd.trial_batch.voided'));
    // before_state keeps the pre-image; after_state carries the reason + release.
    expect(JSON.parse(String(voidAudit?.params?.[2]))).toEqual(
      expect.objectContaining({ trialNo: 'T-012', result: 'pass', yieldPct: '52.35' }),
    );
    expect(JSON.parse(String(voidAudit?.params?.[3]))).toEqual(
      expect.objectContaining({
        reasonCode: 'entry_error',
        note: 'wrong run',
        releasedLineTime: true,
        voidedBy: ctx.userId,
      }),
    );

    // The freed slot needs its OWN full pre-image — a boolean cannot tell you
    // which line and which window were handed back.
    const releaseAudit = audits.find(({ sql }) =>
      sql.includes('npd.trial_line_time.released'),
    );
    expect(releaseAudit).toBeDefined();
    expect(JSON.parse(String(releaseAudit?.params?.[2]))).toEqual(
      expect.objectContaining({
        trialId: BATCH,
        projectId: PROJECT,
        lineId: 'line-1',
        lineCode: 'L1',
        blockDate: '2026-08-01',
        startTime: '09:00:00',
        endTime: '12:00:00',
      }),
    );

    expect(vi.mocked(revalidateLocalized)).toHaveBeenCalledWith(
      `/pipeline/${PROJECT}/trial`,
      'page',
    );
  });

  it('voids a trial that never booked line time', async () => {
    const calls: string[] = [];
    ctx.handler = (sql, params) => {
      calls.push(sql);
      return handler({ hasBooking: false })(sql, params);
    };
    expect(await voidTrialBatch(VALID)).toEqual({
      ok: true,
      data: { id: BATCH, releasedLineTime: false },
    });
    // No slot was freed, so no release event should be fabricated.
    expect(calls.some((sql) => sql.includes('npd.trial_line_time.released'))).toBe(false);
  });
});
